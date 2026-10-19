// Give providers that applied before business accounts a `providerType: 'individual'`.
//
// `users.providerType` / `instructors.providerType` are written by applyAsProvider since the
// business-accounts work. Everyone who applied earlier has no field, so the admin providers
// list's "Privati" filter (`providerType == 'individual'`) misses them: run this (with --apply)
// per environment before relying on that filter.
//
// A users document qualifies when it has NO providerType (absent or null) and either a
// providerStatus of pending / verified / rejected or role 'provider'. Its instructors/{uid}
// document, when it exists and also lacks a providerType, gets the same value. Anything that
// already has a value is never touched; an account whose instructors document carries a
// `business` map is skipped and reported (it should already be 'business' — look at it by hand).
// Each write is guarded by the document's updateTime, so one changed between read and write is
// skipped (reported as "skipped (changed)", exit code unaffected), not clobbered.
// Idempotent: a second run reports 0 documents to update.
//
//   node scripts/backfill-provider-type.mjs                               # emulator, dry run
//   node scripts/backfill-provider-type.mjs --project vfit-app-staging    # dry run
//   node scripts/backfill-provider-type.mjs --project vfit-app-staging --apply
//
// Against a real project it uses Application Default Credentials. Without --project it talks to
// the Firestore emulator (GCLOUD_PROJECT picks the emulator namespace, default vfit-funlife).

import admin from "firebase-admin";

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const apply = args.includes("--apply");
const useEmulator = !project;
const SAMPLE = 10;
const APPLICATION_STATES = new Set(["pending", "verified", "rejected"]);

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
} else {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const projectId = project ?? process.env.GCLOUD_PROJECT ?? "vfit-funlife";
admin.initializeApp({ projectId });
const db = admin.firestore();

const missing = (data) => data.providerType === undefined || data.providerType === null;

const target = useEmulator ? `the emulator (${projectId})` : projectId;
console.log(`${apply ? "APPLY" : "DRY RUN"} — backfilling providerType: 'individual' on ${target}\n`);

const usersSnap = await db.collection("users").get();
const candidates = usersSnap.docs.filter((d) => {
  const data = d.data();
  return missing(data) && (APPLICATION_STATES.has(data.providerStatus) || data.role === "provider");
});

const instructorRefs = candidates.map((d) => db.collection("instructors").doc(d.id));
const instructorSnaps = instructorRefs.length ? await db.getAll(...instructorRefs) : [];

const plan = [];
const skippedBusiness = [];
let alreadyTyped = 0;
candidates.forEach((userDoc, i) => {
  const instructor = instructorSnaps[i];
  if (instructor.exists && instructor.data().business) {
    skippedBusiness.push(userDoc.id);
    return;
  }
  plan.push({ ref: userDoc.ref, updateTime: userDoc.updateTime });
  if (instructor.exists) {
    if (missing(instructor.data())) plan.push({ ref: instructor.ref, updateTime: instructor.updateTime });
    else alreadyTyped++;
  }
});

const usersToUpdate = plan.filter((p) => p.ref.parent.id === "users");
const instructorsToUpdate = plan.filter((p) => p.ref.parent.id === "instructors");
const sample = (items) => `[${items.slice(0, SAMPLE).map((p) => p.ref.id).join(", ")}${items.length > SAMPLE ? ", …" : ""}]`;

console.log(`users scanned:                      ${usersSnap.size}`);
console.log(`users to update:                    ${usersToUpdate.length}   ${sample(usersToUpdate)}`);
console.log(`instructors to update:              ${instructorsToUpdate.length}   ${sample(instructorsToUpdate)}`);
console.log(`instructors already typed (kept):   ${alreadyTyped}`);
console.log(`skipped, instructor has business:   ${skippedBusiness.length}   [${skippedBusiness.slice(0, SAMPLE).join(", ")}]`);

if (!apply) {
  console.log(`\nDry run: nothing written. Re-run with --apply to write.`);
  process.exit(0);
}

const FAILED_PRECONDITION = 9;
let written = 0;
let changed = 0;
let failed = 0;
const failures = [];
const writer = db.bulkWriter();
writer.onWriteError((err) => {
  // The doc changed after we read it (updateTime guard): skip it, do not retry; re-running
  // picks it up with fresh data.
  if (err.code === FAILED_PRECONDITION) return false;
  return err.failedAttempts < 5;
});
for (const { ref, updateTime } of plan) {
  writer
    .update(ref, { providerType: "individual" }, { lastUpdateTime: updateTime })
    .then(() => written++)
    .catch((err) => {
      if (err.code === FAILED_PRECONDITION) {
        changed++;
        return;
      }
      failed++;
      failures.push(`${ref.path}: ${err.code ?? ""} ${err.message}`);
    });
}
await writer.close();

console.log(
  `\nSummary: ${written} updated, ${changed} skipped (changed, re-run to pick them up), ` +
    `${failed} failed (of ${plan.length} planned).`,
);
for (const f of failures.slice(0, 20)) console.log(`  ! ${f}`);
// Only real write errors fail the run: a document edited between our read and write is not an error.
process.exit(failed ? 1 : 0);

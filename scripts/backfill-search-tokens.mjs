// P2-5: give every `users` document the derived admin-index fields the admin users/providers
// lists now query server-side (see functions/src/users/adminIndex.ts):
//
//   - searchTokens          prefixes of name / email / phone digits (array-contains search)
//   - adminHidden           soft-deleted or seeded demo account
//   - providerVerification  'verified' | 'pending' | 'rejected' | null
//
// plus the two fields every list query depends on, only where missing (as the
// onUserWriteAdminIndex trigger does): createdAt (<- the document's createTime) and
// isSuspended (<- false).
//
// Until a document carries these, it is invisible to the new list queries — so run this
// (with --apply) BEFORE shipping the client that queries them, and after deploying the
// trigger, which keeps them current from then on.
//
// Computation is imported from functions/src/users/adminIndex.ts — the exact code the trigger
// runs (Node >= 22.18 strips its TypeScript types natively). Each write is guarded by the
// document's updateTime, so a doc changed between read and write is skipped, not clobbered.
// Idempotent: a second run reports 0 documents to update.
//
//   node scripts/backfill-search-tokens.mjs                               # emulator, dry run
//   node scripts/backfill-search-tokens.mjs --project vfit-app-staging    # dry run
//   node scripts/backfill-search-tokens.mjs --project vfit-app-staging --apply
//
// Against a real project it uses Application Default Credentials, like
// backfill-user-fields.mjs. Once the trigger is deployed, each write here fires it once; it
// finds the document already up to date and writes nothing.

import admin from "firebase-admin";

// functions/package.json has no "type", so Node warns that it re-parses the .ts file as an ES
// module. Harmless here; keep the output readable.
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(w);
});
const { adminIndexPatch, computeAdminIndex } = await import("../functions/src/users/adminIndex.ts");

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const apply = args.includes("--apply");
const useEmulator = !project;
const SAMPLE = 10;

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
} else {
  // Same guard as seed-demo-accounts.mjs: never let a leaked emulator env redirect a
  // "real" run into a local emulator (or vice versa).
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const projectId = project ?? "vfit-funlife";
admin.initializeApp({ projectId });
const db = admin.firestore();

const target = useEmulator ? `the emulator (${projectId})` : projectId;
console.log(`${apply ? "APPLY" : "DRY RUN"} — backfilling users admin-index fields on ${target}\n`);

const snap = await db.collection("users").get();

const counts = { searchTokens: 0, adminHidden: 0, providerVerification: 0, createdAt: 0, isSuspended: 0 };
const toUpdate = [];
const plan = []; // { ref, updateTime, patch }
const hidden = [];
const verification = { verified: 0, pending: 0, rejected: 0, none: 0 };
let maxTokens = 0;

for (const doc of snap.docs) {
  const data = doc.data();
  const derived = computeAdminIndex(doc.id, data);
  if (derived.adminHidden) hidden.push(doc.id);
  verification[derived.providerVerification ?? "none"]++;
  maxTokens = Math.max(maxTokens, derived.searchTokens.length);

  const patch = { ...(adminIndexPatch(doc.id, data) ?? {}) };
  if (data.createdAt === undefined || data.createdAt === null) patch.createdAt = doc.createTime;
  if (!Object.prototype.hasOwnProperty.call(data, "isSuspended")) patch.isSuspended = false;
  for (const key of Object.keys(patch)) counts[key]++;
  if (Object.keys(patch).length) {
    toUpdate.push(doc.id);
    plan.push({ ref: doc.ref, updateTime: doc.updateTime, patch });
  }
}

const sample = (ids) => (ids.length ? ids.slice(0, SAMPLE).join(", ") + (ids.length > SAMPLE ? ", …" : "") : "-");
console.log(`users scanned:                  ${snap.size}`);
console.log(`adminHidden (deleted/demo):     ${hidden.length}   [${sample(hidden)}]`);
console.log(
  `providerVerification:           verified ${verification.verified}, pending ${verification.pending}, ` +
    `rejected ${verification.rejected}, not a provider ${verification.none}`
);
console.log(`largest searchTokens array:     ${maxTokens}`);
console.log(`fields to write:                ${JSON.stringify(counts)}`);
console.log(`documents to update:            ${plan.length}   [${sample(toUpdate)}]`);

if (!apply) {
  console.log(`\nDry run: nothing written. Re-run with --apply to write.`);
  process.exit(0);
}

let written = 0;
let failed = 0;
const failures = [];
const writer = db.bulkWriter();
writer.onWriteError((err) => {
  // A failed precondition means the doc changed after we read it: skip it, don't retry
  // blindly with a stale patch. Re-running the script picks it up with fresh data.
  if (err.code === 9 /* FAILED_PRECONDITION */) return false;
  return err.failedAttempts < 5;
});

for (const { ref, updateTime, patch } of plan) {
  writer
    .update(ref, patch, { lastUpdateTime: updateTime })
    .then(() => written++)
    .catch((err) => {
      failed++;
      failures.push(`${ref.id}: ${err.code ?? ""} ${err.message}`);
    });
}
await writer.close();

console.log(`\nSummary: ${written} updated, ${failed} failed (of ${plan.length} planned).`);
for (const f of failures.slice(0, 20)) console.log(`  ! ${f}`);
process.exit(failed ? 1 : 0);

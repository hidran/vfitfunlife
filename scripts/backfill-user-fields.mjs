// P0-9: normalize `users` documents so admin queries see every user.
//
//   - `createdAt` missing/null  -> the document's own createTime (a Firestore Timestamp).
//     Without it, `orderBy('createdAt')` silently drops the document from the result.
//   - `isSuspended` absent      -> false.
//
// Existing values are never overwritten: each write is guarded by the document's
// updateTime (lastUpdateTime precondition), so a doc changed between read and write is
// skipped, not clobbered. Re-running is safe; a second run reports 0.
//
//   node scripts/backfill-user-fields.mjs                               # emulator, dry run
//   node scripts/backfill-user-fields.mjs --project vfit-app-staging    # dry run
//   node scripts/backfill-user-fields.mjs --project vfit-app-staging --apply
//
// Against a real project it uses Application Default Credentials, like
// seed-demo-accounts.mjs. There are no Firestore triggers on users/{uid}, so these writes
// have no side effects (no notifications, no recomputation).

import admin from "firebase-admin";

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
console.log(`${apply ? "APPLY" : "DRY RUN"} — backfilling users.createdAt / users.isSuspended on ${target}\n`);

const snap = await db.collection("users").get();

const needCreatedAt = [];
const needIsSuspended = [];
const plan = []; // { ref, updateTime, patch }

for (const doc of snap.docs) {
  const data = doc.data();
  const patch = {};
  if (data.createdAt === undefined || data.createdAt === null) {
    patch.createdAt = doc.createTime; // Timestamp
    needCreatedAt.push(doc.id);
  }
  if (!Object.prototype.hasOwnProperty.call(data, "isSuspended")) {
    patch.isSuspended = false;
    needIsSuspended.push(doc.id);
  }
  if (Object.keys(patch).length) plan.push({ ref: doc.ref, updateTime: doc.updateTime, patch });
}

const sample = (ids) => (ids.length ? ids.slice(0, SAMPLE).join(", ") + (ids.length > SAMPLE ? ", …" : "") : "-");
console.log(`users scanned:             ${snap.size}`);
console.log(`missing createdAt:         ${needCreatedAt.length}   [${sample(needCreatedAt)}]`);
console.log(`missing isSuspended:       ${needIsSuspended.length}   [${sample(needIsSuspended)}]`);
console.log(`documents to update:       ${plan.length}`);

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

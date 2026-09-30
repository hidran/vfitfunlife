// Give every `instructors` document the `searchTerms` array the customer's "Book a service"
// text search now queries (see functions/src/providers/searchIndex.ts).
//
// Until a provider carries it, typing their name in the search box doesn't find them — so run
// this (with --apply) BEFORE shipping the client that queries it, and after deploying the
// onInstructorWriteSearchIndex trigger, which keeps it current from then on.
//
// Computation is imported from functions/src/providers/searchIndex.ts — the exact code the
// trigger runs (Node >= 22.18 strips its TypeScript types natively). Each write is guarded by
// the document's updateTime, so a doc changed between read and write is skipped, not
// clobbered. Idempotent: a second run reports 0 documents to update.
//
//   node scripts/backfill-provider-search.mjs                               # emulator, dry run
//   node scripts/backfill-provider-search.mjs --project vfit-app-staging    # dry run
//   node scripts/backfill-provider-search.mjs --project vfit-app-staging --apply
//
// Against a real project it uses Application Default Credentials.

import admin from "firebase-admin";

// functions/package.json has no "type", so Node warns that it re-parses the .ts file as an ES
// module. Harmless here; keep the output readable.
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(w);
});
const { providerSearchPatch } = await import("../functions/src/providers/searchIndex.ts");

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const apply = args.includes("--apply");
const useEmulator = !project;
const SAMPLE = 10;

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
} else {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const projectId = project ?? "vfit-funlife";
admin.initializeApp({ projectId });
const db = admin.firestore();

const target = useEmulator ? `the emulator (${projectId})` : projectId;
console.log(`${apply ? "APPLY" : "DRY RUN"} — backfilling instructors.searchTerms on ${target}\n`);

const snap = await db.collection("instructors").get();
const plan = [];
let maxTerms = 0;
for (const doc of snap.docs) {
  const patch = providerSearchPatch(doc.data());
  if (!patch) continue;
  maxTerms = Math.max(maxTerms, patch.searchTerms.length);
  plan.push({ ref: doc.ref, updateTime: doc.updateTime, patch });
}

const ids = plan.map((p) => p.ref.id);
console.log(`instructors scanned:       ${snap.size}`);
console.log(`largest searchTerms array: ${maxTerms}`);
console.log(
  `documents to update:       ${plan.length}   [${ids.slice(0, SAMPLE).join(", ")}${ids.length > SAMPLE ? ", …" : ""}]`
);

if (!apply) {
  console.log(`\nDry run: nothing written. Re-run with --apply to write.`);
  process.exit(0);
}

let written = 0;
let failed = 0;
const failures = [];
const writer = db.bulkWriter();
writer.onWriteError((err) => {
  // The doc changed after we read it: skip it; re-running picks it up with fresh data.
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

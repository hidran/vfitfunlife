// P2 (unified courses, task L4, spec section 7): delete the documents of the removed partner-gym flow.
//
// The six collections below held only QA data on staging; production never ran the gym flow, so this script
// REFUSES every project except `vfit-app-staging` (in particular `vfit-funlife`, production).
//
//   node scripts/cleanup-gym-collections.mjs                               # emulator (localhost:8080, demo-vfit), dry run
//   node scripts/cleanup-gym-collections.mjs --apply                       # emulator, delete
//   node scripts/cleanup-gym-collections.mjs --project vfit-app-staging    # staging, dry run (counts only)
//   node scripts/cleanup-gym-collections.mjs --project vfit-app-staging --apply
//
// Dry run is the default and never writes. With --apply every document of the six collections (including parents
// that only still have subcollections) and its subcollections is removed in bounded pages of PAGE documents through
// one BulkWriter; the script prints `collection: before -> after` and exits non-zero if anything is left.
// Idempotent: a second run prints 0 -> 0.
//
// A real project uses Application Default Credentials, like backfill-search-tokens.mjs.

import admin from "firebase-admin";

const COLLECTIONS = [
  "gymSeries", "gymSessions", "gymBookings", "gymSessionMembers", "gymScheduleLocks", "gymNotifications",
];
const ALLOWED_PROJECT = "vfit-app-staging";
const EMULATOR_PROJECT = "demo-vfit";
const PAGE = 200;

function refuse(message) {
  console.error(`refusing: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let project = null;
let apply = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--apply") apply = true;
  else if (arg === "--project") project = args[++i] ?? "";
  else if (arg.startsWith("--project=")) project = arg.slice("--project=".length);
  else refuse(`unknown argument ${arg} (use --project vfit-app-staging and/or --apply)`);
}
if (project !== null && project !== ALLOWED_PROJECT) {
  refuse(`project "${project}" - this script only runs against ${ALLOWED_PROJECT} (or the emulator without --project)`);
}

const useEmulator = project === null;
if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
} else {
  // Never let a leaked emulator env redirect a "real" run into a local emulator.
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const projectId = useEmulator ? EMULATOR_PROJECT : project;
admin.initializeApp({ projectId });
const db = admin.firestore();
// Belt and braces: whatever the SDK resolved, a non-emulator run must be staging.
if (!useEmulator && admin.app().options.projectId !== ALLOWED_PROJECT) refuse("resolved project is not staging");

const target = useEmulator ? `the emulator (${process.env.FIRESTORE_EMULATOR_HOST}, ${projectId})` : projectId;
console.log(`${apply ? "APPLY" : "DRY RUN"} - partner-gym collections on ${target}\n`);

const count = async (name) => (await db.collection(name).count().get()).data().count;

const before = {};
for (const name of COLLECTIONS) before[name] = await count(name);

if (apply) {
  const writer = db.bulkWriter();
  writer.onWriteError((error) => {
    // Let BulkWriter retry transient failures (it backs off); give up on the rest so the script cannot loop forever.
    if (error.failedAttempts < 5) return true;
    console.error(`giving up on ${error.documentRef.path}: ${error.message}`);
    return false;
  });
  for (const name of COLLECTIONS) {
    const seen = new Set();
    for (;;) {
      // listDocuments also returns "missing" parents that only have subcollections left, which a query would skip.
      const refs = await db.collection(name).listDocuments();
      if (!refs.length) break;
      // The same document coming back after its delete means the deletes are failing: stop instead of spinning.
      if (refs.some((ref) => seen.has(ref.path))) refuse(`${name}: documents are not being deleted, aborting`);
      for (let at = 0; at < refs.length; at += PAGE) {
        for (const ref of refs.slice(at, at + PAGE)) {
          seen.add(ref.path);
          await db.recursiveDelete(ref, writer);
        }
        await writer.flush();
      }
    }
  }
  await writer.close();
}

const after = {};
for (const name of COLLECTIONS) after[name] = apply ? await count(name) : before[name];

for (const name of COLLECTIONS) console.log(`${name}: ${before[name]} -> ${after[name]}`);

if (!apply) {
  console.log("\ndry run - pass --apply to delete");
  process.exit(0);
}
const left = COLLECTIONS.filter((name) => after[name] !== 0);
if (left.length) {
  console.error(`\nnot empty after delete: ${left.join(", ")}`);
  process.exit(2);
}
console.log("\ndone - all six collections are empty");

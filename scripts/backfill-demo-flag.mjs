// D5: stamp `isDemo: true` on the demo data seeded before the flag existed, so it drops out of
// every stat and metric (admin dashboard, metrics_daily, leaderboard, public ratings).
//
// Which documents are demo is decided by the SAME code the functions use
// (functions/src/lib/demo.ts, loaded from the compiled functions/lib), so the backfill and the
// runtime fallbacks cannot disagree:
//   users         isDemo, an @vitfitdemo.dev email, or a demo-* id (demo-customer-vfit, …)
//   instructors   the same, or the instructors doc of a demo user (demo.provider may sit on an
//                 adopted uid, and its instructors doc has no email)
//   bookings      a demo-* id (demo-booking-*), or a booking BY a demo customer or WITH a demo
//                 trainer (userId / instructorId is a demo account, or userEmail is a demo email)
//   clients       a roster entry whose customer or trainer is a demo account (demo-client-*)
//   reviews       (collection group) a review of a demo booking, or written by a demo account
//   transactions  the fake ledger rows seedData writes (ids tx-1 … tx-10)
// It only ever ADDS `isDemo: true` — never removes it, never writes `false`, never touches
// updatedAt. Re-running is safe; a run after --apply reports 0 to flag.
//
// When a real trainer or venue had a review from a demo account, its public rating is
// recomputed without it (same rule as submitReview: functions/src/users/reviews.ts).
//
//   npm --prefix functions run build                                  # once, for functions/lib
//   node scripts/backfill-demo-flag.mjs                               # emulator, dry run
//   node scripts/backfill-demo-flag.mjs --project vfit-app-staging    # dry run
//   node scripts/backfill-demo-flag.mjs --project vfit-app-staging --apply
//
// Against a real project it uses Application Default Credentials, like the other scripts.
// After --apply on a project, the next nightly metrics run rebuilds its rollup (ROLLUP_VERSION
// was bumped for D5); the admin dashboard picks the flags up on its next load.

import admin from "firebase-admin";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const libPath = (rel) => fileURLToPath(new URL(`../functions/lib/${rel}`, import.meta.url));
for (const rel of ["lib/demo.js", "users/reviewRules.js"]) {
  if (!existsSync(libPath(rel))) {
    console.error(`Missing ${libPath(rel)}\nRun \`npm --prefix functions run build\` first.`);
    process.exit(1);
  }
}
const { isDemoAccount, isDemoBooking, ratingsForSummary } = require(libPath("lib/demo.js"));
const { computeRatingSummary } = require(libPath("users/reviewRules.js"));

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const apply = args.includes("--apply");
const useEmulator = !project;
const SAMPLE = 10;

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
} else {
  // Never let a leaked emulator env redirect a "real" run into a local emulator (or vice versa).
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const projectId = project ?? "vfit-funlife";
admin.initializeApp({ projectId });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const target = useEmulator ? `the emulator (${projectId})` : projectId;
console.log(`${apply ? "APPLY" : "DRY RUN"} — flagging demo data with isDemo on ${target}\n`);

const [users, instructors, bookings, clients, transactions, reviews] = await Promise.all([
  db.collection("users").get(),
  db.collection("instructors").get(),
  db.collection("bookings").get(),
  db.collection("clients").get(),
  db.collection("transactions").get(),
  db.collectionGroup("reviews").get(),
]);

// --- decide ---------------------------------------------------------------------------------

const demoUserIds = new Set(users.docs.filter((d) => isDemoAccount(d.id, d.data())).map((d) => d.id));
const demoInstructorIds = new Set(
  instructors.docs.filter((d) => demoUserIds.has(d.id) || isDemoAccount(d.id, d.data())).map((d) => d.id),
);
const demoAccountIds = new Set([...demoUserIds, ...demoInstructorIds]);

const demoBookingDocs = bookings.docs.filter((d) => {
  const b = d.data();
  return isDemoBooking(d.id, b) || demoAccountIds.has(b.userId) || demoAccountIds.has(b.instructorId);
});
const demoBookingIds = new Set(demoBookingDocs.map((d) => d.id));

const demoClientDocs = clients.docs.filter((d) => {
  const c = d.data();
  return isDemoAccount(d.id, c) || demoAccountIds.has(c.userId) || demoAccountIds.has(c.providerId);
});

// The fixed ids generateDemoContent (functions/src/seed/seedData.ts) writes; nothing else in the
// codebase writes to `transactions`.
const SEEDED_TX = /^tx-\d+$/;
const demoTransactionDocs = transactions.docs.filter((d) => d.data().isDemo === true || SEEDED_TX.test(d.id));

const demoReviewDocs = reviews.docs.filter((d) => {
  const r = d.data();
  return r.isDemo === true ||
    demoBookingIds.has(r.bookingId ?? d.id) ||
    demoAccountIds.has(r.userId);
});

const plan = [
  ["users", users.docs.filter((d) => demoUserIds.has(d.id))],
  ["instructors", instructors.docs.filter((d) => demoInstructorIds.has(d.id))],
  ["bookings", demoBookingDocs],
  ["clients", demoClientDocs],
  ["transactions", demoTransactionDocs],
  ["reviews", demoReviewDocs],
].map(([name, docs]) => ({
  name,
  demo: docs.length,
  toFlag: docs.filter((d) => d.data().isDemo !== true),
}));

const sample = (docs) =>
  docs.length ? docs.slice(0, SAMPLE).map((d) => d.ref.path).join(", ") + (docs.length > SAMPLE ? ", …" : "") : "-";

for (const p of plan) {
  console.log(`${p.name.padEnd(13)} demo: ${String(p.demo).padStart(4)}   to flag: ${String(p.toFlag.length).padStart(4)}   [${sample(p.toFlag)}]`);
}

// Ratings of REAL trainers/venues that counted a review now flagged as demo.
const ownersToRerate = new Map(); // path -> { ref, kind }
for (const d of demoReviewDocs) {
  if (d.data().isDemo === true) continue;
  const owner = d.ref.parent.parent;
  if (!owner) continue;
  const kind = owner.parent.id; // "instructors" | "venues"
  if (kind === "instructors" && demoAccountIds.has(owner.id)) continue; // a demo trainer counts all
  if (kind !== "instructors" && kind !== "venues") continue;
  ownersToRerate.set(owner.path, { ref: owner, kind });
}
console.log(`ratings to recompute:  ${ownersToRerate.size}   [${[...ownersToRerate.keys()].slice(0, SAMPLE).join(", ") || "-"}]`);

if (!apply) {
  console.log(`\nDry run: nothing written. Re-run with --apply to write.`);
  process.exit(0);
}

// --- write ----------------------------------------------------------------------------------

let written = 0;
let failed = 0;
const failures = [];
const writer = db.bulkWriter();
writer.onWriteError((err) => err.failedAttempts < 5);
const track = (op, path) => op.then(() => written++).catch((err) => {
  failed++;
  failures.push(`${path}: ${err.code ?? ""} ${err.message}`);
});

for (const p of plan) {
  for (const d of p.toFlag) track(writer.update(d.ref, { isDemo: true }), d.ref.path);
}
await writer.flush();

// After the review flags are written, so the recompute reads them.
for (const { ref, kind } of ownersToRerate.values()) {
  try {
    const snap = await ref.collection("reviews").get();
    const { ratingAvg, reviewCount } = computeRatingSummary(
      ratingsForSummary(snap.docs.map((r) => r.data()), false),
    );
    const patch = kind === "instructors"
      ? { ratingAvg, reviewCount, "providerProfile.rating": ratingAvg, "providerProfile.reviewCount": reviewCount }
      : { ratingAvg, reviewCount };
    await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
    written++;
    console.log(`  rerated ${ref.path}: ${ratingAvg} (${reviewCount})`);
  } catch (err) {
    failed++;
    failures.push(`${ref.path} (rating): ${err.code ?? ""} ${err.message}`);
  }
}
await writer.close();

console.log(`\nSummary: ${written} written, ${failed} failed.`);
for (const f of failures.slice(0, 20)) console.log(`  ! ${f}`);
process.exit(failed ? 1 : 0);

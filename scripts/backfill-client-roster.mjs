// B1: build the provider client roster (`clients`, listed on /provider/clients) from existing
// bookings. Going forward the `syncClientRosterOnBookingWrite` trigger keeps it current; this
// fills in every (trainer, customer) pair that booked before the trigger was deployed.
//
// Uses the SAME planning code as the trigger (functions/src/bookings/clientRosterCore.ts,
// loaded from the compiled functions/lib), so the two cannot disagree:
//   - one doc per pair; an existing doc for the pair (any id, e.g. the seeded demo-client-*)
//     is updated in place, otherwise `clients/{instructorId}_{userId}` is created;
//   - totals are recomputed from all of the pair's bookings, never incremented;
//   - trainer-owned fields (tags, notes, photoUrl) are only defaulted on create.
// Re-running is safe; a run after --apply reports 0 creates / 0 updates.
//
//   npm --prefix functions run build                                       # once, for functions/lib
//   node scripts/backfill-client-roster.mjs                                # emulator, dry run
//   node scripts/backfill-client-roster.mjs --project vfit-app-staging     # dry run
//   node scripts/backfill-client-roster.mjs --project vfit-app-staging --apply
//
// Against a real project it uses Application Default Credentials, like the other scripts.
// There are no triggers on `clients`, so these writes have no side effects.

import admin from "firebase-admin";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const corePath = fileURLToPath(new URL("../functions/lib/bookings/clientRosterCore.js", import.meta.url));
if (!existsSync(corePath)) {
  console.error(`Missing ${corePath}\nRun \`npm --prefix functions run build\` first.`);
  process.exit(1);
}
const { planRosterSync, rosterClientId } = createRequire(import.meta.url)(corePath);

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
console.log(`${apply ? "APPLY" : "DRY RUN"} — backfilling the client roster (clients) from bookings on ${target}\n`);

const [bookingsSnap, clientsSnap] = await Promise.all([
  db.collection("bookings").get(),
  db.collection("clients").get(),
]);

// Group bookings by (instructorId, userId). Venue bookings (no instructorId) have no roster.
const bookingsByPair = new Map();
let skippedNoTrainer = 0;
for (const doc of bookingsSnap.docs) {
  const b = doc.data();
  if (typeof b.instructorId !== "string" || !b.instructorId || typeof b.userId !== "string" || !b.userId) {
    skippedNoTrainer++;
    continue;
  }
  const key = rosterClientId(b.instructorId, b.userId);
  if (!bookingsByPair.has(key)) bookingsByPair.set(key, { pair: { instructorId: b.instructorId, userId: b.userId }, bookings: [] });
  bookingsByPair.get(key).bookings.push(b);
}

const clientsByPair = new Map();
const updateTimes = new Map();
for (const doc of clientsSnap.docs) {
  const c = doc.data();
  updateTimes.set(doc.id, doc.updateTime);
  if (typeof c.providerId !== "string" || typeof c.userId !== "string") continue;
  const key = rosterClientId(c.providerId, c.userId);
  if (!clientsByPair.has(key)) clientsByPair.set(key, []);
  clientsByPair.get(key).push({ id: doc.id, data: c });
}

const plans = [];
for (const [key, { pair, bookings }] of bookingsByPair) {
  const plan = await planRosterSync(
    {
      findClientDocs: async () => clientsByPair.get(key) ?? [],
      getBookings: async () => bookings,
      getUserProfile: async () => {
        const snap = await db.collection("users").doc(pair.userId).get();
        return snap.exists ? snap.data() : null;
      },
    },
    pair,
  );
  if (plan) plans.push(plan);
}

const creates = plans.filter((p) => p.kind === "create");
const updates = plans.filter((p) => p.kind === "update");
const duplicates = [...clientsByPair.values()].filter((docs) => docs.length > 1);
const sample = (list) =>
  list.length ? list.slice(0, SAMPLE).map((p) => p.id).join(", ") + (list.length > SAMPLE ? ", …" : "") : "-";

console.log(`bookings scanned:            ${bookingsSnap.size}  (${skippedNoTrainer} without trainer/user, skipped)`);
console.log(`clients scanned:             ${clientsSnap.size}`);
console.log(`trainer/customer pairs:      ${bookingsByPair.size}`);
console.log(`roster docs to create:       ${creates.length}   [${sample(creates)}]`);
console.log(`roster docs to update:       ${updates.length}   [${sample(updates)}]`);
for (const u of updates.slice(0, SAMPLE)) console.log(`    ${u.id}: ${Object.keys(u.data).join(", ")}`);
if (duplicates.length) {
  console.log(`pairs with >1 clients doc:   ${duplicates.length} (left as-is; the canonical/lowest id is kept in sync)`);
  for (const docs of duplicates.slice(0, SAMPLE)) console.log(`    ${docs.map((d) => d.id).join(" | ")}`);
}

if (!apply) {
  console.log(`\nDry run: nothing written. Re-run with --apply to write.`);
  process.exit(0);
}

let written = 0;
let failed = 0;
const failures = [];
const writer = db.bulkWriter();
writer.onWriteError((err) => {
  // ALREADY_EXISTS (6) on create / FAILED_PRECONDITION (9) on update: the trigger (or someone)
  // wrote the doc after we read it. Skip — re-running picks it up with fresh data.
  if (err.code === 6 || err.code === 9) return false;
  return err.failedAttempts < 5;
});

for (const plan of plans) {
  const ref = db.collection("clients").doc(plan.id);
  const now = FieldValue.serverTimestamp();
  const op = plan.kind === "create"
    ? writer.create(ref, { ...plan.data, createdAt: now, updatedAt: now })
    : writer.update(ref, { ...plan.data, updatedAt: now }, { lastUpdateTime: updateTimes.get(plan.id) });
  op.then(() => written++).catch((err) => {
    failed++;
    failures.push(`${plan.id}: ${err.code ?? ""} ${err.message}`);
  });
}
await writer.close();

console.log(`\nSummary: ${written} written, ${failed} failed (of ${plans.length} planned).`);
for (const f of failures.slice(0, 20)) console.log(`  ! ${f}`);
process.exit(failed ? 1 : 0);

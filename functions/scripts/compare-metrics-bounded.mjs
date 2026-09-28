/**
 * P2-2 equivalence check: runs the old full-scan metrics and the bounded nightly path
 * against the SAME Firestore data and diffs every field of the 7 recomputed days.
 *
 * Read-only against a real project (no writes, no rollup persisted):
 *   npm run build && node scripts/compare-metrics-bounded.mjs vfit-app-staging
 *
 * Against the emulator, with seeded edge-case data and a persisted-rollup round trip:
 *   firebase emulators:exec --only firestore \
 *     "node scripts/compare-metrics-bounded.mjs demo-metrics --seed"
 */
import admin from "firebase-admin";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const [projectId, flag] = process.argv.slice(2);
if (!projectId) throw new Error("usage: compare-metrics-bounded.mjs <projectId> [--seed]");
const seed = flag === "--seed";
if (seed && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error("--seed only runs on the emulator");

admin.initializeApp({ projectId });
const db = admin.firestore();
// lib/metrics/store.js calls admin.firestore() at import, so it loads after initializeApp.
const store = require("../lib/metrics/store.js");
const inc = require("../lib/metrics/incremental.js");
const { dateKeyInZone } = require("../lib/metrics/compute.js");

const DAY = 86400000;
const now = new Date();
const keys = Array.from({ length: 7 }, (_, i) => dateKeyInZone(new Date(now.getTime() - (i + 1) * DAY), "Europe/Rome"));
const cutoff = store.cutoffForKeys(keys);

async function seedEmulator() {
  const T = (ms) => admin.firestore.Timestamp.fromMillis(ms);
  const t = now.getTime();
  const batch = db.batch();
  const u = (id, data) => batch.set(db.collection("users").doc(id), data);
  u("c_ok", { role: "customer", createdAt: T(t - 3 * DAY), email: "a@x.it" });
  u("c_old", { role: "customer", createdAt: T(t - 400 * DAY) });
  u("c_norole", { createdAt: T(t - 2 * DAY) });
  u("c_nullrole", { role: null, createdAt: T(t - 5 * DAY) });
  u("c_nocreated", { role: "customer" });
  u("c_deleted", { role: "customer", isDeleted: true, createdAt: T(t - 1 * DAY) });
  u("c_deletedAt", { role: "customer", deletedAt: T(t - DAY), createdAt: T(t - 6 * DAY) });
  u("c_deletedFalse", { role: "customer", deletedAt: false, createdAt: T(t - 4 * DAY) });
  u("customer_1_0", { role: "customer", email: "z@demo.vfit", createdAt: T(t - 2 * DAY) });
  u("provider_1_0", { role: "provider", email: "p@demo.vfit" });
  u("t1", { role: "provider", createdAt: T(t - 300 * DAY) });
  u("t2", { role: "provider", createdAt: T(t - 3 * DAY) });
  u("t_gone", { role: "provider", isDeleted: true });
  u("admin1", { role: "admin" });
  u("c_future", { role: "customer", createdAt: T(t + DAY) });

  const b = (id, data) => batch.set(db.collection("bookings").doc(id), data);
  const hist = (...entries) => entries.map(([status, at, actorRole = "trainer"]) => ({ status, actorUid: "x", actorRole, at: T(at) }));
  // Settled long ago: completed, paid, disputed.
  b("b01", { userId: "c_old", instructorId: "t1", instructorName: "Uno", status: "payment_confirmed",
    statusHistory: hist(["requested", t - 200 * DAY, "client"], ["accepted", t - 199 * DAY], ["completed", t - 190 * DAY], ["payment_confirmed", t - 189 * DAY]),
    paymentConfirmation: { amount: 40.1, clientResponse: "disputed", clientRespondedAt: T(t - 188 * DAY) },
    updatedAt: T(t - 188 * DAY + 5), createdAt: T(t - 200 * DAY) });
  b("b02", { userId: "c_old", instructorId: "t1", instructorName: "Uno bis", status: "completed",
    statusHistory: hist(["requested", t - 180 * DAY, "client"], ["accepted", t - 179 * DAY], ["completed", t - 175 * DAY]),
    updatedAt: T(t - 175 * DAY), createdAt: T(t - 180 * DAY) });
  // Migration-only history, rebuilt from legacy columns.
  b("a00", { userId: "c_ok", providerId: "t2", status: "completed",
    statusHistory: [{ status: "completed", actorUid: "migration", actorRole: "system", at: T(t - 100 * DAY) }],
    createdAt: T(t - 110 * DAY), confirmedAt: T(t - 108 * DAY), completedAt: T(t - 101 * DAY), updatedAt: T(t - 100 * DAY) });
  // Straddles the cutoff: requested before it, completed and paid inside the window.
  b("m50", { userId: "c_ok", instructorId: "t1", instructorName: "Uno", status: "payment_confirmed",
    statusHistory: hist(["requested", t - 45 * DAY, "client"], ["accepted", t - 44 * DAY], ["completed", t - 5 * DAY], ["payment_confirmed", t - 3 * DAY]),
    paymentConfirmation: { amount: 25.35, clientResponse: null, clientRespondedAt: null },
    lateCancellation: false, updatedAt: T(t - 3 * DAY), createdAt: T(t - 45 * DAY) });
  // In window: accepted and cancelled by the trainer, late.
  b("z99", { userId: "c_norole", instructorId: "t2", instructorName: "Due", status: "cancelled_by_trainer",
    statusHistory: hist(["requested", t - 6 * DAY, "client"], ["accepted", t - 5.5 * DAY], ["cancelled_by_trainer", t - 2 * DAY]),
    lateCancellation: true, updatedAt: T(t - 2 * DAY), createdAt: T(t - 6 * DAY) });
  // A venue booking: ignored by every metric.
  b("v01", { userId: "c_ok", status: "completed", statusHistory: hist(["requested", t - 4 * DAY, "client"], ["completed", t - 2 * DAY, "system"]),
    updatedAt: T(t - 2 * DAY) });
  // Old booking disputed recently: the dispute falls inside the window.
  b("b03", { userId: "c_deleted", instructorId: "t_gone", instructorName: "Gone", status: "payment_confirmed",
    statusHistory: hist(["requested", t - 90 * DAY, "client"], ["accepted", t - 89 * DAY], ["completed", t - 80 * DAY], ["payment_confirmed", t - 79 * DAY]),
    paymentConfirmation: { amount: 60, clientResponse: "disputed", clientRespondedAt: T(t - 4 * DAY) },
    updatedAt: T(t - 4 * DAY), createdAt: T(t - 90 * DAY) });
  await batch.commit();
}

function diff(a, b, path = "") {
  const out = [];
  if (a instanceof Date || b instanceof Date) {
    if (a?.getTime?.() !== b?.getTime?.()) out.push(`${path}: ${a?.toISOString?.()} != ${b?.toISOString?.()}`);
    return out;
  }
  if (typeof a === "number" && typeof b === "number") {
    if (path.endsWith("cumulativeGrossValue") ? Math.abs(a - b) > 1e-6 : a !== b) out.push(`${path}: ${a} != ${b}`);
    return out;
  }
  if (a && b && typeof a === "object") {
    const ka = Object.keys(a); const kb = Object.keys(b);
    if (ka.join() !== kb.join()) out.push(`${path}: keys [${ka}] != [${kb}]`);
    for (const k of new Set([...ka, ...kb])) out.push(...diff(a[k], b[k], `${path}.${k}`));
    return out;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  return out;
}

async function oldPath() {
  const { bookings, users, visibleTrainerIds } = await store.loadInputs();
  const metrics = [];
  for (const dateKey of keys) {
    metrics.push(await store.writeMetricsForDay({ dateKey, bookings, users, visibleTrainerIds, backfilled: false, dryRun: true }));
  }
  return { metrics, reads: bookings.length + users.length, bookings };
}

function check(label, oldM, newM) {
  const problems = oldM.flatMap((m, i) => diff(newM[i], m, m.dateKey));
  console.log(`${problems.length ? "MISMATCH" : "IDENTICAL"}  ${label}`);
  for (const p of problems) console.log("   ", p);
  return problems.length;
}

if (seed) await seedEmulator();

const old = await oldPath();
const oldestAsOf = store.endOfLocalDay([...keys].sort()[0]);
const recentSince = new Date(oldestAsOf.getTime() - 2 * DAY);
let failures = 0;

// Counts the documents the bounded path's queries return (count() is billed separately).
async function boundedReads(recent) {
  const users = db.collection("users");
  const docId = admin.firestore.FieldPath.documentId();
  const sizes = await Promise.all([
    users.where("isDeleted", "==", true).get(),
    users.where("deletedAt", "!=", null).get(),
    users.where(docId, ">=", "customer_").where(docId, "<", "customer`").get(),
    users.where(docId, ">=", "provider_").where(docId, "<", "provider`").get(),
    users.where("createdAt", ">=", admin.firestore.Timestamp.fromDate(recentSince)).get(),
  ]).then((s) => s.map((x) => x.size));
  const trainers = new Set(recent.map((b) => b.instructorId).filter(Boolean)).size;
  return `${recent.length} bookings + 1 rollup + ${trainers} trainer docs + hidden candidates ${sizes.slice(0, 4).join("/")} + ${sizes[4]} recent users + 3 count() (>=1 read each)`;
}

// Steady state: rollup settled at this run's cutoff, recent = the real updatedAt query.
{
  const rollup = store.rebuildRollup(old.bookings, cutoff);
  const recent = await store.loadBookingsUpdatedSince(rollup.settledBefore);
  const users = await store.loadUserAggregates(recentSince, recent);
  const m = keys.map((dateKey) => store.computeDayIncremental({ dateKey, rollup, recent, users }));
  failures += check(`steady state (settledBefore ${cutoff.toISOString()}, recent bookings read: ${recent.length})`, old.metrics, m);
  console.log(`    reads: old ${old.reads} docs; bounded ${await boundedReads(recent)}`);
}

// A rollup 60 days stale (missed runs): larger recent set, same answer.
{
  const stale = new Date(cutoff.getTime() - 60 * DAY);
  const rollup = store.rebuildRollup(old.bookings, stale);
  const recent = await store.loadBookingsUpdatedSince(stale);
  const users = await store.loadUserAggregates(recentSince, recent);
  const m = keys.map((dateKey) => store.computeDayIncremental({ dateKey, rollup, recent, users }));
  failures += check(`stale rollup (settledBefore ${stale.toISOString()}, recent bookings read: ${recent.length})`, old.metrics, m);
}

if (seed) {
  // The real nightly entry point, twice: first run rebuilds and persists the rollup, the
  // second reads it back from Firestore.
  const first = await store.recomputeDaysBounded(keys);
  failures += check(`recomputeDaysBounded run 1 ${JSON.stringify(first.stats)}`, old.metrics, first.metrics);
  const second = await store.recomputeDaysBounded(keys);
  failures += check(`recomputeDaysBounded run 2 ${JSON.stringify(second.stats)}`, old.metrics, second.metrics);
  if (second.stats.rebuilt) { console.log("MISMATCH  run 2 should have used the persisted rollup"); failures++; }
  const doc = (await db.collection("metrics_daily").doc(keys[0]).get()).data();
  if (!doc || doc.backfilled !== false) { console.log("MISMATCH  metrics_daily not written"); failures++; }
}

const summary = old.metrics.map((m) => `${m.dateKey}: req ${m.sessionsRequested} cumCompl ${m.cumulativeCompleted} gross ${m.cumulativeGrossValue} disputes ${m.disputes} reg ${m.funnel.registeredClients} trainers ${m.activeTrainers}/${m.totalTrainers} byTrainer ${Object.keys(m.byTrainer).length}`);
console.log(summary.join("\n"));
process.exit(failures ? 1 : 0);

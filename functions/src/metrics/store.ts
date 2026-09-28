/**
 * Firestore adapter for the metrics layer: loads the raw inputs, writes the daily docs.
 * Kept separate from ./compute so the metric definitions stay pure and testable.
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { computeMetricsForDay, endOfLocalDayInZone } from "./compute";
import type { MetricsBooking, MetricsDaily, MetricsUser } from "./types";
import { toMetricsBooking, toMetricsUser } from "./mapping";
import {
  buildUserAggregates,
  computeMetricsForDayIncremental,
  emptyRollup,
  foldIntoRollup,
  rollupFromFirestore,
  settleCutoffFor,
  rollupToFirestore,
  type BookingsRollup,
  type UserAggregates,
} from "./incremental";

const db = admin.firestore();
export const METRICS_COLLECTION = "metrics_daily";
export const TIME_ZONE = "Europe/Rome";

export const ROLLUP_DOC = "metrics_state/bookingsRollup";

/** Every booking, in document-id order. Used by the backfill and by a rollup rebuild. */
export async function loadAllBookings(): Promise<MetricsBooking[]> {
  const snap = await db.collection("bookings").get();
  return snap.docs.map((d) => toMetricsBooking(d.id, d.data()));
}

/** Bookings touched at or after `since` — every status entry and client payment response
 *  sets `updatedAt`, so these carry every event at or after `since`. */
export async function loadBookingsUpdatedSince(since: Date): Promise<MetricsBooking[]> {
  const snap = await db.collection("bookings")
    .where("updatedAt", ">=", admin.firestore.Timestamp.fromDate(since))
    .get();
  return snap.docs.map((d) => toMetricsBooking(d.id, d.data()));
}

/**
 * Full scan of both collections. Cost grows with collection size: the nightly job uses
 * `loadUserAggregates` + the bookings rollup instead; the one-shot backfill still needs this.
 */
export async function loadInputs(): Promise<{
  bookings: MetricsBooking[];
  users: MetricsUser[];
  visibleTrainerIds: Set<string>;
}> {
  const [bookings, userSnap] = await Promise.all([
    loadAllBookings(),
    db.collection("users").get(),
  ]);

  const users: MetricsUser[] = userSnap.docs.map((d) => toMetricsUser(d.id, d.data()));

  // activeTrainers is counted against this set so it describes the same population as
  // totalTrainers. Without it a seeded demo trainer, excluded from the denominator, could
  // still land in the numerator of "Trainer attivi: 8/20".
  const visibleTrainerIds = new Set(
    users.filter((u) => u.role === "provider" && !u.hidden).map((u) => u.uid),
  );

  return { bookings, users, visibleTrainerIds };
}

/** End of the given local day, as the "as of" instant for rolling values. */
export function endOfLocalDay(dateKey: string): Date {
  return endOfLocalDayInZone(dateKey, TIME_ZONE);
}

export function toFirestoreDoc(m: MetricsDaily, backfilled: boolean) {
  const byTrainer: Record<string, unknown> = {};
  for (const [uid, t] of Object.entries(m.byTrainer)) {
    byTrainer[uid] = {
      ...t,
      lastAcceptedAt: t.lastAcceptedAt ?
        admin.firestore.Timestamp.fromDate(t.lastAcceptedAt) :
        null,
    };
  }
  return {
    ...m,
    byTrainer,
    date: admin.firestore.Timestamp.fromDate(new Date(`${m.dateKey}T00:00:00Z`)),
    computedAt: admin.firestore.FieldValue.serverTimestamp(),
    backfilled,
  };
}

/** Computes and writes one day. Idempotent: the document is overwritten wholesale. */
export async function writeMetricsForDay(opts: {
  dateKey: string;
  bookings: MetricsBooking[];
  users: MetricsUser[];
  visibleTrainerIds: Set<string>;
  backfilled: boolean;
  dryRun?: boolean;
}): Promise<MetricsDaily> {
  const metrics = computeMetricsForDay({
    dateKey: opts.dateKey,
    asOf: endOfLocalDay(opts.dateKey),
    bookings: opts.bookings,
    users: opts.users,
    visibleTrainerIds: opts.visibleTrainerIds,
    timeZone: TIME_ZONE,
  });

  if (!opts.dryRun) await writeMetricsDoc(metrics, opts.backfilled);
  return metrics;
}

// --- bounded nightly path (P2-2) ---------------------------------------------------------

/**
 * The users side of the metric set without reading the users collection:
 *   - count() of all users, of non-customer roles and of providers (1 read per 1000 entries);
 *   - the user docs of the trainers on recent bookings (activeTrainers' visibility check);
 *   - the hidden-account candidates (soft-deleted, or a seeded provider_/customer_ id) — the
 *     only documents that can make the count() disagree with the visible-customer total;
 *   - users created from `recentSince` on (newClients, and registeredClients for past days).
 *
 * Known gap: an account hidden ONLY by an @demo.vfit email (normal id, not deleted) cannot
 * be found by a query. The seeder always pairs that domain with a provider_/customer_ id,
 * and no such account exists on staging or prod (2026-09-28).
 */
export async function loadUserAggregates(
  recentSince: Date,
  recentBookings: MetricsBooking[],
): Promise<UserAggregates> {
  const users = db.collection("users");
  const docId = admin.firestore.FieldPath.documentId();
  const toUsers = (s: FirebaseFirestore.QuerySnapshot) =>
    s.docs.map((d) => toMetricsUser(d.id, d.data()));

  const trainerRefs = [...new Set(recentBookings.map((b) => b.instructorId).filter(Boolean))]
    .map((id) => users.doc(id as string));

  const [total, nonCustomer, providers, trainerDocs, deleted, deletedAt, seededC, seededP, recent] =
    await Promise.all([
      users.count().get(),
      // `!=` skips documents where role is absent or null — exactly the users the metrics
      // layer defaults to "customer" (`role ?? "customer"`).
      users.where("role", "!=", "customer").count().get(),
      users.where("role", "==", "provider").count().get(),
      trainerRefs.length ? db.getAll(...trainerRefs) : Promise.resolve([]),
      users.where("isDeleted", "==", true).get(),
      users.where("deletedAt", "!=", null).get(),
      users.where(docId, ">=", "customer_").where(docId, "<", "customer`").get(),
      users.where(docId, ">=", "provider_").where(docId, "<", "provider`").get(),
      users.where("createdAt", ">=", admin.firestore.Timestamp.fromDate(recentSince)).get(),
    ]);

  return buildUserAggregates({
    totalUsers: total.data().count,
    nonCustomerRoleUsers: nonCustomer.data().count,
    providerUsers: providers.data().count,
    recentTrainerUsers: trainerDocs
      .filter((d) => d.exists)
      .map((d) => toMetricsUser(d.id, d.data() as FirebaseFirestore.DocumentData)),
    hiddenCandidates: [
      ...toUsers(deleted), ...toUsers(deletedAt), ...toUsers(seededC), ...toUsers(seededP),
    ],
    recentUsers: toUsers(recent),
  });
}

export async function loadRollup(): Promise<BookingsRollup | null> {
  const snap = await db.doc(ROLLUP_DOC).get();
  return rollupFromFirestore(snap.data());
}

/** Firestore's hard limit is 1 MiB; warn well before it, when the rollup should be sharded. */
const ROLLUP_WARN_BYTES = 700_000;

export async function saveRollup(r: BookingsRollup): Promise<void> {
  const data = rollupToFirestore(r);
  const approxBytes = JSON.stringify(data).length;
  if (approxBytes > ROLLUP_WARN_BYTES) {
    logger.warn("[metrics] bookings rollup nearing the 1 MiB document limit — shard it", {
      approxBytes, clients: r.completions.size, requesters: r.requesters.size,
    });
  }
  await db.doc(ROLLUP_DOC).set({
    ...data,
    computedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function writeMetricsDoc(m: MetricsDaily, backfilled: boolean): Promise<void> {
  await db.collection(METRICS_COLLECTION).doc(m.dateKey).set(toFirestoreDoc(m, backfilled));
}

/** The rollup cutoff a run over `dateKeys` settles to. */
export function cutoffForKeys(dateKeys: string[]): Date {
  const oldest = [...dateKeys].sort()[0];
  return settleCutoffFor(endOfLocalDay(oldest));
}

/** Builds a rollup from a full scan — the first run, a version bump, or a repair. */
export function rebuildRollup(allBookings: MetricsBooking[], cutoff: Date): BookingsRollup {
  return foldIntoRollup(emptyRollup(), allBookings, cutoff);
}

/**
 * Recomputes `dateKeys` reading only recent activity. With `dryRun` nothing is written —
 * neither the day documents nor the advanced rollup.
 */
export async function recomputeDaysBounded(dateKeys: string[], opts: { dryRun?: boolean } = {}) {
  const cutoff = cutoffForKeys(dateKeys);
  const oldestAsOf = endOfLocalDay([...dateKeys].sort()[0]);

  let rollup = await loadRollup();
  let recent: MetricsBooking[];
  let rebuilt = false;
  if (!rollup || rollup.settledBefore.getTime() > cutoff.getTime()) {
    // A full list is a valid "recent" set: it is a superset of what the rollup leaves out.
    recent = await loadAllBookings();
    rollup = rebuildRollup(recent, cutoff);
    rebuilt = true;
  } else {
    recent = await loadBookingsUpdatedSince(rollup.settledBefore);
  }
  const settledBefore = rollup.settledBefore;

  // Two days of slack below the oldest day's end covers its local midnight across DST.
  const users = await loadUserAggregates(new Date(oldestAsOf.getTime() - 2 * 86400000), recent);

  const metrics = dateKeys.map((dateKey) =>
    computeDayIncremental({ dateKey, rollup: rollup as BookingsRollup, recent, users }));

  if (!opts.dryRun) {
    for (const m of metrics) await writeMetricsDoc(m, false);
    // Advance only after every day is written: a failed run leaves the old cutoff, and the
    // next run simply reads a slightly larger recent set.
    foldIntoRollup(rollup, recent, cutoff);
    await saveRollup(rollup);
  }

  return {
    metrics,
    stats: {
      rebuilt,
      settledBefore: settledBefore.toISOString(),
      nextSettledBefore: cutoff.toISOString(),
      recentBookings: recent.length,
      totalTrainers: users.totalTrainers,
      recentTrainersVisible: users.visibleTrainerIds.size,
      recentUsers: users.recentVisibleCustomerCreatedAts.length,
    },
  };
}

export function computeDayIncremental(opts: {
  dateKey: string;
  rollup: BookingsRollup;
  recent: MetricsBooking[];
  users: UserAggregates;
}): MetricsDaily {
  return computeMetricsForDayIncremental({
    dateKey: opts.dateKey,
    asOf: endOfLocalDay(opts.dateKey),
    rollup: opts.rollup,
    recent: opts.recent,
    users: opts.users,
    timeZone: TIME_ZONE,
  });
}

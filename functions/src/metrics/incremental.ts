/**
 * Bounded nightly metrics (P2-2).
 *
 * The nightly job used to read every booking and every user to recompute 7 days. Most of the
 * metric set only looks at the last ~37 days, but a handful are all-time (cumulative counts,
 * GMV, disputes, the funnel's distinct clients, the rebooking cohort, each trainer's last
 * acceptance). Those are served from a persisted rollup of every booking event that happened
 * before `settledBefore`, so the job reads only:
 *   - the rollup (one document),
 *   - bookings with `updatedAt >= settledBefore` — every write that appends a status entry or
 *     a client payment response also sets `updatedAt`, so any event at or after the cutoff
 *     lives on one of these,
 *   - a handful of user queries (see store.ts `loadUserAggregates`).
 *
 * Correctness rests on three facts about bookings, each verified on staging and prod
 * (2026-09-28) and enforced by the write paths:
 *   1. every event instant (status entry `at`, `clientRespondedAt`, and the legacy
 *      createdAt/confirmedAt/completedAt used for migrated history) is <= `updatedAt`;
 *   2. history is append-only and an event's facts (amount, dispute, instructor, client)
 *      never change after it happened;
 *   3. bookings are never deleted.
 * If one is ever violated, delete `metrics_state/bookingsRollup` (the next run rebuilds it
 * from a full scan) or run `backfillMetricsDaily` with dryRun=false, which rewrites it.
 *
 * Pure: no Firestore access, no clock. The equivalence with `computeMetricsForDay` over the
 * full collections is asserted in test/metrics-incremental.test.ts.
 */

import { Timestamp } from "firebase-admin/firestore";
import {
  computeMetricsForDay,
  computeRebookingRate,
  computeTrainerMap,
  dateKeyInZone,
  firstEntry,
} from "./compute";
import {
  ACTIVE_TRAINER_WINDOW_DAYS,
  MAX_TRAINERS_IN_MAP,
  type MetricsBooking,
  type MetricsDaily,
  type MetricsUser,
  type TrainerMetrics,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bump when the rollup's shape or semantics change; a mismatch forces a full rebuild. */
// 2: demo bookings (D5) are excluded — a v1 rollup may hold their events, so it is rebuilt.
export const ROLLUP_VERSION = 2;

/** Before any possible event. The starting point of a rebuild. */
export const BEGINNING_OF_TIME = new Date(-8.64e15);

/** A booking's client, normalised so an absent userId is one stable key. */
type ClientKey = string | null;
const clientKey = (b: MetricsBooking): ClientKey => b.userId ?? null;

export interface RollupTrainer {
  name: string;
  /** Lowest booking id seen for this trainer: the full scan named trainers from it. */
  firstBookingId: string;
  lastAcceptedAt: Date | null;
}

/** Contributions of every booking event strictly before `settledBefore`. */
export interface BookingsRollup {
  settledBefore: Date;
  cumulativeCompleted: number;
  cumulativePaymentConfirmed: number;
  cumulativeGrossValue: number;
  disputes: number;
  /** Clients with a first `requested` entry before the cutoff. */
  requesters: Set<ClientKey>;
  /** Per client, the two earliest first-`completed` instants (ascending). Two is all the
   *  rebooking rate reads, and every key is a client with a completed session. */
  completions: Map<ClientKey, Date[]>;
  trainers: Map<string, RollupTrainer>;
}

export function emptyRollup(): BookingsRollup {
  return {
    settledBefore: BEGINNING_OF_TIME,
    cumulativeCompleted: 0,
    cumulativePaymentConfirmed: 0,
    cumulativeGrossValue: 0,
    disputes: 0,
    requesters: new Set(),
    completions: new Map(),
    trainers: new Map(),
  };
}

function addCompletion(map: Map<ClientKey, Date[]>, key: ClientKey, at: Date) {
  const list = [...(map.get(key) ?? []), at].sort((a, b) => a.getTime() - b.getTime());
  map.set(key, list.slice(0, 2));
}

/** Trainer identity (name from the lowest booking id) is not time-dependent, so it is
 *  refreshed from every booking seen, not just from settled events. */
function noteTrainer(trainers: Map<string, RollupTrainer>, b: MetricsBooking) {
  if (!b.instructorId) return;
  const t = trainers.get(b.instructorId);
  if (!t) {
    trainers.set(b.instructorId, {
      name: b.instructorName ?? b.instructorId,
      firstBookingId: b.id,
      lastAcceptedAt: null,
    });
  } else if (b.id < t.firstBookingId) {
    t.firstBookingId = b.id;
    t.name = b.instructorName ?? b.instructorId;
  }
}

/**
 * Folds every event in [rollup.settledBefore, until) into the rollup and moves the cutoff to
 * `until`. `bookings` must include every booking with an event in that range — i.e. at least
 * those with `updatedAt >= rollup.settledBefore`. Mutates and returns `rollup`.
 */
export function foldIntoRollup(
  rollup: BookingsRollup,
  bookings: MetricsBooking[],
  until: Date,
): BookingsRollup {
  const from = rollup.settledBefore.getTime();
  const to = until.getTime();
  // Demo bookings (D5) contribute nothing — not even a trainer identity for byTrainer.
  const real = bookings.filter((b) => !b.isDemo);
  if (to <= from) {
    for (const b of real) noteTrainer(rollup.trainers, b);
    return rollup;
  }
  const inRange = (d: Date) => d.getTime() >= from && d.getTime() < to;

  for (const b of real) {
    if (!b.instructorId) continue;
    noteTrainer(rollup.trainers, b);
    const t = rollup.trainers.get(b.instructorId)!;

    for (const h of b.statusHistory) {
      if (h.status === "accepted" && inRange(h.at)) {
        if (!t.lastAcceptedAt || h.at > t.lastAcceptedAt) t.lastAcceptedAt = h.at;
      }
    }

    const requested = firstEntry(b, "requested");
    if (requested && inRange(requested.at)) rollup.requesters.add(clientKey(b));

    const completed = firstEntry(b, "completed");
    if (completed && inRange(completed.at)) {
      rollup.cumulativeCompleted++;
      addCompletion(rollup.completions, clientKey(b), completed.at);
    }

    const paid = firstEntry(b, "payment_confirmed");
    if (paid && inRange(paid.at)) {
      rollup.cumulativePaymentConfirmed++;
      rollup.cumulativeGrossValue += b.paymentConfirmation?.amount ?? 0;
    }

    const pc = b.paymentConfirmation;
    if (pc?.clientResponse === "disputed" && pc.clientRespondedAt && inRange(pc.clientRespondedAt)) {
      rollup.disputes++;
    }
  }

  rollup.settledBefore = until;
  return rollup;
}

/** Everything `computeMetricsForDay` derives from the users collection. */
export interface UserAggregates {
  /** Visible providers. */
  totalTrainers: number;
  /** The visible providers AMONG the trainers of the recent bookings — the only ones that
   *  can be active in a window, so the only membership activeTrainers ever tests. */
  visibleTrainerIds: Set<string>;
  /** Visible customers today, whatever their createdAt. */
  visibleCustomers: number;
  /** createdAt of visible customers created on/after the window's first day. */
  recentVisibleCustomerCreatedAts: Date[];
}

export interface UserQueryResults {
  /** count() of the whole users collection. */
  totalUsers: number;
  /** count() of users whose `role` exists, is non-null and is not "customer". Users with
   *  no role (or a null role) are customers to the metrics layer (`role ?? "customer"`). */
  nonCustomerRoleUsers: number;
  /** count() of users with role == "provider". */
  providerUsers: number;
  /** The user documents (those that exist) of the trainers on the recent bookings. */
  recentTrainerUsers: MetricsUser[];
  /** Every user that could be hidden: isDeleted == true, deletedAt != null, isDemo == true, or
   *  a seeded id prefix (provider_, customer_, demo-). Overlaps are fine — de-duplicated by uid. */
  hiddenCandidates: MetricsUser[];
  /** Users with createdAt >= the window's lower bound. */
  recentUsers: MetricsUser[];
}

export function buildUserAggregates(q: UserQueryResults): UserAggregates {
  const hiddenWithRole = (role: string) => new Set(
    q.hiddenCandidates.filter((u) => u.hidden && u.role === role).map((u) => u.uid),
  ).size;
  return {
    totalTrainers: q.providerUsers - hiddenWithRole("provider"),
    visibleTrainerIds: new Set(
      q.recentTrainerUsers.filter((u) => u.role === "provider" && !u.hidden).map((u) => u.uid),
    ),
    visibleCustomers: q.totalUsers - q.nonCustomerRoleUsers - hiddenWithRole("customer"),
    recentVisibleCustomerCreatedAts: q.recentUsers
      .filter((u) => u.role === "customer" && !u.hidden && u.createdAt)
      .map((u) => u.createdAt as Date),
  };
}

/** The earliest instant any window-dependent metric of `oldestDateKey` looks at is
 *  asOf − 30 days (the trailing trainer window); one extra day of slack. Events before this
 *  can only feed the all-time values, which the rollup carries. */
export function settleCutoffFor(oldestAsOf: Date): Date {
  return new Date(oldestAsOf.getTime() - (ACTIVE_TRAINER_WINDOW_DAYS + 1) * DAY_MS);
}

export interface IncrementalArgs {
  dateKey: string;
  asOf: Date;
  rollup: BookingsRollup;
  /** Every booking with an event at or after `rollup.settledBefore` (a superset is fine). */
  recent: MetricsBooking[];
  users: UserAggregates;
  timeZone?: string;
}

/**
 * Same output as `computeMetricsForDay` over the full collections (modulo the floating-point
 * summation order of cumulativeGrossValue), from the rollup plus recent bookings.
 */
export function computeMetricsForDayIncremental(args: IncrementalArgs): MetricsDaily {
  const { dateKey, asOf, rollup, users } = args;
  const tz = args.timeZone ?? "Europe/Rome";
  const S = rollup.settledBefore.getTime();

  if (asOf.getTime() - ACTIVE_TRAINER_WINDOW_DAYS * DAY_MS < S) {
    throw new Error(
      `rollup settled through ${rollup.settledBefore.toISOString()} is too recent for ${dateKey}`,
    );
  }

  // Id order is the order the full scan iterated in; the trainer map's order depends on it.
  const recent = args.recent
    .filter((b) => Boolean(b.instructorId) && !b.isDemo)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Daily events, activeTrainers, medianTimeToAccept and the per-trainer windows only see
  // events after asOf − 30d >= S, all of which are on recent bookings.
  const windowed = computeMetricsForDay({
    dateKey, asOf, bookings: recent, users: [],
    visibleTrainerIds: users.visibleTrainerIds, timeZone: tz,
  });

  // --- all-time values: rollup (< S) + recent events in [S, asOf] ---
  const unsettled = (d: Date | null | undefined): d is Date =>
    !!d && d.getTime() >= S && d.getTime() <= asOf.getTime();

  let cumulativeCompleted = rollup.cumulativeCompleted;
  let cumulativePaymentConfirmed = rollup.cumulativePaymentConfirmed;
  let cumulativeGrossValue = rollup.cumulativeGrossValue;
  let disputes = rollup.disputes;
  const requesters = new Set(rollup.requesters);
  const completions = new Map<ClientKey, Date[]>();
  for (const [k, v] of rollup.completions) completions.set(k, [...v]);

  for (const b of recent) {
    const requested = firstEntry(b, "requested");
    if (requested && unsettled(requested.at)) requesters.add(clientKey(b));

    const completed = firstEntry(b, "completed");
    if (completed && unsettled(completed.at)) {
      cumulativeCompleted++;
      addCompletion(completions, clientKey(b), completed.at);
    }

    const paid = firstEntry(b, "payment_confirmed");
    if (paid && unsettled(paid.at)) {
      cumulativePaymentConfirmed++;
      cumulativeGrossValue += b.paymentConfirmation?.amount ?? 0;
    }

    const pc = b.paymentConfirmation;
    if (pc?.clientResponse === "disputed" && unsettled(pc.clientRespondedAt)) disputes++;
  }

  // The rebooking rate only reads each client's two earliest completions, so feeding it
  // one synthetic booking per retained instant reproduces the full-scan result.
  const synthetic: MetricsBooking[] = [];
  for (const [k, dates] of completions) {
    for (const at of dates) {
      synthetic.push({
        id: "", userId: k as string, status: "completed",
        statusHistory: [{ status: "completed", actorUid: "", actorRole: "system", at }],
      });
    }
  }
  const { rate: rebookingRate, cohortSize: rebookingCohort } =
    computeRebookingRate(synthetic, asOf);

  // --- per trainer: identity + last acceptance from the rollup, windows from recent ---
  const identities = new Map<string, RollupTrainer>();
  for (const [id, t] of rollup.trainers) identities.set(id, { ...t });
  for (const b of recent) noteTrainer(identities, b);

  const recentTrainers = computeTrainerMap(recent, asOf);
  const ordered = [...identities.entries()].sort(([, a], [, b]) =>
    a.firstBookingId < b.firstBookingId ? -1 : a.firstBookingId > b.firstBookingId ? 1 : 0);

  const byTrainer: Record<string, TrainerMetrics> = {};
  for (const [id, ident] of ordered.slice(0, MAX_TRAINERS_IN_MAP)) {
    const r = recentTrainers.get(id);
    let lastAcceptedAt = ident.lastAcceptedAt;
    if (r?.lastAcceptedAt && (!lastAcceptedAt || r.lastAcceptedAt > lastAcceptedAt)) {
      lastAcceptedAt = r.lastAcceptedAt;
    }
    byTrainer[id] = {
      name: ident.name,
      accepted: r?.accepted ?? 0,
      completed: r?.completed ?? 0,
      paymentConfirmed: r?.paymentConfirmed ?? 0,
      grossValue: r?.grossValue ?? 0,
      lastAcceptedAt,
    };
  }

  // --- users ---
  const newClients = users.recentVisibleCustomerCreatedAts
    .filter((d) => dateKeyInZone(d, tz) === dateKey).length;
  const registeredClients = users.visibleCustomers -
    users.recentVisibleCustomerCreatedAts.filter((d) => d.getTime() > asOf.getTime()).length;

  return {
    ...windowed,
    newClients,
    totalTrainers: users.totalTrainers,
    cumulativeCompleted,
    cumulativePaymentConfirmed,
    cumulativeGrossValue,
    rebookingRate,
    rebookingCohort,
    disputes,
    funnel: {
      registeredClients,
      clientsWithRequest: requesters.size,
      clientsWithCompleted: completions.size,
    },
    byTrainer,
    byTrainerTruncated: ordered.length > MAX_TRAINERS_IN_MAP,
  };
}

// --- persistence shape -------------------------------------------------------------------

const ts = (d: Date | null) => (d ? Timestamp.fromDate(d) : null);
const fromTs = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

export function rollupToFirestore(r: BookingsRollup) {
  return {
    version: ROLLUP_VERSION,
    settledBefore: Timestamp.fromDate(r.settledBefore),
    cumulativeCompleted: r.cumulativeCompleted,
    cumulativePaymentConfirmed: r.cumulativePaymentConfirmed,
    cumulativeGrossValue: r.cumulativeGrossValue,
    disputes: r.disputes,
    requesters: [...r.requesters],
    // Arrays, not maps: a client key may be null, and uids are not guaranteed map-key-safe.
    completions: [...r.completions.entries()].map(([u, dates]) => ({
      u, at: dates.map((d) => Timestamp.fromDate(d)),
    })),
    trainers: [...r.trainers.entries()].map(([id, t]) => ({
      id, name: t.name, firstBookingId: t.firstBookingId, lastAcceptedAt: ts(t.lastAcceptedAt),
    })),
  };
}

/** Null when the document is absent, from another version, or malformed — the caller then
 *  rebuilds from a full scan rather than trusting it. */
export function rollupFromFirestore(data: FirebaseFirestore.DocumentData | undefined): BookingsRollup | null {
  if (!data || data.version !== ROLLUP_VERSION) return null;
  const settledBefore = fromTs(data.settledBefore);
  if (!settledBefore) return null;
  const completions = new Map<ClientKey, Date[]>();
  for (const c of data.completions ?? []) {
    completions.set(c.u ?? null, (c.at ?? []).map(fromTs).filter((d: Date | null): d is Date => !!d));
  }
  const trainers = new Map<string, RollupTrainer>();
  for (const t of data.trainers ?? []) {
    trainers.set(t.id, {
      name: t.name, firstBookingId: t.firstBookingId, lastAcceptedAt: fromTs(t.lastAcceptedAt),
    });
  }
  return {
    settledBefore,
    cumulativeCompleted: Number(data.cumulativeCompleted ?? 0),
    cumulativePaymentConfirmed: Number(data.cumulativePaymentConfirmed ?? 0),
    cumulativeGrossValue: Number(data.cumulativeGrossValue ?? 0),
    disputes: Number(data.disputes ?? 0),
    requesters: new Set((data.requesters ?? []) as ClientKey[]),
    completions,
    trainers,
  };
}

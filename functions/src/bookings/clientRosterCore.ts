/**
 * Provider client roster — pure core (no firebase-admin imports).
 *
 * A `clients` document is the trainer ↔ customer relationship: it is what /provider/clients
 * lists (`where providerId == uid orderBy lastVisit desc`) and what the client-detail
 * subcollections (notes, goals, trainingPrograms, planProgress) hang off. Until B1 nothing
 * outside the demo seed created one, so real customers never showed up in a trainer's list.
 *
 * The roster is RECOMPUTED from all of the pair's bookings on every relevant booking write,
 * never incremented, so replays, retries, out-of-order events and the backfill all converge
 * on the same document.
 *
 * Kept free of firebase-admin so it is unit-testable without an emulator and so
 * `scripts/backfill-client-roster.mjs` can reuse it from the compiled `lib/` output — the
 * trigger and the backfill cannot drift apart. Timestamps are handled structurally
 * (anything with `toMillis()`), and the caller adds `createdAt` / `updatedAt`.
 *
 * Document id scheme
 * ------------------
 * New roster docs use the deterministic id `${instructorId}_${userId}` (see `rosterClientId`),
 * so two concurrent first bookings cannot create two documents for the same pair. An
 * EXISTING document for the pair — whatever its id (the seeded `demo-client-*` docs, or one a
 * trainer created by hand) — is found by `providerId + userId` and updated in place instead,
 * so its notes / goals / programs are never orphaned and no duplicate appears in the list.
 */

/** Anything Timestamp-like (firebase-admin Timestamp, or a test double). */
export interface TimestampLike {
  toMillis(): number;
}

export interface RosterBooking {
  status?: unknown;
  finalPrice?: unknown;
  scheduledAt?: TimestampLike | null;
  createdAt?: TimestampLike | null;
  userName?: unknown;
  userEmail?: unknown;
  userPhone?: unknown;
}

export interface RosterPair {
  instructorId: string;
  userId: string;
}

export interface RosterStats {
  totalBookings: number;
  totalSpent: number;
  firstVisit: TimestampLike | null;
  lastVisit: TimestampLike | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ExistingClientDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface UserProfileLike {
  fullName?: unknown;
  displayName?: unknown;
  email?: unknown;
  phone?: unknown;
}

export type RosterWrite =
  | { kind: "create"; id: string; data: Record<string, unknown> }
  | { kind: "update"; id: string; data: Record<string, unknown> };

/** Sessions that actually took place: they define first/last visit. */
export const VISIT_STATUSES: readonly string[] = ["completed", "payment_confirmed"];

/** The only status whose money has changed hands (confirmed by both sides). */
export const PAID_STATUS = "payment_confirmed";

/**
 * Booking fields the roster is derived from. A write touching none of them (e.g. only
 * `updatedAt`, `userNotes`, a reminder flag) cannot change the roster and is skipped.
 */
export const ROSTER_SOURCE_FIELDS = [
  "instructorId",
  "userId",
  "status",
  "finalPrice",
  "scheduledAt",
  "userName",
  "userEmail",
  "userPhone",
] as const;

export function rosterClientId(instructorId: string, userId: string): string {
  return `${instructorId}_${userId}`;
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function millis(t: TimestampLike | null | undefined): number | null {
  if (!t || typeof (t as TimestampLike).toMillis !== "function") return null;
  const ms = t.toMillis();
  return Number.isFinite(ms) ? ms : null;
}

function pairOf(data: Record<string, unknown> | undefined): RosterPair | null {
  if (!data) return null;
  const instructorId = nonEmptyString(data.instructorId);
  const userId = nonEmptyString(data.userId);
  // Venue bookings carry `instructorId: null` — there is no trainer roster to maintain.
  if (!instructorId || !userId) return null;
  return { instructorId, userId };
}

function sameValue(a: unknown, b: unknown): boolean {
  const am = millis(a as TimestampLike);
  const bm = millis(b as TimestampLike);
  if (am !== null || bm !== null) return am === bm;
  return a === b || (a == null && b == null);
}

/**
 * The (trainer, customer) pairs whose roster a booking write can affect: the pair before and
 * the pair after (both, if the booking was reassigned). Empty when the write changed none of
 * `ROSTER_SOURCE_FIELDS`.
 */
export function rosterPairsForWrite(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): RosterPair[] {
  if (before && after) {
    const changed = ROSTER_SOURCE_FIELDS.some((f) => !sameValue(before[f], after[f]));
    if (!changed) return [];
  }
  const pairs: RosterPair[] = [];
  for (const p of [pairOf(before), pairOf(after)]) {
    if (p && !pairs.some((q) => q.instructorId === p.instructorId && q.userId === p.userId)) pairs.push(p);
  }
  return pairs;
}

/**
 * Derives the roster numbers from ALL of one pair's bookings.
 *
 * - `totalBookings`: every booking of the pair, whatever its status — the same set the
 *   client-detail page lists as booking history (and what the demo seed writes).
 * - `totalSpent`: sum of `finalPrice` over `payment_confirmed` bookings, rounded to cents.
 * - `firstVisit` / `lastVisit`: earliest / latest `scheduledAt` among sessions that took
 *   place (`completed`, `payment_confirmed`); null when none has yet. `null` (not a missing
 *   field) matters: the list query orders by `lastVisit`, and Firestore drops documents
 *   that lack the orderBy field but keeps those where it is null.
 * - contact: from the most recent booking (by `createdAt`, else `scheduledAt`) that has it.
 */
export function computeRosterStats(bookings: RosterBooking[]): RosterStats {
  let spentCents = 0;
  let first: TimestampLike | null = null;
  let last: TimestampLike | null = null;

  for (const b of bookings) {
    const status = typeof b.status === "string" ? b.status : "";
    if (status === PAID_STATUS && typeof b.finalPrice === "number" && Number.isFinite(b.finalPrice)) {
      spentCents += Math.round(b.finalPrice * 100);
    }
    if (VISIT_STATUSES.includes(status)) {
      const ms = millis(b.scheduledAt);
      if (ms !== null && b.scheduledAt) {
        if (first === null || ms < (millis(first) as number)) first = b.scheduledAt;
        if (last === null || ms > (millis(last) as number)) last = b.scheduledAt;
      }
    }
  }

  const newestFirst = [...bookings].sort(
    (a, b) =>
      (millis(b.createdAt) ?? millis(b.scheduledAt) ?? 0) - (millis(a.createdAt) ?? millis(a.scheduledAt) ?? 0),
  );
  const latest = (field: "userName" | "userEmail" | "userPhone"): string | null => {
    for (const b of newestFirst) {
      const v = nonEmptyString(b[field]);
      if (v) return v;
    }
    return null;
  };

  return {
    totalBookings: bookings.length,
    totalSpent: spentCents / 100,
    firstVisit: first,
    lastVisit: last,
    name: latest("userName"),
    email: latest("userEmail"),
    phone: latest("userPhone"),
  };
}

/**
 * Which existing `clients` doc represents the pair: the canonical id if present, otherwise
 * the oldest-id match (deterministic, so the trigger and the backfill agree). Null → create.
 */
export function pickRosterDoc(docs: ExistingClientDoc[], pair: RosterPair): ExistingClientDoc | null {
  const matching = docs.filter((d) => d.data.providerId === pair.instructorId && d.data.userId === pair.userId);
  if (matching.length === 0) return null;
  const canonical = rosterClientId(pair.instructorId, pair.userId);
  return matching.find((d) => d.id === canonical) ?? [...matching].sort((a, b) => a.id.localeCompare(b.id))[0];
}

export interface RosterSyncDeps {
  /** `clients` docs with this providerId + userId (normally 0 or 1). */
  findClientDocs: () => Promise<ExistingClientDoc[]>;
  /** Every booking with this instructorId + userId. */
  getBookings: () => Promise<RosterBooking[]>;
  /** users/{userId}, read only when no booking or existing doc carries a name. */
  getUserProfile: () => Promise<UserProfileLike | null>;
}

/**
 * Plans the single write that brings the pair's roster doc up to date, or null when it
 * already is (so a re-run — trigger or backfill — writes nothing).
 *
 * Only derived fields are written. Trainer-owned fields (`tags`, `notes`, `photoUrl`) are set
 * to empty defaults on create and never touched afterwards. A pair with no bookings left
 * keeps its document (it may hold notes/goals/programs), just with zeroed totals; a pair
 * with no bookings and no document gets none.
 */
export async function planRosterSync(deps: RosterSyncDeps, pair: RosterPair): Promise<RosterWrite | null> {
  const [docs, bookings] = await Promise.all([deps.findClientDocs(), deps.getBookings()]);
  const existing = pickRosterDoc(docs, pair);
  if (!existing && bookings.length === 0) return null;

  const stats = computeRosterStats(bookings);
  const prev = existing?.data ?? {};

  let name = stats.name ?? nonEmptyString(prev.name);
  let email = stats.email ?? nonEmptyString(prev.email);
  let phone = stats.phone ?? nonEmptyString(prev.phone);
  if (!name) {
    const profile = await deps.getUserProfile();
    name = nonEmptyString(profile?.fullName) ?? nonEmptyString(profile?.displayName);
    email = email ?? nonEmptyString(profile?.email);
    phone = phone ?? nonEmptyString(profile?.phone);
  }

  const derived: Record<string, unknown> = {
    providerId: pair.instructorId,
    userId: pair.userId,
    name: name ?? email ?? "",
    email: email ?? "",
    phone: phone ?? "",
    totalBookings: stats.totalBookings,
    totalSpent: stats.totalSpent,
    firstVisit: stats.firstVisit,
    lastVisit: stats.lastVisit,
  };

  if (!existing) {
    return {
      kind: "create",
      id: rosterClientId(pair.instructorId, pair.userId),
      data: { ...derived, photoUrl: "", tags: [], notes: "" },
    };
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(derived)) {
    // Never blank out contact details the doc already has (e.g. a trainer-edited phone).
    if ((k === "email" || k === "phone") && v === "" && nonEmptyString(prev[k])) continue;
    if (!(k in prev) || !sameValue(prev[k], v)) patch[k] = v;
  }
  return Object.keys(patch).length ? { kind: "update", id: existing.id, data: patch } : null;
}

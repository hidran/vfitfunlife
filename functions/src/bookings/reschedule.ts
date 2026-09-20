/**
 * Moving a booking to another of the provider's free slots.
 *
 * The browser used to write `bookings/{id}` itself: firestore.rules denies client writes of
 * `scheduledAt`, and the new instant was built with `Date.setHours` on the device's clock, so
 * anyone outside Europe/Rome moved their session to the wrong hour. This callable replaces
 * that. The chosen start is re-checked against the provider's real availability inside the
 * same provider-day transaction `createBooking` uses, so a reschedule can never land on a
 * slot a concurrent request is taking.
 *
 * Plan: docs/superpowers/plans/2026-09-20-booking-reschedule.md
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { ACTIVE_BOOKING_STATUSES, dayContextFrom } from "../availability/dayContext";
import { bookingDayRef, readDayDocs } from "../availability/dayReads";
import { decideBookingStart, romeDateOf } from "../availability/slots";
import { MAX_DOC_ID_LENGTH } from "../availability/validate";
import { EMAIL_SECRETS } from "../lib/email";
import { notifyTransition } from "./notify";

const region = process.env.FIREBASE_REGION || "europe-west1";

export type RescheduleRefusal = "not_reschedulable" | "past_booking" | "permission_denied";

/** Who moved it — recorded on the booking and used to pick who gets told. */
export type RescheduleActorRole = "client" | "trainer" | "staff";

interface RescheduleRequest {
  bookingId: string;
  startsAt: string;
}

/** Only the fields the guards look at; everything on a booking document is unknown to them. */
interface BookingLike {
  userId?: unknown;
  instructorId?: unknown;
  status?: unknown;
  scheduledAt?: unknown;
}

interface Caller {
  uid: string;
  isStaff: boolean;
}

/**
 * The statuses a booking can still be moved from: ACTIVE_BOOKING_STATUSES (the ones that hold
 * their slot) minus "payment_confirmed". That one is terminal — the session happened and was
 * paid for; it keeps its time for the record and there is nothing left to move. The legacy
 * pre-migration statuses stay in for the same reason the slot engine keeps them: a document
 * the status backfill missed is still a live booking to its owner.
 */
export const RESCHEDULABLE_STATUSES: readonly string[] =
  ACTIVE_BOOKING_STATUSES.filter((status) => status !== "payment_confirmed");

/** A Firestore Timestamp, or a Date, as a Date — null for anything else or an invalid one. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  if (!stamp || typeof stamp.toDate !== "function") return null;
  const date = stamp.toDate();
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
}

/**
 * How the caller relates to this booking, or null for anyone with no business moving it.
 *
 * A participant is read as themselves even when they also hold a staff role — unlike the
 * status transitions, where admin outranks everything. Here the role decides who gets
 * notified, and an admin moving their own booking must not be told about their own change.
 */
export function rescheduleActorRole(booking: BookingLike, caller: Caller): RescheduleActorRole | null {
  if (booking.userId === caller.uid) return "client";
  if (booking.instructorId === caller.uid) return "trainer";
  return caller.isStaff ? "staff" : null;
}

/** Whoever did not move it: the other party, or both when staff did. */
export function counterpartUids(booking: BookingLike, actorRole: RescheduleActorRole): string[] {
  const client = typeof booking.userId === "string" ? booking.userId : null;
  const trainer = typeof booking.instructorId === "string" ? booking.instructorId : null;
  const targets = actorRole === "client" ? [trainer] : actorRole === "trainer" ? [client] : [client, trainer];
  return targets.filter((uid): uid is string => uid !== null);
}

/**
 * May this caller move this booking at all? Pure — no Firestore, no clock of its own — so
 * every refusal is unit-testable and the callable only has to map reasons onto error codes.
 *
 * Permission is settled first: someone with no claim on the booking learns nothing about its
 * state. `scheduledAt` is the booking's *current* start; a session that has already begun is
 * history, and moving it would rewrite the past rather than change a plan.
 */
export function checkReschedulable(
  booking: BookingLike,
  caller: Caller,
  now: Date,
): { ok: true } | { ok: false; reason: RescheduleRefusal } {
  if (!rescheduleActorRole(booking, caller)) return { ok: false, reason: "permission_denied" };

  if (typeof booking.status !== "string" || !RESCHEDULABLE_STATUSES.includes(booking.status)) {
    return { ok: false, reason: "not_reschedulable" };
  }

  const start = toDate(booking.scheduledAt);
  // Nothing readable to compare against: refuse rather than assume the session is still ahead.
  if (!start) return { ok: false, reason: "not_reschedulable" };
  if (start.getTime() <= now.getTime()) return { ok: false, reason: "past_booking" };

  return { ok: true };
}

/**
 * How long the session runs and therefore when it ends, taken from the booking and never from
 * the request — the client may not stretch a session by rescheduling it. A non-numeric stored
 * duration falls back to 60 rather than propagating NaN into `scheduledEndAt`, which would
 * make the booking invisible to every later overlap check.
 */
export function rescheduledWindow(
  booking: { durationMinutes?: unknown; duration?: unknown },
  start: Date,
): { durationMinutes: number; end: Date } {
  const stored = booking.durationMinutes ?? booking.duration;
  const durationMinutes = typeof stored === "number" && Number.isFinite(stored) && stored > 0 ? stored : 60;
  return { durationMinutes, end: new Date(start.getTime() + durationMinutes * 60_000) };
}

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

/**
 * rescheduleBooking's input. `startsAt` is an ISO instant that came from getProviderSlots —
 * never a date plus "HH:mm" the client assembled, which is exactly how the old client-side
 * reschedule moved sessions to the wrong hour. `now` is injectable for tests.
 */
export function validateRescheduleRequest(
  data: unknown,
  now: Date = new Date(),
): { bookingId: string; startsAt: Date } {
  if (!data || typeof data !== "object" || Array.isArray(data)) bad("payload must be an object");
  const d = data as Record<string, unknown>;

  const bookingId = d.bookingId;
  if (typeof bookingId !== "string" || bookingId === "" || bookingId.includes("/") ||
    bookingId.length > MAX_DOC_ID_LENGTH) {
    bad("bookingId must be a document id");
  }

  if (typeof d.startsAt !== "string") bad("startsAt must be an ISO date-time");
  const startsAt = new Date(d.startsAt);
  if (!Number.isFinite(startsAt.getTime())) bad("startsAt must be an ISO date-time");
  if (startsAt.getTime() <= now.getTime()) bad("startsAt must be in the future");

  return { bookingId, startsAt };
}

/**
 * Moves one booking to `startsAt`, which must be a free start on the trainer's own schedule.
 *
 * Runs as a callable because the availability check needs to see the provider's other
 * bookings, which clients may not read, and because `scheduledAt` is closed to client writes.
 */
export const rescheduleBooking = onCall<RescheduleRequest>(
  { region, secrets: EMAIL_SECRETS },
  async (req: CallableRequest<RescheduleRequest>) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
    const callerUid = req.auth.uid;
    const { bookingId, startsAt } = validateRescheduleRequest(req.data);

    const db = getFirestore();
    const bookingRef = db.collection("bookings").doc(bookingId);
    const [bookingSnap, callerSnap] = await Promise.all([
      bookingRef.get(),
      db.collection("users").doc(callerUid).get(),
    ]);
    if (!bookingSnap.exists) throw new HttpsError("not-found", "booking_not_found");
    const booking = bookingSnap.data() as Record<string, unknown>;

    const callerRole = callerSnap.data()?.role;
    const caller: Caller = { uid: callerUid, isStaff: callerRole === "admin" || callerRole === "superadmin" };

    const verdict = checkReschedulable(booking, caller, new Date());
    if (!verdict.ok) {
      if (verdict.reason === "permission_denied") throw new HttpsError("permission-denied", verdict.reason);
      throw new HttpsError("failed-precondition", verdict.reason);
    }
    const actorRole = rescheduleActorRole(booking, caller) as RescheduleActorRole;

    // Only a trainer's day has a schedule to validate a start against. A venue or class
    // booking has no provider availability behind it, so this callable cannot vouch for a new
    // time on one — it refuses instead of moving it unchecked.
    const instructorId = typeof booking.instructorId === "string" ? booking.instructorId : null;
    if (!instructorId) throw new HttpsError("failed-precondition", "not_reschedulable");

    const { durationMinutes, end } = rescheduledWindow(booking, startsAt);
    // checkReschedulable already proved this start parses.
    const previousStart = toDate(booking.scheduledAt) as Date;
    const newDay = romeDateOf(startsAt);
    const oldDay = romeDateOf(previousStart);

    await db.runTransaction(async (tx) => {
      // Reads before writes. readDayDocs also reads the new day's lock and the set() below
      // writes it, so concurrent requests for this provider and day queue up: the second one
      // re-reads the bookings and sees the first one's move.
      const docs = await readDayDocs(db, instructorId, newDay, tx);
      const oldDayRef = oldDay === newDay ? null : bookingDayRef(db, instructorId, oldDay);
      if (oldDayRef) await tx.get(oldDayRef);

      const decision = decideBookingStart(
        // This booking is excluded: it must not block the slot it is leaving, and it must not
        // count twice against the day's cap when it moves within its own day.
        { ...dayContextFrom(docs, newDay, bookingId), durationMinutes, now: new Date() },
        startsAt,
      );
      if (!decision.ok) throw new HttpsError("failed-precondition", "slot_unavailable");

      tx.update(bookingRef, {
        scheduledAt: Timestamp.fromDate(startsAt),
        scheduledEndAt: Timestamp.fromDate(end),
        updatedAt: FieldValue.serverTimestamp(),
        rescheduleHistory: FieldValue.arrayUnion({
          from: Timestamp.fromDate(previousStart),
          to: Timestamp.fromDate(startsAt),
          actorUid: callerUid,
          actorRole,
          // arrayUnion rejects the serverTimestamp sentinel, so this is a concrete instant.
          at: Timestamp.now(),
        }),
      });

      const lock = { lastBookingId: bookingId, updatedAt: FieldValue.serverTimestamp() };
      tx.set(bookingDayRef(db, instructorId, newDay), lock, { merge: true });
      // The day it leaves is touched too: whoever holds that day's lock must be serialised
      // against this move, or they would keep treating the freed slot as taken.
      if (oldDayRef) tx.set(oldDayRef, lock, { merge: true });
    });

    // allSettled, not all: a booking that has already moved must never fail on a notification.
    await Promise.allSettled(counterpartUids(booking, actorRole).map((uid) => notifyTransition({
      recipientUid: uid,
      event: "rescheduled",
      bookingId,
      context: { serviceName: typeof booking.serviceName === "string" ? booking.serviceName : undefined },
    })));

    return { bookingId, startsAt: startsAt.toISOString(), scheduledEndAt: end.toISOString() };
  },
);

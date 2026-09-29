/**
 * createBookingAsTrainer — the pure parts (no firebase-admin), so they are unit-testable.
 *
 * A trainer adds a session for one of their own clients from /provider/schedule
 * ("Aggiungi appuntamento"). It goes through the same slot engine and provider-day lock as
 * createBooking; what differs is who asks (the trainer, for someone else), the starting
 * status (`accepted` — the trainer is the one who would have accepted it) and the notice
 * rule (a trainer may book a client for later today, the customer-facing minimum notice is
 * about giving the trainer time to react).
 */

import { HttpsError } from "firebase-functions/v2/https";
import { dayContextFrom, type DayDocs } from "../availability/dayContext";
import { decideBookingStart, romeDateOf, type BookingRules } from "../availability/slots";
import { MAX_DOC_ID_LENGTH } from "../availability/validate";
import type { NotifyTarget } from "./notifyTargets";
import { sanitizeUserNotes } from "./userNotes";

export interface TrainerBookingRequest {
  clientUserId: string;
  serviceId: string;
  startsAt: Date;
  /** The trainer's own note on the session (sanitized; null when empty). */
  note: string | null;
}

/** How far ahead a trainer may place a session — the same horizon the slot picker offers. */
export const MAX_TRAINER_BOOKING_LOOKAHEAD_DAYS = 180;

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function docId(v: unknown, what: string): string {
  if (typeof v !== "string" || v === "" || v.includes("/") || v.length > MAX_DOC_ID_LENGTH) {
    bad(`${what} must be a document id`);
  }
  return v;
}

/**
 * Validates the callable's payload. The caller is the trainer; booking yourself as your own
 * client is refused (it would also be silently dropped by the roster and notifications).
 */
export function validateTrainerBookingRequest(
  data: unknown,
  callerUid: string,
  now: Date = new Date(),
): TrainerBookingRequest {
  if (!data || typeof data !== "object" || Array.isArray(data)) bad("payload must be an object");
  const d = data as Record<string, unknown>;
  const clientUserId = docId(d.clientUserId, "clientUserId");
  const serviceId = docId(d.serviceId, "serviceId");
  if (clientUserId === callerUid) bad("cannot_book_yourself");

  if (typeof d.startsAt !== "string") bad("startsAt must be an ISO date-time");
  const startsAt = new Date(d.startsAt);
  if (Number.isNaN(startsAt.getTime())) bad("startsAt must be an ISO date-time");
  if (startsAt.getTime() <= now.getTime()) {
    throw new HttpsError("failed-precondition", "past_start");
  }
  if (startsAt.getTime() - now.getTime() > MAX_TRAINER_BOOKING_LOOKAHEAD_DAYS * 86_400_000) {
    bad(`startsAt must be within ${MAX_TRAINER_BOOKING_LOOKAHEAD_DAYS} days`);
  }
  if (d.note !== undefined && d.note !== null && typeof d.note !== "string") bad("note must be a string");

  return { clientUserId, serviceId, startsAt, note: sanitizeUserNotes(d.note) };
}

/**
 * The provider's own rules, minus the minimum notice: that rule protects the trainer from
 * last-minute customer requests, and here the trainer is the one choosing the time. Buffer,
 * daily cap and hours still apply, so a trainer booking cannot double-book their own day.
 * Starts in the past are still impossible (freeSlots never offers a start before `now`).
 */
export function trainerSlotRules(rules: BookingRules): BookingRules {
  return { ...rules, minAdvanceNoticeHours: 0 };
}

/**
 * Is `startsAt` one of the trainer's free starts for a session of `durationMinutes`, given the
 * provider-day documents read inside the booking transaction? Same engine as createBooking
 * (dayContextFrom → decideBookingStart), with {@link trainerSlotRules}.
 */
export function decideTrainerStart(
  docs: DayDocs,
  startsAt: Date,
  durationMinutes: number,
  now: Date,
): { ok: boolean; date: string; time: string } {
  const date = romeDateOf(startsAt);
  const ctx = dayContextFrom(docs, date);
  return decideBookingStart(
    { ...ctx, rules: trainerSlotRules(ctx.rules), durationMinutes, now },
    startsAt,
  );
}

/**
 * Whether the trainer may book this person: they must already be the trainer's client — a
 * roster entry (`clients`, providerId + userId) or at least one earlier booking together. A
 * trainer cannot put sessions into a stranger's calendar.
 */
export function isTrainersClient(evidence: { rosterDocs: number; priorBookings: number }): boolean {
  return evidence.rosterDocs > 0 || evidence.priorBookings > 0;
}

/** The client hears that their trainer put a session in their calendar. */
export function trainerScheduledTarget(
  bookingId: string,
  b: {
    userId: string;
    instructorName?: string | null;
    serviceName?: string | null;
    scheduledAt: Date;
  },
): NotifyTarget {
  return {
    recipientUid: b.userId,
    event: "scheduled_by_trainer",
    bookingId,
    context: {
      ...(b.serviceName ? { serviceName: b.serviceName } : {}),
      ...(b.instructorName ? { trainerName: b.instructorName } : {}),
      startsAt: b.scheduledAt,
    },
  };
}

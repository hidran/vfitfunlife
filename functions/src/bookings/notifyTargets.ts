/**
 * Who hears about a booking event, and with what context — kept pure (no Firestore) so the
 * routing is unit-testable. The callables hand the result to `notifyTransition`.
 */

import type { BookingMessageEvent, MessageContext } from "../notifications/bookingMessages";

export interface NotifyTarget {
  recipientUid: string;
  event: BookingMessageEvent;
  bookingId: string;
  context: MessageContext;
}

/** The subset of a booking document the notification builders read. */
export interface NotifiableBooking {
  userId: string;
  instructorId?: string | null;
  userName?: string | null;
  instructorName?: string | null;
  serviceName?: string | null;
  venueName?: string | null;
  scheduledAt?: Date | null;
}

function baseContext(b: NotifiableBooking): MessageContext {
  return {
    ...(b.serviceName ? { serviceName: b.serviceName } : {}),
    ...(b.userName ? { clientName: b.userName } : {}),
    ...(b.instructorName ? { trainerName: b.instructorName } : {}),
    ...(b.venueName ? { venueName: b.venueName } : {}),
    ...(b.scheduledAt ? { startsAt: b.scheduledAt } : {}),
  };
}

/**
 * A new request goes to the assigned trainer. Venue bookings without an instructor have
 * nobody to ask, so they produce no notification. A trainer booking themselves is not news.
 */
export function newRequestTarget(bookingId: string, b: NotifiableBooking): NotifyTarget | null {
  if (!b.instructorId || b.instructorId === b.userId) return null;
  return {
    recipientUid: b.instructorId,
    event: "new_request",
    bookingId,
    context: baseContext(b),
  };
}

/**
 * Legacy `cancelBooking`: tell the side that did not cancel. A client cancel goes to the
 * trainer (with the late flag); a trainer/admin cancel goes to the client (with the reason).
 */
export function cancellationTarget(
  bookingId: string,
  b: NotifiableBooking,
  opts: { cancelledBy: "user" | "provider" | "admin"; late: boolean; reason?: string | null }
): NotifyTarget | null {
  const context = baseContext(b);
  if (opts.cancelledBy === "user") {
    if (!b.instructorId || b.instructorId === b.userId) return null;
    return {
      recipientUid: b.instructorId,
      event: "cancelled_by_client",
      bookingId,
      context: { ...context, late: opts.late, ...(opts.reason ? { reason: opts.reason } : {}) },
    };
  }
  return {
    recipientUid: b.userId,
    event: "cancelled_by_trainer",
    bookingId,
    context: { ...context, ...(opts.reason ? { reason: opts.reason } : {}) },
  };
}

/**
 * Transition note (e.g. trainer cancel reason): the frontend historically sent `reason`, the
 * callables read `note`.
 * Accept both (note wins), trimmed and capped at 500 chars.
 */
export function pickTransitionNote(data: { note?: unknown; reason?: unknown } | undefined): string | undefined {
  for (const v of [data?.note, data?.reason]) {
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 500);
  }
  return undefined;
}

/** Reminder kind for a booking `hoursUntil` from now, or null if no reminder is due. */
export function reminderKind(
  hoursUntil: number,
  flags: { reminder24hSent?: boolean; reminder2hSent?: boolean }
): "reminder_24h" | "reminder_2h" | null {
  if (hoursUntil >= 23 && hoursUntil <= 25 && !flags.reminder24hSent) return "reminder_24h";
  if (hoursUntil >= 1.5 && hoursUntil <= 2.5 && !flags.reminder2hSent) return "reminder_2h";
  return null;
}

/** Reminder copy context: service plus venue, or the trainer when there is no venue. */
export function reminderContext(b: {
  serviceName?: string | null;
  venueName?: string | null;
  instructorName?: string | null;
}): MessageContext {
  return {
    ...(b.serviceName ? { serviceName: b.serviceName } : {}),
    ...(b.venueName ? { venueName: b.venueName } : {}),
    ...(b.instructorName ? { trainerName: b.instructorName } : {}),
  };
}

/**
 * Booking status machine.
 *
 * `canTransition` is deliberately pure — no Firestore, no auth, no clock — so the whole
 * matrix is unit-testable and every callable shares one guard rather than re-deriving
 * the rules at each call site.
 *
 * Spec: docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md §6
 */

import type { BookingStatus, TransitionActorRole } from "./types";

/** No transition leaves these. */
const TERMINAL: readonly BookingStatus[] = [
  "declined",
  "cancelled_by_client",
  "cancelled_by_trainer",
  "no_show",
  "payment_confirmed",
] as const;

const ALLOWED: Record<BookingStatus, readonly BookingStatus[]> = {
  requested: ["accepted", "declined", "cancelled_by_client", "cancelled_by_trainer"],
  accepted: ["completed", "no_show", "cancelled_by_client", "cancelled_by_trainer"],
  completed: ["payment_confirmed"],
  declined: [],
  cancelled_by_client: [],
  cancelled_by_trainer: [],
  no_show: [],
  payment_confirmed: [],
};

/** Transitions only the assigned trainer (or an admin) may perform. */
const TRAINER_TRANSITIONS: readonly BookingStatus[] = [
  "accepted",
  "declined",
  "cancelled_by_trainer",
  "completed",
  "no_show",
  "payment_confirmed",
] as const;

/** Transitions only the booking's own client (or an admin) may perform. */
const CLIENT_TRANSITIONS: readonly BookingStatus[] = ["cancelled_by_client"] as const;

/** Transitions that require the session to have actually ended. */
const REQUIRES_SESSION_ENDED: readonly BookingStatus[] = ["completed", "no_show"] as const;

const LATE_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface TransitionBooking {
  userId: string;
  instructorId?: string | null;
  scheduledAt: Date;
  scheduledEndAt: Date;
}

export interface TransitionArgs {
  from: BookingStatus;
  to: BookingStatus;
  actorRole: TransitionActorRole;
  actorUid: string;
  booking: TransitionBooking;
  now: Date;
}

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export function canTransition(args: TransitionArgs): TransitionResult {
  const { from, to, actorRole, actorUid, booking, now } = args;

  if (TERMINAL.includes(from)) {
    return { ok: false, reason: `"${from}" is a terminal state` };
  }

  if (!ALLOWED[from]?.includes(to)) {
    return { ok: false, reason: `"${from}" -> "${to}" is not a valid transition` };
  }

  if (actorRole === "client") {
    if (!CLIENT_TRANSITIONS.includes(to)) {
      return { ok: false, reason: `clients may not transition a booking to "${to}"` };
    }
    if (booking.userId !== actorUid) {
      return { ok: false, reason: "caller is not the booking owner" };
    }
  }

  if (actorRole === "trainer") {
    if (!TRAINER_TRANSITIONS.includes(to)) {
      return { ok: false, reason: `trainers may not transition a booking to "${to}"` };
    }
    if (!booking.instructorId || booking.instructorId !== actorUid) {
      return { ok: false, reason: "caller is not the assigned trainer" };
    }
  }

  if (REQUIRES_SESSION_ENDED.includes(to) && now < booking.scheduledEndAt) {
    return { ok: false, reason: "the session has not ended yet" };
  }

  return { ok: true };
}

/**
 * Cancelling less than 24h before the slot is flagged, never charged.
 * PILOT: fees are out of scope; we collect the data now so a policy can be priced later.
 */
export function isLateCancellation(scheduledAt: Date, now: Date): boolean {
  return scheduledAt.getTime() - now.getTime() < LATE_CANCELLATION_WINDOW_MS;
}

/** Exposed for tests and for the admin UI's "what can I do from here" affordances. */
export function allowedNextStatuses(from: BookingStatus): readonly BookingStatus[] {
  return ALLOWED[from] ?? [];
}

/**
 * Single source of truth for how a booking status is presented.
 *
 * Before P0-1 each of BookingCard, BookingTable, BookingDetailView and the client/trainer
 * detail screens defined its own status→label→variant map. Adding a status meant editing
 * all of them, and TypeScript only caught it where the map was typed as a full Record.
 * They all read from here now.
 */

import type { BookingStatus } from '@/types/firebase';
import type { MessageKey } from '@/i18n/messages';

export type StatusTone = 'default' | 'info' | 'warning' | 'error' | 'success';

interface StatusMeta {
  labelKey: MessageKey;
  tone: StatusTone;
}

export const BOOKING_STATUS_META: Record<BookingStatus, StatusMeta> = {
  requested: { labelKey: 'booking.status.requested' as MessageKey, tone: 'warning' },
  accepted: { labelKey: 'booking.status.accepted' as MessageKey, tone: 'success' },
  declined: { labelKey: 'booking.status.declined' as MessageKey, tone: 'error' },
  cancelled_by_client: { labelKey: 'booking.status.cancelledByClient' as MessageKey, tone: 'error' },
  cancelled_by_trainer: { labelKey: 'booking.status.cancelledByTrainer' as MessageKey, tone: 'error' },
  completed: { labelKey: 'booking.status.completed' as MessageKey, tone: 'default' },
  no_show: { labelKey: 'booking.status.noShow' as MessageKey, tone: 'error' },
  payment_confirmed: { labelKey: 'booking.status.paymentConfirmed' as MessageKey, tone: 'success' },
};

/** Terminal states — nothing transitions out of these. Mirrors the server-side guard. */
export const TERMINAL_STATUSES: BookingStatus[] = [
  'declined',
  'cancelled_by_client',
  'cancelled_by_trainer',
  'no_show',
  'payment_confirmed',
];

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isCancelled(status: BookingStatus): boolean {
  return status === 'cancelled_by_client' || status === 'cancelled_by_trainer';
}

/** A session that happened, whether or not the payment has been recorded yet. */
export function isDelivered(status: BookingStatus): boolean {
  return status === 'completed' || status === 'payment_confirmed';
}

/** Live bookings: still ahead of the client, and cancellable. */
export function isActive(status: BookingStatus): boolean {
  return status === 'requested' || status === 'accepted';
}

/** The client may cancel while the session has not yet been delivered. */
export function canClientCancel(status: BookingStatus): boolean {
  return isActive(status);
}

/**
 * Server-side reschedule enforcement doesn't exist yet: the client used to merge the picker's
 * selection into a device-local Date and write bookings/{id} directly, which firestore.rules
 * denies (the owner may only update userNotes/updatedAt) and which createBooking's
 * availability enforcement would refuse anyway if it ever got through. See "Known gaps" in
 * docs/superpowers/specs/2026-09-19-provider-availability-design.md. Until a
 * validated reschedule callable exists, the action is disabled everywhere it is offered
 * (BookingCard, the client and provider booking-detail screens) and replaced with a note.
 */
export const RESCHEDULE_TEMPORARILY_DISABLED = true;

/** Whether this booking would otherwise offer a reschedule action, ignoring the flag above —
 * used to decide whether to show the "temporarily unavailable" note in its place. */
export function canReschedule(status: BookingStatus, isPast: boolean): boolean {
  return status === 'accepted' && !isPast && !RESCHEDULE_TEMPORARILY_DISABLED;
}

/** The raw eligibility check, regardless of the feature flag — for the disabled-state note. */
export function wouldBeReschedulable(status: BookingStatus, isPast: boolean): boolean {
  return status === 'accepted' && !isPast;
}

export function canReview(status: BookingStatus, hasReviewed: boolean): boolean {
  return isDelivered(status) && !hasReviewed;
}

/** Cancelling inside 24h is flagged, never charged. PILOT: no fees in the pilot. */
export const LATE_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function wouldBeLateCancellation(scheduledAt: Date, now: Date = new Date()): boolean {
  return scheduledAt.getTime() - now.getTime() < LATE_CANCELLATION_WINDOW_MS;
}

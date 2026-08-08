/**
 * Pure mapping from the legacy booking status vocabulary to the pilot machine.
 *
 * Deliberately free of firebase-admin imports so it can be unit-tested without an
 * initialized app or an emulator — same reasoning as ./transitions.
 *
 * Spec: docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md §7.3
 */

import {
  BOOKING_STATUSES,
  type BookingStatus,
  type StatusActorRole,
  type LegacyBookingStatus,
  type LegacyCancelledBy,
} from "./types";

export interface MappedStatus {
  status: BookingStatus;
  actorRole: StatusActorRole;
}

/**
 * The status enum has two cancellation states but `cancelledBy` has five values, so the
 * true actor is preserved on the history entry instead. A uniform `actorRole: "system"`
 * would erase attribution across the whole backfill and leave the P0-2 trainer-reliability
 * metric unable to tell an admin cancellation from a trainer's.
 */
export function mapLegacyStatus(
  status: LegacyBookingStatus | BookingStatus,
  cancelledBy: LegacyCancelledBy | undefined
): MappedStatus {
  switch (status) {
  case "pending":
    return { status: "requested", actorRole: "system" };
  case "confirmed":
  case "in_progress":
    return { status: "accepted", actorRole: "system" };
  case "completed":
    return { status: "completed", actorRole: "system" };
  case "no_show":
    return { status: "no_show", actorRole: "system" };
  case "cancelled":
    switch (cancelledBy) {
    case "user":
      return { status: "cancelled_by_client", actorRole: "client" };
    case "instructor":
      return { status: "cancelled_by_trainer", actorRole: "trainer" };
    case "admin":
      return { status: "cancelled_by_trainer", actorRole: "admin" };
    // "venue" and null both fall through: actorRole has no "venue" member, so venue
    // cancellations are indistinguishable from the migration marker. Acceptable for the
    // pilot — venue cancellations are not part of the trainer metric. Spec §7.3.
    default:
      return { status: "cancelled_by_trainer", actorRole: "system" };
    }
  default:
    // Already on the new vocabulary — idempotency guard.
    return { status: status as BookingStatus, actorRole: "system" };
  }
}

export function isAlreadyMigrated(status: string): boolean {
  return (BOOKING_STATUSES as readonly string[]).includes(status);
}

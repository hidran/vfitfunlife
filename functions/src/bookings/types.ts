/**
 * Booking types shared across the bookings module.
 * Mirrors `src/types/firebase.ts` on the client side — keep the two in sync.
 */

export type BookingStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "cancelled_by_client"
  | "cancelled_by_trainer"
  | "completed"
  | "no_show"
  | "payment_confirmed";

/** Who performed a transition. "system" covers scheduled jobs and the status backfill. */
export type StatusActorRole = "client" | "trainer" | "admin" | "system";

/** The roles a caller can act as. "system" is never a caller — only a recorded actor. */
export type TransitionActorRole = Exclude<StatusActorRole, "system">;

export type PaymentConfirmationMethod = "cash" | "satispay" | "bank_transfer" | "other";

export const PAYMENT_CONFIRMATION_METHODS: PaymentConfirmationMethod[] = [
  "cash",
  "satispay",
  "bank_transfer",
  "other",
];

/**
 * The legacy pre-migration enum. Retained solely so the migration can read old
 * documents; nothing else should reference it.
 */
export type LegacyBookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type LegacyCancelledBy = "user" | "instructor" | "venue" | "admin" | null;

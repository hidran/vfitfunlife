/**
 * The client's "service received" confirmation — pure rules, no Firestore.
 *
 * Payment is off-platform (decision D1, 2026-09-29): the trainer records that they were
 * paid, and the client confirms in the app that the service was received. That explicit
 * confirmation is what earns the client XP — it is the incentive to close the loop.
 *
 * XP is awarded ONLY on the client's own confirmation, never by the 48h auto-confirm job:
 * silence is not the client telling us anything, and paying XP for it would remove the
 * reason to confirm. Auto-confirm leaves `clientResponse` null, so a client who confirms
 * late still gets the XP.
 *
 * Exactly once: the award is written in the same transaction that records the response,
 * `clientResponse` can only be set once, and `paymentConfirmation.xpAwarded` is checked as
 * a second guard.
 */

import { levelFromXp } from "../users/gamification";

/** Mirrors `xpForBooking()` in src/lib/gamification.ts (functions can't import from src/). */
export const SERVICE_RECEIVED_XP = 50;

export type ClientPaymentResponse = "confirmed" | "disputed";

export interface RespondableBooking {
  userId: string;
  status: string;
  paymentConfirmation?: {
    clientResponse?: string | null;
    xpAwarded?: number | null;
  } | null;
}

export interface XpAward {
  delta: number;
  xp: number;
  level: number;
  xpToNextLevel: number;
}

export type PaymentResponsePlan =
  | {
      ok: false;
      code: "not-found" | "permission-denied" | "failed-precondition";
      message: string;
    }
  | {
      ok: true;
      /** Dotted-path update for the booking document (timestamps added by the caller). */
      bookingPatch: Record<string, unknown>;
      /** Null when nothing is earned: a dispute, a missing user doc, or already paid out. */
      xpAward: XpAward | null;
    };

/**
 * Decides what a client's confirm-or-dispute writes.
 *
 * `user` is the client's user document data, or null when it does not exist (deleted
 * account, seed data): the response is still recorded, only the XP is skipped.
 */
export function planPaymentResponse(input: {
  booking: RespondableBooking | undefined;
  uid: string;
  response: ClientPaymentResponse;
  disputeReason?: string;
  user: { xp?: unknown } | null;
}): PaymentResponsePlan {
  const { booking, uid, response, disputeReason, user } = input;

  if (!booking) return { ok: false, code: "not-found", message: "Booking not found" };
  // Only the client this booking belongs to may respond — not the trainer, not an admin.
  if (booking.userId !== uid) {
    return {
      ok: false,
      code: "permission-denied",
      message: "Only the booking's client can respond",
    };
  }
  if (booking.status !== "payment_confirmed") {
    return {
      ok: false,
      code: "failed-precondition",
      message: "No payment confirmation is pending",
    };
  }
  if (booking.paymentConfirmation?.clientResponse) {
    return { ok: false, code: "failed-precondition", message: "Already responded" };
  }

  const bookingPatch: Record<string, unknown> = {
    "paymentConfirmation.clientResponse": response,
    ...(disputeReason ? { "paymentConfirmation.disputeReason": disputeReason } : {}),
    // A dispute is surfaced to admin via the Disputes filter; it does not revert status.
    ...(response === "disputed" ? { needsAdminReview: true } : {}),
  };

  const alreadyAwarded = (booking.paymentConfirmation?.xpAwarded ?? 0) > 0;
  if (response !== "confirmed" || alreadyAwarded || !user) {
    return { ok: true, bookingPatch, xpAward: null };
  }

  const currentXp = typeof user.xp === "number" && user.xp > 0 ? user.xp : 0;
  const xp = currentXp + SERVICE_RECEIVED_XP;
  const { level, xpToNextLevel } = levelFromXp(xp);
  bookingPatch["paymentConfirmation.xpAwarded"] = SERVICE_RECEIVED_XP;

  return {
    ok: true,
    bookingPatch,
    xpAward: { delta: SERVICE_RECEIVED_XP, xp, level, xpToNextLevel },
  };
}

/**
 * Manual payment confirmation.
 *
 * Payments in the pilot happen off-platform, directly to the trainer (cash / Satispay /
 * bank transfer). The platform only *records* them — no Stripe, no funds held. The trainer
 * attests to receipt; the client optionally confirms, and silence for 48h is treated as
 * agreement (see `autoConfirmPayments`). A dispute flags the booking for admin review.
 *
 * Spec: docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md §8
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { notifyTransition } from "./notify";
import { applyTransition } from "./transitionCallables";
import { PAYMENT_CONFIRMATION_METHODS, type PaymentConfirmationMethod } from "./types";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

interface ConfirmPaymentRequest {
  bookingId: string;
  method: PaymentConfirmationMethod;
  amount: number;
  note?: string;
}

/**
 * The client's app prefills the amount from `finalPrice`, but the trainer can edit it —
 * so it is revalidated here rather than trusted.
 */
function validateAmount(raw: unknown): number {
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount)) {
    throw new HttpsError("invalid-argument", "Amount must be a number");
  }
  if (amount <= 0) {
    throw new HttpsError("invalid-argument", "Amount must be greater than zero");
  }
  if (amount > 100_000) {
    throw new HttpsError("invalid-argument", "Amount is implausibly large");
  }
  return Math.round(amount * 100) / 100;
}

function validateMethod(raw: unknown): PaymentConfirmationMethod {
  if (!PAYMENT_CONFIRMATION_METHODS.includes(raw as PaymentConfirmationMethod)) {
    throw new HttpsError(
      "invalid-argument",
      `Method must be one of: ${PAYMENT_CONFIRMATION_METHODS.join(", ")}`
    );
  }
  return raw as PaymentConfirmationMethod;
}

export const confirmBookingPayment = onCall<ConfirmPaymentRequest>(
  { region },
  (request: CallableRequest<ConfirmPaymentRequest>) => {
    // Authenticate before validating arguments. Otherwise an anonymous caller gets
    // INVALID_ARGUMENT instead of UNAUTHENTICATED, which leaks the expected payload shape
    // and is inconsistent with every other callable here.
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");

    const amount = validateAmount(request.data?.amount);
    const method = validateMethod(request.data?.method);

    return applyTransition({
      request,
      to: "payment_confirmed",
      extraFields: () => ({
        paymentConfirmation: {
          method,
          amount,
          confirmedByTrainerAt: admin.firestore.Timestamp.now(),
          clientResponse: null,
          clientRespondedAt: null,
          autoConfirmed: false,
        },
        // Keeps the existing admin payment screens and aggregateDailyStats working.
        paymentStatus: "paid",
        paymentMethod: method === "cash" ? "cash" : "mixed",
      }),
      notify: (b) => ({
        recipientUid: b.userId,
        event: "payment_confirmed",
        context: { amount },
      }),
    });
  }
);

interface RespondToPaymentRequest {
  bookingId: string;
  response: "confirmed" | "disputed";
  disputeReason?: string;
}

/**
 * The client's optional confirm-or-dispute. This does NOT change `status` — the booking
 * stays `payment_confirmed` — so it does not go through `applyTransition`.
 */
export const respondToPaymentConfirmation = onCall<RespondToPaymentRequest>(
  { region },
  async (request: CallableRequest<RespondToPaymentRequest>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");

    const uid = request.auth.uid;
    const { bookingId, response } = request.data ?? {};

    if (!bookingId) throw new HttpsError("invalid-argument", "Missing bookingId");
    if (response !== "confirmed" && response !== "disputed") {
      throw new HttpsError("invalid-argument", "Response must be 'confirmed' or 'disputed'");
    }

    const disputeReason = typeof request.data.disputeReason === "string" ?
      request.data.disputeReason.slice(0, 500) :
      undefined;

    const ref = db.collection("bookings").doc(bookingId);
    const booking = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Booking not found");

      const doc = snap.data() as {
        userId: string;
        instructorId?: string | null;
        status: string;
        serviceName?: string;
        paymentConfirmation?: { clientResponse?: string | null } | null;
      };

      // Only the client this booking belongs to may respond — not the trainer, not an admin.
      if (doc.userId !== uid) {
        throw new HttpsError("permission-denied", "Only the booking's client can respond");
      }
      if (doc.status !== "payment_confirmed") {
        throw new HttpsError("failed-precondition", "No payment confirmation is pending");
      }
      if (doc.paymentConfirmation?.clientResponse) {
        throw new HttpsError("failed-precondition", "Already responded");
      }

      tx.update(ref, {
        "paymentConfirmation.clientResponse": response,
        "paymentConfirmation.clientRespondedAt": admin.firestore.FieldValue.serverTimestamp(),
        ...(disputeReason ? { "paymentConfirmation.disputeReason": disputeReason } : {}),
        // A dispute is surfaced to admin via the Disputes filter; it does not revert status.
        ...(response === "disputed" ? { needsAdminReview: true } : {}),
        "updatedAt": admin.firestore.FieldValue.serverTimestamp(),
      });

      return doc;
    });

    // Tell the trainer either way — a dispute especially should not be silent.
    if (booking.instructorId) {
      await notifyTransition({
        recipientUid: booking.instructorId,
        event: response === "disputed" ? "payment_disputed" : "payment_client_confirmed",
        bookingId,
        context: { serviceName: booking.serviceName },
      });
    }

    return { success: true, bookingId, response };
  }
);

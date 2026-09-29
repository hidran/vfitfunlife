/**
 * Manual payment confirmation.
 *
 * Payments in the pilot happen off-platform, directly to the trainer (cash / Satispay /
 * bank transfer). The platform only *records* them — no Stripe, no funds held. The trainer
 * attests to receipt; the client confirms the service was received (earning XP — see
 * ./serviceReceived), and silence for 48h is treated as agreement (see
 * `autoConfirmPayments`, which awards no XP). A dispute flags the booking for admin review.
 *
 * Spec: docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md §8
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { EMAIL_SECRETS } from "../lib/email";
import { notifyTransition } from "./notify";
import { applyTransition } from "./transitionCallables";
import { PAYMENT_CONFIRMATION_METHODS, type PaymentConfirmationMethod } from "./types";
import { planPaymentResponse, SERVICE_RECEIVED_XP, type RespondableBooking } from "./serviceReceived";

const db = admin.firestore();
import { region } from "../lib/runtimeOptions";

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
  { region, secrets: EMAIL_SECRETS },
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
          confirmedByTrainerAt: Timestamp.now(),
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
        // The client's prompt names the XP they earn by confirming the service.
        context: { amount, xp: SERVICE_RECEIVED_XP },
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
 * The client's confirm-or-dispute. Confirming says "I received the service (and paid)"
 * and earns the client SERVICE_RECEIVED_XP, exactly once — see ./serviceReceived.
 *
 * This does NOT change `status` — the booking stays `payment_confirmed` — so it does not
 * go through `applyTransition`.
 */
export const respondToPaymentConfirmation = onCall<RespondToPaymentRequest>(
  { region, secrets: EMAIL_SECRETS },
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
    const userRef = db.collection("users").doc(uid);
    const { booking, xpAwarded } = await db.runTransaction(async (tx) => {
      // All reads before any write.
      const [snap, userSnap] = await Promise.all([tx.get(ref), tx.get(userRef)]);
      const doc = snap.exists ?
        (snap.data() as RespondableBooking & {
          instructorId?: string | null;
          serviceName?: string;
        }) :
        undefined;

      const plan = planPaymentResponse({
        booking: doc,
        uid,
        response,
        disputeReason,
        user: userSnap.exists ? (userSnap.data() ?? {}) : null,
      });
      if (!plan.ok) throw new HttpsError(plan.code, plan.message);

      const now = FieldValue.serverTimestamp();
      tx.update(ref, {
        ...plan.bookingPatch,
        "paymentConfirmation.clientRespondedAt": now,
        "updatedAt": now,
      });

      if (plan.xpAward) {
        const award = plan.xpAward;
        tx.update(userRef, {
          xp: award.xp,
          level: award.level,
          xpToNextLevel: award.xpToNextLevel,
          updatedAt: now,
        });
        // Same ledger awardXp writes; the id is per booking, so a retry cannot add a second row.
        tx.set(userRef.collection("xpTransactions").doc(`service_received_${bookingId}`), {
          delta: award.delta,
          source: "service_received",
          sourceId: bookingId,
          description: `Servizio ricevuto ${bookingId}`,
          xpAfter: award.xp,
          levelAfter: award.level,
          createdAt: now,
        });
      }

      return { booking: doc!, xpAwarded: plan.xpAward?.delta ?? 0 };
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

    return { success: true, bookingId, response, xpAwarded };
  }
);

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { writeAuditLog } from "../lib/audit";

// Match apiVersion from payments/index.ts to avoid drift across CFs.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16",
});

interface RefundData {
  paymentId: string;
  amount: number;
  reason: string;
}

/**
 * Superadmin-only: issue a Stripe refund against a transaction document.
 * Updates the transactions doc status (refunded / partially_refunded) and
 * writes an audit_logs entry.
 */
export const adminIssueRefund = onCall<RefundData>(
  { region: "europe-west1", secrets: ["STRIPE_SECRET_KEY"] },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const callerSnap = await getFirestore()
      .collection("users")
      .doc(callerUid)
      .get();
    const caller = callerSnap.data();
    if (caller?.role !== "superadmin") {
      throw new HttpsError("permission-denied", "Superadmin required");
    }

    const { paymentId, amount, reason } = req.data;
    if (!paymentId || !amount || amount <= 0 || !reason) {
      throw new HttpsError(
        "invalid-argument",
        "paymentId, positive amount, and reason required",
      );
    }

    // Canonical collection is `transactions` (not `payments`).
    const paySnap = await getFirestore()
      .collection("transactions")
      .doc(paymentId)
      .get();
    if (!paySnap.exists) {
      throw new HttpsError("not-found", "Transaction not found");
    }
    const before = paySnap.data() as {
      stripePaymentIntentId?: string;
      amount?: number;
      status?: string;
    };
    if (!before.stripePaymentIntentId) {
      throw new HttpsError(
        "failed-precondition",
        "Transaction missing stripePaymentIntentId",
      );
    }
    if (amount > (before.amount ?? 0)) {
      throw new HttpsError(
        "invalid-argument",
        "Refund amount exceeds transaction amount",
      );
    }

    const refund = await stripe.refunds.create({
      payment_intent: before.stripePaymentIntentId,
      amount: Math.round(amount * 100),
      reason: "requested_by_customer",
      metadata: { adminUid: callerUid, reason },
    });

    const newStatus =
      amount >= (before.amount ?? 0) ? "refunded" : "partially_refunded";

    await getFirestore().collection("transactions").doc(paymentId).update({
      status: newStatus,
      refundedAmount: amount,
      refundedAt: FieldValue.serverTimestamp(),
      stripeRefundId: refund.id,
    });

    await writeAuditLog({
      actorUid: callerUid,
      actorEmail: caller?.email ?? "",
      actorRole: "superadmin",
      action: "refund",
      entityType: "payment",
      entityId: paymentId,
      before,
      after: {
        status: newStatus,
        refundedAmount: amount,
        stripeRefundId: refund.id,
      },
      reason,
    });

    return { ok: true, refundId: refund.id };
  },
);

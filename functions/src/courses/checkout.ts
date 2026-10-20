import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { Timestamp } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { region } from "../lib/runtimeOptions";
import { getStripe } from "../lib/stripeClient";
import { readPaymentSettings } from "../payments/paymentSettingsCallables";
import { checkoutActive, paymentDecision } from "./core";
import { db, safeId, uidOf, nowStamp, Enrollment, Session } from "./store";
import { queueCourseNotification } from "./notifications";
import { releaseEnrollment } from "./operations";

function returnOrigin(): string {
  const project = process.env.GCLOUD_PROJECT;
  if (project === "vfit-app-staging") return "https://vfit-app-staging.web.app";
  if (project === "vfit-funlife") return "https://vfit-funlife.web.app";
  return "http://localhost:3000";
}
export const createCourseCheckout = onCall(
  { region, secrets: ["STRIPE_SECRET_KEY"] }, async (req) => {
    const uid = uidOf(req.auth);
    if (!checkoutActive(await readPaymentSettings())) {
      throw new HttpsError("failed-precondition", "Online course payments are not enabled");
    }
    const id = safeId(req.data.enrollmentId);
    const ref = db.doc(`courseEnrollments/${id}`);
    const e = await db.runTransaction(async (tx) => {
      const stored = (await tx.get(ref)).data() as Enrollment | undefined;
      if (!stored || stored.userId !== uid) throw new HttpsError("permission-denied", "enrollment_owner_required");
      // Stripe rejects zero-amount sessions; free bookings are never held, so a zero total is a corrupt hold.
      if (stored.paymentMode !== "stripe" || stored.state !== "held" || stored.totalCents <= 0 ||
        stored.holdExpiresAt.toMillis() <= Date.now()) {
        throw new HttpsError("failed-precondition", "checkout_hold_unavailable");
      }
      if (!stored.checkoutExpiresAt && !stored.checkoutUrl) {
        // Immutable creation deadline with one minute of network slack beyond Stripe's 30-minute minimum.
        const expiry = Timestamp.fromMillis((Math.ceil(Date.now() / 1000) + 1860) * 1000);
        tx.update(ref, { checkoutExpiresAt: expiry, holdExpiresAt: expiry });
        return { ...stored, checkoutExpiresAt: expiry, holdExpiresAt: expiry };
      }
      return stored;
    });
    if (e.checkoutUrl) return { url: e.checkoutUrl };
    const stripe = await getStripe();
    const origin = returnOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "payment", payment_method_types: ["card"],
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: e.totalCents,
        product_data: { name: e.courseName } } }],
      metadata: { courseEnrollmentId: id, userId: uid },
      payment_intent_data: { metadata: { courseEnrollmentId: id, userId: uid } },
      // Retries use identical parameters with the enrollment idempotency key.
      expires_at: Math.round(e.checkoutExpiresAt!.toMillis() / 1000),
      success_url: `${origin}/courses?tab=bookings&checkout=success`,
      cancel_url: `${origin}/courses?tab=bookings&checkout=cancelled`,
    }, { idempotencyKey: `course-checkout-${id}` });
    await ref.update({ checkoutSessionId: session.id, checkoutUrl: session.url, updatedAt: nowStamp() });
    return { url: session.url };
  }
);

export async function fulfillCourseCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const id = safeId(session.metadata?.courseEnrollmentId);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`courseEnrollments/${id}`);
    const e = (await tx.get(ref)).data() as Enrollment | undefined;
    if (!e || e.paymentMode !== "stripe") throw new Error("enrollment_not_found");
    const decision = paymentDecision({ ...e, holdExpiresAt: e.holdExpiresAt.toDate() }, session, new Date());
    if (decision === "ignore" || e.checkoutSettled) return;
    const sessions = e.activeSessionIds.length ? await tx.getAll(
      ...e.activeSessionIds.map((s) => db.doc(`courses/${e.courseId}/sessions/${s}`))) : [];
    const unavailable = sessions.some((d) => !d.exists || d.data()?.state !== "scheduled");
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!intentId) throw new Error("payment_intent_missing");
    if (decision === "refund" || unavailable) {
      if (e.state === "held") {
        sessions.forEach((d) => {
          const s = d.data() as Session;
          if (s.held < 1) throw new Error("seat_counter_inconsistent");
          tx.update(d.ref, { held: s.held - 1 });
          tx.delete(d.ref.collection("participants").doc(e.userId));
        });
        tx.update(ref, { state: "expired", activeSessionIds: [], updatedAt: nowStamp() });
      }
      tx.set(db.doc(`courseRefunds/${id}_late`), { enrollmentId: id, providerId: e.providerId, userId: e.userId,
        amountCents: e.totalCents, paymentMode: "stripe", paymentIntentId: intentId,
        status: "pending", createdAt: nowStamp() }, { merge: true });
      tx.update(ref, { stripePaymentIntentId: intentId, paymentStatus: "paid", checkoutSettled: true,
        providerAmountOwedCents: 0, paymentException: "late_or_cancelled" });
      return;
    }
    sessions.forEach((d) => {
      const s = d.data() as Session;
      if (s.held < 1) throw new Error("seat_counter_inconsistent");
      tx.update(d.ref, { held: s.held - 1, occupied: s.occupied + 1 });
      tx.update(d.ref.collection("participants").doc(e.userId), { state: "confirmed" });
    });
    tx.update(ref, { state: "confirmed", checkoutSettled: true, paymentStatus: "paid", paidCents: e.totalCents,
      stripePaymentIntentId: intentId, checkoutSessionId: session.id, paidAt: nowStamp(),
      providerAmountOwedCents: e.totalCents, updatedAt: nowStamp() });
    queueCourseNotification(tx, id, "accepted", e.userId, { name: e.courseName });
    queueCourseNotification(tx, id, "new_request", e.providerId, { name: e.courseName, providerId: e.providerId });
  });
}

export async function reconcileRefundStatus(
  refundId: string, stripeRefundId: string, status: "completed" | "failed" | "processing"
): Promise<void> {
  const ref = db.doc(`courseRefunds/${refundId}`);
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (!current || current.status === "completed" ||
      (current.status === "failed" && status !== "completed")) return;
    if (current.stripeRefundId && current.stripeRefundId !== stripeRefundId) throw new Error("refund_id_mismatch");
    tx.update(ref, { stripeRefundId, status, updatedAt: nowStamp() });
  });
}
export async function processCourseRefund(refundId: string): Promise<void> {
  const ref = db.doc(`courseRefunds/${refundId}`);
  const data = (await ref.get()).data();
  if (!data || data.paymentMode !== "stripe" || ["completed", "failed"].includes(data.status)) return;
  const stripe = await getStripe();
  let refund: Stripe.Refund;
  if (data.stripeRefundId) refund = await stripe.refunds.retrieve(data.stripeRefundId);
  else {
    // Recover an external success whose Firestore write was lost, even beyond Stripe's key retention window.
    let recovered: Stripe.Refund | undefined;
    let cursor: string | undefined;
    do {
      const existing = await stripe.refunds.list({ payment_intent: data.paymentIntentId, limit: 100,
        ...(cursor ? { starting_after: cursor } : {}) });
      recovered = existing.data.find((r) => r.metadata?.courseRefundId === refundId);
      cursor = !recovered && existing.has_more ? existing.data[existing.data.length - 1]?.id : undefined;
    } while (cursor);
    refund = recovered ?? await stripe.refunds.create({
      payment_intent: data.paymentIntentId, amount: data.amountCents, metadata: { courseRefundId: refundId },
    }, { idempotencyKey: `course-refund-${refundId}` });
  }
  await reconcileRefundStatus(refundId, refund.id,
    refund.status === "succeeded" ? "completed" : refund.status === "failed" ? "failed" : "processing");
}

export const courseStripeWebhook = onRequest(
  { region, secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] }, async (req, res) => {
    try {
      const stripe = await getStripe();
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string" || !process.env.STRIPE_WEBHOOK_SECRET) {
        res.status(400).send("Missing signature"); return;
      }
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
      } catch {
        res.status(400).send("Invalid signature"); return;
      }
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.courseEnrollmentId) await fulfillCourseCheckout(session);
      } else if (event.type === "checkout.session.expired") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.courseEnrollmentId) {
          await releaseEnrollment(safeId(session.metadata.courseEnrollmentId), { kind: "system" }, undefined, "", true);
        }
      } else if (event.type === "refund.updated") {
        const refund = event.data.object as Stripe.Refund;
        if (refund.metadata?.courseRefundId) {
          await reconcileRefundStatus(safeId(refund.metadata.courseRefundId), refund.id,
            refund.status === "succeeded" ? "completed" : refund.status === "failed" ? "failed" : "processing");
        }
      }
      res.json({ received: true });
    } catch (error) {
      logger.error("courseStripeWebhook", error); res.status(500).send("Webhook processing failed");
    }
  }
);

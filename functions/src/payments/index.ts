import { onCall, onRequest, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import Stripe from "stripe";

// Re-export admin-only payment mutations (superadmin-gated refunds)
export * from "./admin";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16",
});

interface PaymentIntentData {
  bookingId: string;
  isDeposit: boolean;
}

interface VipSubscriptionData {
  planId: string;
}

interface WalletFundsData {
  amount: number;
}

/**
 * Create a Stripe customer for a user
 */
export const createStripeCustomer = onCall(
  { region, secrets: ["STRIPE_SECRET_KEY"] },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    const userData = userDoc.data()!;

    if (userData.stripeCustomerId) {
      return { customerId: userData.stripeCustomerId };
    }

    const customer = await stripe.customers.create({
      email: userData.email || undefined,
      phone: userData.phone || undefined,
      name: userData.fullName,
      metadata: {
        firebaseUserId: userId,
      },
    });

    await db.collection("users").doc(userId).update({
      stripeCustomerId: customer.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { customerId: customer.id };
  }
);

/**
 * Create a payment intent for a booking
 */
export const createPaymentIntent = onCall<PaymentIntentData>(
  { region, secrets: ["STRIPE_SECRET_KEY"] },
  async (request: CallableRequest<PaymentIntentData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { bookingId, isDeposit } = request.data;

    const bookingDoc = await db.collection("bookings").doc(bookingId).get();

    if (!bookingDoc.exists) {
      throw new HttpsError("not-found", "Booking not found");
    }

    const booking = bookingDoc.data()!;

    if (booking.userId !== userId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.stripeCustomerId) {
      throw new HttpsError("failed-precondition", "No Stripe customer found");
    }

    const amount = isDeposit ? booking.depositAmount : booking.finalPrice;
    const amountInCents = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "eur",
      customer: userData.stripeCustomerId,
      metadata: {
        bookingId,
        userId,
        isDeposit: isDeposit ? "true" : "false",
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    await db.collection("bookings").doc(bookingId).update({
      stripePaymentIntentId: paymentIntent.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }
);

/**
 * Create a VIP subscription
 */
export const createVipSubscription = onCall<VipSubscriptionData>(
  { region, secrets: ["STRIPE_SECRET_KEY"] },
  async (request: CallableRequest<VipSubscriptionData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { planId } = request.data;

    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    const userData = userDoc.data()!;

    if (userData.isVip && userData.stripeSubscriptionId) {
      throw new HttpsError("already-exists", "User already has an active VIP subscription");
    }

    const planDoc = await db.collection("vipPlans").doc(planId).get();

    if (!planDoc.exists) {
      throw new HttpsError("not-found", "VIP plan not found");
    }

    const plan = planDoc.data()!;

    if (!plan.isActive) {
      throw new HttpsError("not-found", "VIP plan not found");
    }

    let customerId = userData.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.email || undefined,
        phone: userData.phone || undefined,
        name: userData.fullName,
        metadata: { firebaseUserId: userId },
      });
      customerId = customer.id;

      await db.collection("users").doc(userId).update({
        stripeCustomerId: customerId,
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        firebaseUserId: userId,
        planId,
      },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
    };
  }
);

/**
 * Stripe webhook handler
 */
export const stripeWebhook = onRequest(
  { region, secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("Stripe webhook secret not configured");
      res.status(500).send("Webhook secret not configured");
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      res.status(400).send(`Webhook Error: ${err}`);
      return;
    }

    try {
      switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      default:
        console.info(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Error processing webhook:", error);
      res.status(500).send("Webhook processing error");
    }
  }
);

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { bookingId, userId, isDeposit } = paymentIntent.metadata;

  if (!bookingId) return;

  const bookingRef = db.collection("bookings").doc(bookingId);

  if (isDeposit === "true") {
    await bookingRef.update({
      depositPaid: true,
      paymentStatus: "deposit_paid",
      paymentMethod: "card",
      status: "confirmed",
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    const booking = (await bookingRef.get()).data();

    await bookingRef.update({
      paymentStatus: "paid",
      paymentMethod: "card",
      status: "confirmed",
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Award points after full payment
    if (booking && booking.pointsEarned > 0) {
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      const userData = userDoc.data();

      await userRef.update({
        pointsBalance: admin.firestore.FieldValue.increment(booking.pointsEarned),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("users").doc(userId).collection("pointsTransactions").add({
        points: booking.pointsEarned,
        type: "earned",
        source: "booking",
        sourceId: bookingId,
        description: `Punti guadagnati per ${booking.serviceName}`,
        balanceAfter: (userData?.pointsBalance || 0) + booking.pointsEarned,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  // Send confirmation notification
  await db.collection("users").doc(userId).collection("notifications").add({
    title: "Pagamento confermato",
    body: "Il tuo pagamento è stato elaborato con successo",
    type: "booking_confirmed",
    data: { bookingId },
    imageUrl: null,
    isRead: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const { bookingId, userId } = paymentIntent.metadata;

  if (!bookingId) return;

  await db.collection("users").doc(userId).collection("notifications").add({
    title: "Pagamento non riuscito",
    body: "Il pagamento non è andato a buon fine. Riprova.",
    type: "system",
    data: { bookingId },
    imageUrl: null,
    isRead: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const { firebaseUserId, planId } = subscription.metadata;

  if (!firebaseUserId) return;

  const isActive = subscription.status === "active";

  await db.collection("users").doc(firebaseUserId).update({
    isVip: isActive,
    vipPlanId: isActive ? planId : null,
    stripeSubscriptionId: subscription.id,
    vipExpiresAt: isActive ?
      admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000) :
      null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const { firebaseUserId } = subscription.metadata;

  if (!firebaseUserId) return;

  await db.collection("users").doc(firebaseUserId).update({
    isVip: false,
    vipPlanId: null,
    stripeSubscriptionId: null,
    vipExpiresAt: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  // Handle subscription renewal
  const subscription = invoice.subscription as string;
  if (!subscription) return;

  const sub = await stripe.subscriptions.retrieve(subscription);
  const { firebaseUserId } = sub.metadata;

  if (!firebaseUserId) return;

  await db.collection("users").doc(firebaseUserId).update({
    vipExpiresAt: admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Add funds to user wallet
 */
export const addWalletFunds = onCall<WalletFundsData>(
  { region, secrets: ["STRIPE_SECRET_KEY"] },
  async (request: CallableRequest<WalletFundsData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { amount } = request.data;

    if (amount < 10 || amount > 500) {
      throw new HttpsError("invalid-argument", "Amount must be between €10 and €500");
    }

    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.stripeCustomerId) {
      throw new HttpsError("failed-precondition", "No Stripe customer found");
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "eur",
      customer: userData.stripeCustomerId,
      metadata: {
        userId,
        type: "wallet_topup",
        amount: amount.toString(),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
    };
  }
);

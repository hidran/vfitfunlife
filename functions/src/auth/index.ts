import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { generateReferralCode } from "../utils/helpers";
import { resolveEmailVerified } from "./emailVerification";

export { syncEmailVerification } from "./emailVerification";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

interface ReferralData {
  referralCode: string;
}

/**
 * Initialize user profile after Firebase Auth creation.
 * Called from client after sign-up.
 */
export const initializeUserProfile = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const userRecord = await admin.auth().getUser(userId);
    const { email, phoneNumber, displayName, photoURL } = userRecord;

    // Check if user already exists in Firestore
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      // Update last login
      await db.collection("users").doc(userId).update({
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: true, isNewUser: false };
    }

    const referralCode = generateReferralCode(userId);
    // Google/Apple sign-ins arrive verified; email/password accounts don't.
    const emailVerified = await resolveEmailVerified(userRecord);

    const userData = {
      uid: userId,
      email: email || null,
      phone: phoneNumber || null,
      fullName: displayName || "",
      avatarUrl: photoURL || null,
      dateOfBirth: null,

      // Role and permissions
      role: "customer",
      permissions: [
        "bookings:read",
        "bookings:write",
        "bookings:cancel",
        "services:read",
        "venues:read",
        "promotions:read",
      ],

      // Status flags
      isActive: true,
      isVerified: false,
      emailVerified,

      // VIP Status
      isVip: false,
      vipExpiresAt: null,
      vipPlanId: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,

      // Balances
      pointsBalance: 100, // Welcome points
      walletBalance: 0,

      // Preferences
      preferredLanguage: "it",
      preferredSection: "fit",

      // Push tokens
      fcmTokens: [],

      // Referral
      referralCode,
      referredBy: null,
      referralCount: 0,

      // Timestamps
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await db.collection("users").doc(userId).set(userData);

      // Award welcome points transaction
      await db.collection("users").doc(userId).collection("pointsTransactions").add({
        points: 100,
        type: "bonus",
        source: "welcome",
        sourceId: null,
        description: "Punti di benvenuto",
        balanceAfter: 100,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`User profile initialized for ${userId}`);
      return { success: true, isNewUser: true };
    } catch (error) {
      console.error(`Error initializing user profile for ${userId}:`, error);
      throw new HttpsError("internal", "Failed to initialize user profile");
    }
  }
);

/**
 * Triggered when a user document is marked as deleted.
 * Handles cleanup of user data.
 */
export const onUserDeleted = onDocumentCreated(
  { region, document: "deletedUsers/{userId}" },
  async (event) => {
    const userId = event.params.userId;
    console.log(`User ${userId} marked for deletion`);
    // Additional cleanup logic can be added here
  }
);

/**
 * Callable function to apply a referral code
 */
export const applyReferralCode = onCall<ReferralData>(
  { region },
  async (request: CallableRequest<ReferralData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { referralCode } = request.data;

    // Find referrer by code
    const referrerSnapshot = await db
      .collection("users")
      .where("referralCode", "==", referralCode)
      .limit(1)
      .get();

    if (referrerSnapshot.empty) {
      throw new HttpsError("not-found", "Invalid referral code");
    }

    const referrerId = referrerSnapshot.docs[0].id;

    // Check if user already has a referrer
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (userData?.referredBy) {
      throw new HttpsError("already-exists", "Referral code already applied");
    }

    // Can't refer yourself
    if (referrerId === userId) {
      throw new HttpsError("invalid-argument", "Cannot use your own referral code");
    }

    const batch = db.batch();
    const referralPoints = 500;

    // Update user with referrer
    batch.update(db.collection("users").doc(userId), {
      referredBy: referrerId,
      pointsBalance: admin.firestore.FieldValue.increment(referralPoints),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Award points to referrer
    batch.update(db.collection("users").doc(referrerId), {
      referralCount: admin.firestore.FieldValue.increment(1),
      pointsBalance: admin.firestore.FieldValue.increment(referralPoints),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create points transactions
    const userPointsRef = db.collection("users").doc(userId).collection("pointsTransactions").doc();
    batch.set(userPointsRef, {
      points: referralPoints,
      type: "bonus",
      source: "referral",
      sourceId: referrerId,
      description: "Bonus referral",
      balanceAfter: (userData?.pointsBalance || 0) + referralPoints,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const referrerData = referrerSnapshot.docs[0].data();
    const referrerPointsRef = db.collection("users").doc(referrerId).collection("pointsTransactions").doc();
    batch.set(referrerPointsRef, {
      points: referralPoints,
      type: "bonus",
      source: "referral",
      sourceId: userId,
      description: "Bonus referral - nuovo utente",
      balanceAfter: (referrerData?.pointsBalance || 0) + referralPoints,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return { success: true, pointsEarned: referralPoints };
  }
);

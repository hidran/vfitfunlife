import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { generateReferralCode } from "../utils/helpers";
import { requireAuth } from "../utils/validation";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

interface ReferralData {
  referralCode: string;
}

/**
 * Triggered when a new user is created in Firebase Auth.
 * Creates the user document in Firestore with default values.
 */
export const onUserCreated = functions.region(region).auth.user().onCreate(async (user) => {
  const { uid, email, phoneNumber, displayName, photoURL } = user;

  const referralCode = generateReferralCode(uid);

  const userData = {
    uid,
    email: email || null,
    phone: phoneNumber || null,
    fullName: displayName || "",
    avatarUrl: photoURL || null,
    dateOfBirth: null,

    // VIP Status
    isVip: false,
    vipExpiresAt: null,
    vipPlanId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,

    // Balances
    pointsBalance: 0,
    walletBalance: 0,

    // Preferences
    preferredLanguage: "it",
    preferredSection: "fit",
    notificationsEnabled: true,

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
    await db.collection("users").doc(uid).set(userData);

    // Award welcome points
    await db.collection("users").doc(uid).collection("pointsTransactions").add({
      points: 100,
      type: "bonus",
      source: "welcome",
      sourceId: null,
      description: "Punti di benvenuto",
      balanceAfter: 100,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection("users").doc(uid).update({
      pointsBalance: 100,
    });

    functions.logger.info(`User document created for ${uid}`);
  } catch (error) {
    functions.logger.error(`Error creating user document for ${uid}:`, error);
    throw error;
  }
});

/**
 * Triggered when a user is deleted from Firebase Auth.
 * Handles cleanup of user data.
 */
export const onUserDeleted = functions.region(region).auth.user().onDelete(async (user) => {
  const { uid } = user;

  try {
    // Note: In production, you might want to soft-delete or archive instead
    await db.collection("users").doc(uid).update({
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      isDeleted: true,
    });

    functions.logger.info(`User ${uid} marked as deleted`);
  } catch (error) {
    functions.logger.error(`Error handling user deletion for ${uid}:`, error);
    throw error;
  }
});

/**
 * Callable function to apply a referral code
 */
export const applyReferralCode = functions.region(region).https.onCall(async (data: ReferralData, context) => {
  const userId = requireAuth(context);
  const { referralCode } = data;

  // Find referrer by code
  const referrerSnapshot = await db
    .collection("users")
    .where("referralCode", "==", referralCode)
    .limit(1)
    .get();

  if (referrerSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Invalid referral code");
  }

  const referrerId = referrerSnapshot.docs[0].id;

  // Check if user already has a referrer
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();

  if (userData?.referredBy) {
    throw new functions.https.HttpsError("already-exists", "Referral code already applied");
  }

  // Can't refer yourself
  if (referrerId === userId) {
    throw new functions.https.HttpsError("invalid-argument", "Cannot use your own referral code");
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
});

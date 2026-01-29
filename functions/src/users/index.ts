import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Update user profile
 */
export const updateProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userId = context.auth.uid;
  const allowedFields = [
    "fullName",
    "dateOfBirth",
    "preferredLanguage",
    "preferredSection",
    "notificationsEnabled",
  ];

  const updates: Record<string, any> = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates[field] = data[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "No valid fields to update");
  }

  updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  await db.collection("users").doc(userId).update(updates);

  return { success: true };
});

/**
 * Get user stats
 */
export const getUserStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userId = context.auth.uid;

  // Get completed bookings count
  const completedBookings = await db
    .collection("bookings")
    .where("userId", "==", userId)
    .where("status", "==", "completed")
    .count()
    .get();

  // Get total points earned
  const pointsEarned = await db
    .collection("users")
    .doc(userId)
    .collection("pointsTransactions")
    .where("type", "==", "earned")
    .get();

  const totalPointsEarned = pointsEarned.docs.reduce((sum, doc) => sum + doc.data().points, 0);

  // Get reviews count
  const reviewsWritten = await db
    .collection("venues")
    .doc()
    .collection("reviews")
    .where("userId", "==", userId)
    .count()
    .get();

  // Get active challenges
  const activeChallenges = await db
    .collection("users")
    .doc(userId)
    .collection("userChallenges")
    .where("status", "==", "in_progress")
    .count()
    .get();

  // Get referrals count
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();

  return {
    completedBookings: completedBookings.data().count,
    totalPointsEarned,
    reviewsWritten: reviewsWritten.data().count,
    activeChallenges: activeChallenges.data().count,
    referralCount: userData?.referralCount || 0,
  };
});

/**
 * Add or update user address
 */
export const saveAddress = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userId = context.auth.uid;
  const { addressId, address } = data;

  const addressData = {
    label: address.label,
    street: address.street,
    streetNumber: address.streetNumber,
    city: address.city,
    postalCode: address.postalCode,
    province: address.province,
    country: address.country || "Italia",
    location: new admin.firestore.GeoPoint(address.latitude, address.longitude),
    geohash: address.geohash,
    isDefault: address.isDefault || false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // If setting as default, unset other defaults
  if (address.isDefault) {
    const existingDefaults = await db
      .collection("users")
      .doc(userId)
      .collection("addresses")
      .where("isDefault", "==", true)
      .get();

    const batch = db.batch();
    existingDefaults.docs.forEach((doc) => {
      batch.update(doc.ref, { isDefault: false });
    });
    await batch.commit();
  }

  if (addressId) {
    await db
      .collection("users")
      .doc(userId)
      .collection("addresses")
      .doc(addressId)
      .update(addressData);
    return { addressId };
  } else {
    const newRef = await db
      .collection("users")
      .doc(userId)
      .collection("addresses")
      .add(addressData);
    return { addressId: newRef.id };
  }
});

/**
 * Delete user address
 */
export const deleteAddress = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userId = context.auth.uid;
  const { addressId } = data;

  await db
    .collection("users")
    .doc(userId)
    .collection("addresses")
    .doc(addressId)
    .delete();

  return { success: true };
});

/**
 * Get leaderboard
 */
export const getLeaderboard = functions.https.onCall(async (data, context) => {
  const { type = "points", limit = 10 } = data;

  let query;

  if (type === "points") {
    query = db
      .collection("users")
      .orderBy("pointsBalance", "desc")
      .limit(limit);
  } else if (type === "bookings") {
    // This would need a counter field on user document
    query = db
      .collection("users")
      .orderBy("totalBookings", "desc")
      .limit(limit);
  } else {
    throw new functions.https.HttpsError("invalid-argument", "Invalid leaderboard type");
  }

  const snapshot = await query.get();

  const leaderboard = snapshot.docs.map((doc, index) => {
    const data = doc.data();
    return {
      rank: index + 1,
      userId: doc.id,
      fullName: data.fullName,
      avatarUrl: data.avatarUrl,
      value: type === "points" ? data.pointsBalance : data.totalBookings,
      isVip: data.isVip,
    };
  });

  return { leaderboard };
});

/**
 * Submit a review
 */
export const submitReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userId = context.auth.uid;
  const { bookingId, rating, comment, images } = data;

  // Validate booking
  const bookingDoc = await db.collection("bookings").doc(bookingId).get();
  const booking = bookingDoc.data();

  if (!booking) {
    throw new functions.https.HttpsError("not-found", "Booking not found");
  }

  if (booking.userId !== userId) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized");
  }

  if (booking.hasReviewed) {
    throw new functions.https.HttpsError("already-exists", "Review already submitted");
  }

  if (booking.status !== "completed") {
    throw new functions.https.HttpsError("failed-precondition", "Booking not completed");
  }

  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();

  // Create review
  const reviewData = {
    userId,
    userName: userData?.fullName || "Utente",
    userAvatarUrl: userData?.avatarUrl || null,
    bookingId,
    rating,
    comment: comment || "",
    images: images || [],
    isVerified: true, // Verified because they have a booking
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const batch = db.batch();

  // Add to venue reviews
  const venueReviewRef = db
    .collection("venues")
    .doc(booking.venueId)
    .collection("reviews")
    .doc();
  batch.set(venueReviewRef, reviewData);

  // Add to instructor reviews if applicable
  if (booking.instructorId) {
    const instructorReviewRef = db
      .collection("instructors")
      .doc(booking.instructorId)
      .collection("reviews")
      .doc();
    batch.set(instructorReviewRef, reviewData);
  }

  // Update booking
  batch.update(db.collection("bookings").doc(bookingId), {
    hasReviewed: true,
    reviewId: venueReviewRef.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Award points for review
  const reviewPoints = 50;
  batch.update(db.collection("users").doc(userId), {
    pointsBalance: admin.firestore.FieldValue.increment(reviewPoints),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const pointsTransactionRef = db
    .collection("users")
    .doc(userId)
    .collection("pointsTransactions")
    .doc();
  batch.set(pointsTransactionRef, {
    points: reviewPoints,
    type: "earned",
    source: "review",
    sourceId: venueReviewRef.id,
    description: "Punti per recensione",
    balanceAfter: (userData?.pointsBalance || 0) + reviewPoints,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Update venue rating (async)
  updateVenueRating(booking.venueId);

  // Update instructor rating if applicable
  if (booking.instructorId) {
    updateInstructorRating(booking.instructorId);
  }

  return { reviewId: venueReviewRef.id, pointsEarned: reviewPoints };
});

async function updateVenueRating(venueId: string) {
  const reviews = await db
    .collection("venues")
    .doc(venueId)
    .collection("reviews")
    .get();

  const totalRating = reviews.docs.reduce((sum, doc) => sum + doc.data().rating, 0);
  const avgRating = reviews.size > 0 ? totalRating / reviews.size : 0;

  await db.collection("venues").doc(venueId).update({
    ratingAvg: Math.round(avgRating * 10) / 10,
    reviewCount: reviews.size,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function updateInstructorRating(instructorId: string) {
  const reviews = await db
    .collection("instructors")
    .doc(instructorId)
    .collection("reviews")
    .get();

  const totalRating = reviews.docs.reduce((sum, doc) => sum + doc.data().rating, 0);
  const avgRating = reviews.size > 0 ? totalRating / reviews.size : 0;

  await db.collection("instructors").doc(instructorId).update({
    ratingAvg: Math.round(avgRating * 10) / 10,
    reviewCount: reviews.size,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

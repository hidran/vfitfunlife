import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { addMinutes } from "date-fns";

const db = admin.firestore();

/**
 * Create a new booking
 */
export const createBooking = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userId = context.auth.uid;
  const {
    venueId,
    serviceId,
    instructorId,
    scheduledAt,
    bookingType,
    serviceAddress,
    promotionCode,
    usePoints,
    userNotes,
  } = data;

  // Fetch user data
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();
  if (!userData) {
    throw new functions.https.HttpsError("not-found", "User not found");
  }

  // Fetch venue and service data
  const venueDoc = await db.collection("venues").doc(venueId).get();
  const venue = venueDoc.data();
  if (!venue) {
    throw new functions.https.HttpsError("not-found", "Venue not found");
  }

  const serviceDoc = await db.collection("venues").doc(venueId).collection("services").doc(serviceId).get();
  const service = serviceDoc.data();
  if (!service) {
    throw new functions.https.HttpsError("not-found", "Service not found");
  }

  // Fetch instructor if specified
  let instructor = null;
  if (instructorId) {
    const instructorDoc = await db.collection("instructors").doc(instructorId).get();
    instructor = instructorDoc.data();
  }

  // Calculate pricing
  let originalPrice = service.price;
  let discountAmount = 0;
  let homeServiceFee = 0;
  let promotionId = null;

  // Apply VIP discount
  if (userData.isVip && service.vipPrice) {
    originalPrice = service.vipPrice;
  }

  // Apply home service fee
  if (bookingType === "home_service" && service.isHomeService) {
    homeServiceFee = service.homeServiceFee || 0;
  }

  // Apply promotion code
  if (promotionCode) {
    const promoSnapshot = await db
      .collection("promotions")
      .where("code", "==", promotionCode.toUpperCase())
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (!promoSnapshot.empty) {
      const promo = promoSnapshot.docs[0].data();
      const now = new Date();

      if (
        promo.validFrom.toDate() <= now &&
        promo.validUntil.toDate() >= now &&
        (promo.maxUses === null || promo.currentUses < promo.maxUses)
      ) {
        promotionId = promoSnapshot.docs[0].id;

        if (promo.discountType === "percentage") {
          discountAmount = (originalPrice * promo.discountValue) / 100;
          if (promo.maxDiscount) {
            discountAmount = Math.min(discountAmount, promo.maxDiscount);
          }
        } else if (promo.discountType === "fixed_amount") {
          discountAmount = promo.discountValue;
        }

        // Increment promo usage
        await db.collection("promotions").doc(promotionId).update({
          currentUses: admin.firestore.FieldValue.increment(1),
        });
      }
    }
  }

  // Calculate points usage
  let pointsUsed = 0;
  let pointsValue = 0;
  const pointsRate = 0.01; // 1 point = €0.01

  if (usePoints && userData.pointsBalance > 0) {
    const maxPointsToUse = Math.floor((originalPrice - discountAmount) / pointsRate);
    pointsUsed = Math.min(userData.pointsBalance, maxPointsToUse);
    pointsValue = pointsUsed * pointsRate;
  }

  // Calculate final price
  const finalPrice = Math.max(0, originalPrice - discountAmount - pointsValue + homeServiceFee);
  const depositAmount = service.requiresDeposit ? (service.depositAmount || finalPrice * 0.3) : 0;

  // Points earned (1 point per €1 spent)
  const pointsEarned = Math.floor(finalPrice);

  // Calculate end time
  const scheduledDate = new Date(scheduledAt);
  const scheduledEndDate = addMinutes(scheduledDate, service.durationMinutes);

  // Create booking document
  const bookingRef = db.collection("bookings").doc();
  const bookingData = {
    userId,
    venueId,
    serviceId,
    instructorId: instructorId || null,

    // Denormalized data
    userName: userData.fullName,
    userPhone: userData.phone,
    userEmail: userData.email,
    venueName: venue.name,
    venueAddress: venue.address,
    serviceName: service.name,
    instructorName: instructor?.fullName || null,

    // Booking details
    bookingType,
    serviceAddress: bookingType === "home_service" ? serviceAddress : null,

    // Schedule
    scheduledAt: admin.firestore.Timestamp.fromDate(scheduledDate),
    scheduledEndAt: admin.firestore.Timestamp.fromDate(scheduledEndDate),
    durationMinutes: service.durationMinutes,

    // Status
    status: "pending",

    // Pricing
    originalPrice,
    discountAmount,
    homeServiceFee,
    finalPrice,
    depositAmount,
    depositPaid: false,

    // Points
    pointsEarned,
    pointsUsed,
    pointsValue,

    // Promotion
    promotionId,
    promotionCode: promotionCode || null,

    // Payment
    paymentStatus: "pending",
    paymentMethod: null,
    stripePaymentIntentId: null,

    // Notes
    userNotes: userNotes || null,
    internalNotes: null,

    // Cancellation
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    refundAmount: null,

    // Review
    hasReviewed: false,
    reviewId: null,

    // Timestamps
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    confirmedAt: null,
    completedAt: null,
  };

  await bookingRef.set(bookingData);

  // Deduct points if used
  if (pointsUsed > 0) {
    await db.collection("users").doc(userId).update({
      pointsBalance: admin.firestore.FieldValue.increment(-pointsUsed),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection("users").doc(userId).collection("pointsTransactions").add({
      points: -pointsUsed,
      type: "spent",
      source: "booking",
      sourceId: bookingRef.id,
      description: `Punti utilizzati per ${service.name}`,
      balanceAfter: userData.pointsBalance - pointsUsed,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return {
    bookingId: bookingRef.id,
    finalPrice,
    depositAmount,
    pointsUsed,
    pointsEarned,
  };
});

/**
 * Cancel a booking
 */
export const cancelBooking = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const { bookingId, reason } = data;
  const userId = context.auth.uid;

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Booking not found");
  }

  const booking = bookingDoc.data()!;

  if (booking.userId !== userId) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized to cancel this booking");
  }

  if (["completed", "cancelled"].includes(booking.status)) {
    throw new functions.https.HttpsError("failed-precondition", "Booking cannot be cancelled");
  }

  // Calculate refund based on cancellation policy
  const scheduledAt = booking.scheduledAt.toDate();
  const now = new Date();
  const hoursUntilBooking = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  let refundAmount = 0;
  if (hoursUntilBooking >= 24) {
    refundAmount = booking.finalPrice; // Full refund
  } else if (hoursUntilBooking >= 12) {
    refundAmount = booking.finalPrice * 0.5; // 50% refund
  }
  // Less than 12 hours: no refund

  const batch = db.batch();

  batch.update(bookingRef, {
    status: "cancelled",
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    cancelledBy: "user",
    cancellationReason: reason || null,
    refundAmount,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Refund points if used
  if (booking.pointsUsed > 0) {
    const userRef = db.collection("users").doc(userId);
    batch.update(userRef, {
      pointsBalance: admin.firestore.FieldValue.increment(booking.pointsUsed),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const userDoc = await userRef.get();
    const userData = userDoc.data();

    const pointsTransactionRef = db.collection("users").doc(userId).collection("pointsTransactions").doc();
    batch.set(pointsTransactionRef, {
      points: booking.pointsUsed,
      type: "refund",
      source: "booking",
      sourceId: bookingId,
      description: "Rimborso punti - prenotazione cancellata",
      balanceAfter: (userData?.pointsBalance || 0) + booking.pointsUsed,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  return { success: true, refundAmount };
});

/**
 * Confirm a booking (admin/staff only or after payment)
 */
export const confirmBooking = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const { bookingId } = data;

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Booking not found");
  }

  const booking = bookingDoc.data()!;

  if (booking.status !== "pending") {
    throw new functions.https.HttpsError("failed-precondition", "Booking is not pending");
  }

  await bookingRef.update({
    status: "confirmed",
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Send notification to user
  await db.collection("users").doc(booking.userId).collection("notifications").add({
    title: "Prenotazione confermata",
    body: `La tua prenotazione per ${booking.serviceName} è stata confermata`,
    type: "booking_confirmed",
    data: { bookingId },
    imageUrl: null,
    isRead: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

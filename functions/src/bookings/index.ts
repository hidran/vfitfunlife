import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { addMinutes } from "date-fns";
import { requireAuth, requireDoc } from "../utils/validation";
import { UserData, VenueData, ServiceData, InstructorData, PromotionData } from "../types";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

interface BookingData {
  venueId: string;
  serviceId: string;
  instructorId?: string;
  scheduledAt: string;
  bookingType: string;
  serviceAddress?: Record<string, unknown>;
  promotionCode?: string;
  usePoints?: boolean;
  userNotes?: string;
}

interface CancelBookingData {
  bookingId: string;
  reason?: string;
}

interface ConfirmBookingData {
  bookingId: string;
}

interface BookingResources {
  userData: UserData;
  venue: VenueData;
  service: ServiceData;
  instructor: InstructorData | null;
}

/**
 * Fetches necessary documents for booking creation.
 * @param {string} userId - The ID of the user making the booking.
 * @param {string} venueId - The ID of the venue.
 * @param {string} serviceId - The ID of the service.
 * @param {string} [instructorId] - The ID of the instructor (optional).
 * @return {Promise<BookingResources>} The fetched resources.
 */
async function fetchBookingResources(
  userId: string,
  venueId: string,
  serviceId: string,
  instructorId?: string
): Promise<BookingResources> {
  const userPromise = db.collection("users").doc(userId).get();
  const venuePromise = db.collection("venues").doc(venueId).get();
  const servicePromise = db
    .collection("venues")
    .doc(venueId)
    .collection("services")
    .doc(serviceId)
    .get();

  const [userDoc, venueDoc, serviceDoc] = await Promise.all([
    userPromise,
    venuePromise,
    servicePromise,
  ]);

  requireDoc(userDoc, "User not found");
  requireDoc(venueDoc, "Venue not found");
  requireDoc(serviceDoc, "Service not found");

  let instructorDoc = null;
  if (instructorId) {
    instructorDoc = await db.collection("instructors").doc(instructorId).get();
  }

  return {
    userData: userDoc.data() as UserData,
    venue: venueDoc.data() as VenueData,
    service: serviceDoc.data() as ServiceData,
    instructor: (instructorDoc?.data() as InstructorData) || null,
  };
}

/**
 * Calculates pricing, discounts, and points.
 * @param {ServiceData} service - The service data.
 * @param {UserData} userData - The user data.
 * @param {string} bookingType - The type of booking.
 * @param {string} [promotionCode] - The promotion code (optional).
 * @param {boolean} [usePoints] - Whether to use points (optional).
 * @return {Promise<any>} The calculated financials.
 */
async function calculateBookingFinancials(
  service: ServiceData,
  userData: UserData,
  bookingType: string,
  promotionCode?: string,
  usePoints?: boolean
) {
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
      const promo = promoSnapshot.docs[0].data() as PromotionData;
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
  const pointsEarned = Math.floor(finalPrice);

  return {
    originalPrice,
    discountAmount,
    homeServiceFee,
    finalPrice,
    depositAmount,
    pointsUsed,
    pointsValue,
    pointsEarned,
    promotionId,
  };
}

/**
 * Create a new booking
 */
export const createBooking = functions.region(region).https.onCall(async (data: BookingData, context) => {
  const userId = requireAuth(context);
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

  // 1. Fetch Resources
  const { userData, venue, service, instructor } = await fetchBookingResources(
    userId,
    venueId,
    serviceId,
    instructorId
  );

  // 2. Calculate Financials
  const financials = await calculateBookingFinancials(
    service,
    userData,
    bookingType,
    promotionCode,
    usePoints
  );

  // 3. Prepare Booking Data
  const scheduledDate = new Date(scheduledAt);
  const scheduledEndDate = addMinutes(scheduledDate, service.durationMinutes);

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

    // Financials
    ...financials,
    promotionCode: promotionCode || null,
    depositPaid: false,

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

  // 4. Execute Transaction (Create Booking + Update Points + Update Promo)
  await db.runTransaction(async (transaction) => {
    transaction.set(bookingRef, bookingData);

    // Deduct points if used
    if (financials.pointsUsed > 0) {
      const userRef = db.collection("users").doc(userId);
      transaction.update(userRef, {
        pointsBalance: admin.firestore.FieldValue.increment(-financials.pointsUsed),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const pointsRef = db.collection("users").doc(userId).collection("pointsTransactions").doc();
      transaction.set(pointsRef, {
        points: -financials.pointsUsed,
        type: "spent",
        source: "booking",
        sourceId: bookingRef.id,
        description: `Punti utilizzati per ${service.name}`,
        balanceAfter: userData.pointsBalance - financials.pointsUsed,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Increment promo usage
    if (financials.promotionId) {
      const promoRef = db.collection("promotions").doc(financials.promotionId);
      transaction.update(promoRef, {
        currentUses: admin.firestore.FieldValue.increment(1),
      });
    }
  });

  return {
    bookingId: bookingRef.id,
    finalPrice: financials.finalPrice,
    depositAmount: financials.depositAmount,
    pointsUsed: financials.pointsUsed,
    pointsEarned: financials.pointsEarned,
  };
});

/**
 * Cancel a booking
 */
export const cancelBooking = functions.region(region).https.onCall(async (data: CancelBookingData, context) => {
  const userId = requireAuth(context);
  const { bookingId, reason } = data;

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingDoc = await bookingRef.get();

  requireDoc(bookingDoc, "Booking not found");
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
export const confirmBooking = functions.region(region).https.onCall(async (data: ConfirmBookingData, context) => {
  requireAuth(context);
  const { bookingId } = data;

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingDoc = await bookingRef.get();

  requireDoc(bookingDoc, "Booking not found");
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

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { addMinutes } from "date-fns";
import { UserData, VenueData, ServiceData, InstructorData, PromotionData } from "../types";
import { getUserRoleInfo, requirePermission, checkIsAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { BOOKING_STATUSES, type BookingStatus, type StatusActorRole } from "./types";
import { isLateCancellation } from "./transitions";
import { dayContextFrom } from "../availability/dayContext";
import { bookingDayRef, readDayDocs } from "../availability/dayReads";
import { decideBookingStart, romeDateOf } from "../availability/slots";
import { validateServiceDuration } from "../availability/validate";
import { hotCallableOptions, region } from "../lib/runtimeOptions";
import { logger } from "firebase-functions";
import { EMAIL_SECRETS } from "../lib/email";
import { notifyTransition } from "./notify";
import { cancellationTarget, newRequestTarget, type NotifyTarget } from "./notifyTargets";
import { sanitizeUserNotes } from "./userNotes";
import { computeBookingPricing, type PromoTerms } from "./pricing";

const db = admin.firestore();

/**
 * Best-effort delivery after a write has committed. notifyTransition already swallows
 * channel failures; this also catches anything thrown before it gets there, so a booking
 * is never reported as failed because a notification was.
 */
async function notifySafely(target: NotifyTarget | null): Promise<void> {
  if (!target) return;
  try {
    await notifyTransition(target);
  } catch (err) {
    logger.warn("[booking-notify] notification failed", {
      bookingId: target.bookingId,
      event: target.event,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

interface BookingData {
  /** Absent for trainer sessions (home / online / outdoor), which have no venue. */
  venueId?: string;
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

interface GetBookingData {
  bookingId: string;
}

interface ListBookingsData {
  status?: string;
  limit?: number;
  offset?: number;
  asProvider?: boolean;
}

interface UpdateBookingStatusData {
  bookingId: string;
  status: string;
  notes?: string;
}

interface BookingResources {
  userData: UserData;
  /** Null for trainer sessions, which have no venue. */
  venue: VenueData | null;
  service: ServiceData;
  instructor: InstructorData | null;
}

/** Legacy shape: some provider docs still embed their services inline instead of in a subcollection. */
interface InlineServicePricing {
  id: string;
  name?: string;
  serviceName?: string;
  price: number;
  durationMinutes?: number;
  description?: string;
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
  venueId: string | undefined,
  serviceId: string,
  instructorId?: string
): Promise<BookingResources> {
  // Trainer sessions (home / online / outdoor) have no venue: the service lives under
  // instructors/{id}/services/{id} rather than venues/{id}/services/{id}.
  const isTrainerBooking = !venueId && !!instructorId;

  if (!venueId && !instructorId) {
    throw new HttpsError("invalid-argument", "A booking needs either a venueId or an instructorId");
  }

  const [userDoc, venueDoc, serviceDoc, instructorDoc] = await Promise.all([
    db.collection("users").doc(userId).get(),
    venueId ? db.collection("venues").doc(venueId).get() : Promise.resolve(null),
    isTrainerBooking ?
      db.collection("instructors").doc(instructorId as string)
        .collection("services").doc(serviceId).get() :
      db.collection("venues").doc(venueId as string)
        .collection("services").doc(serviceId).get(),
    instructorId ? db.collection("instructors").doc(instructorId).get() : Promise.resolve(null),
  ]);

  if (!userDoc.exists) throw new HttpsError("not-found", "User not found");
  if (venueId && !venueDoc?.exists) throw new HttpsError("not-found", "Venue not found");

  let service: ServiceData | null = serviceDoc.exists ?
    (serviceDoc.data() as ServiceData) :
    null;

  // PILOT: legacy fallback — older provider docs embed services inline on the provider
  // profile rather than in the services subcollection. Mirrors the client-side path in
  // src/lib/firebookings.ts that this callable replaces.
  if (!service && isTrainerBooking) {
    const profile = instructorDoc?.data()?.providerProfile as
      { servicePricing?: InlineServicePricing[] } | undefined;
    const inline = (profile?.servicePricing ?? []).find((s) => s.id === serviceId);
    if (inline) {
      service = {
        name: inline.serviceName ?? inline.name ?? "Service",
        price: inline.price,
        durationMinutes: inline.durationMinutes,
        description: inline.description,
      } as ServiceData;
    }
  }

  if (!service) throw new HttpsError("not-found", "Service not found");

  return {
    userData: userDoc.data() as UserData,
    venue: (venueDoc?.data() as VenueData) || null,
    service,
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
  let promotionId: string | null = null;
  let promo: PromoTerms | null = null;

  // Apply promotion code
  if (promotionCode) {
    const promoSnapshot = await db
      .collection("promotions")
      .where("code", "==", promotionCode.toUpperCase())
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (!promoSnapshot.empty) {
      const data = promoSnapshot.docs[0].data() as PromotionData;
      const now = new Date();

      if (
        data.validFrom.toDate() <= now &&
        data.validUntil.toDate() >= now &&
        (data.maxUses === null || data.currentUses < data.maxUses)
      ) {
        promotionId = promoSnapshot.docs[0].id;
        promo = {
          discountType: data.discountType,
          discountValue: data.discountValue,
          maxDiscount: data.maxDiscount ?? null,
        };
      }
    }
  }

  // The arithmetic lives in ./pricing so the checkout screen can mirror it exactly.
  return {
    ...computeBookingPricing({ service, user: userData, bookingType, promo, usePoints }),
    promotionId,
  };
}

/**
 * Create a new booking
 * Customers can create bookings for themselves
 */
export const createBooking = onCall<BookingData>(
  hotCallableOptions<BookingData>({ secrets: EMAIL_SECRETS }),
  async (request: CallableRequest<BookingData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const callerInfo = await getUserRoleInfo(userId);

    // Check if user has booking creation permission
    if (!callerInfo || !callerInfo.permissions.includes("bookings:write")) {
      throw new HttpsError("permission-denied", "Cannot create bookings");
    }

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
    } = request.data;

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
    if (Number.isNaN(scheduledDate.getTime())) {
      throw new HttpsError("invalid-argument", "scheduledAt must be an ISO date-time");
    }
    // A missing/invalid duration would otherwise surface as a confusing "slot_unavailable"
    // (trainer sessions) or a NaN scheduledEndAt (venue bookings) — report the real problem.
    const durationMinutes = validateServiceDuration(service.durationMinutes);
    const scheduledEndDate = addMinutes(scheduledDate, durationMinutes);
    // Trainer sessions must start on one of the provider's free slots. Venue bookings have
    // no provider schedule behind them and are not checked.
    const trainerId = !venueId && instructorId ? instructorId : null;

    const bookingRef = db.collection("bookings").doc();
    const bookingData = {
      userId,
      venueId: venueId || null,
      serviceId,
      instructorId: instructorId || null,

      // Denormalized data. `?? null` because Firestore rejects undefined outright: a
      // customer who never added a phone (or signed up with a provider that gave no email)
      // could not book at all — the write failed with an opaque INTERNAL.
      userName: userData.fullName ?? null,
      userPhone: userData.phone ?? null,
      userEmail: userData.email ?? null,
      venueName: venue?.name ?? null,
      venueAddress: venue?.address ?? null,
      serviceName: service.name,
      instructorName: instructor?.fullName || null,

      // Booking details
      bookingType,
      serviceAddress: bookingType === "home_service" ? serviceAddress : null,

      // Schedule
      scheduledAt: Timestamp.fromDate(scheduledDate),
      scheduledEndAt: Timestamp.fromDate(scheduledEndDate),
      durationMinutes,

      // Status
      status: "requested" as BookingStatus,
      statusHistory: [
        {
          status: "requested" as BookingStatus,
          actorUid: userId,
          actorRole: "client" as StatusActorRole,
          at: Timestamp.now(),
        },
      ],
      lateCancellation: false,
      paymentConfirmation: null,
      completionReminderSentAt: null,

      // Financials
      ...financials,
      promotionCode: promotionCode || null,
      depositPaid: false,

      // Payment
      paymentStatus: "pending",
      paymentMethod: null,
      stripePaymentIntentId: null,

      // Notes
      // Capped and cleaned server-side: the booking screen's limit is not a guarantee.
      userNotes: sanitizeUserNotes(userNotes),
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      confirmedAt: null,
      completedAt: null,
    };

    // 4. Execute Transaction (Check Availability + Create Booking + Update Points + Update Promo)
    await db.runTransaction(async (transaction) => {
      if (trainerId) {
        // Reads come first in a transaction. readDayDocs also reads the provider-day lock and
        // the set() below writes it, so concurrent requests for this provider and day queue
        // up: the second one re-reads the bookings and sees the first.
        const day = romeDateOf(scheduledDate);
        const docs = await readDayDocs(db, trainerId, day, transaction);
        const decision = decideBookingStart(
          { ...dayContextFrom(docs, day), durationMinutes, now: new Date() },
          scheduledDate,
        );
        if (!decision.ok) {
          throw new HttpsError("failed-precondition", "slot_unavailable");
        }
        transaction.set(
          bookingDayRef(db, trainerId, day),
          { lastBookingId: bookingRef.id, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }

      transaction.set(bookingRef, bookingData);

      // Deduct points if used
      if (financials.pointsUsed > 0) {
        const userRef = db.collection("users").doc(userId);
        transaction.update(userRef, {
          pointsBalance: FieldValue.increment(-financials.pointsUsed),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const pointsRef = db.collection("users").doc(userId).collection("pointsTransactions").doc();
        transaction.set(pointsRef, {
          points: -financials.pointsUsed,
          type: "spent",
          source: "booking",
          sourceId: bookingRef.id,
          description: `Punti utilizzati per ${service.name}`,
          balanceAfter: userData.pointsBalance - financials.pointsUsed,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // Increment promo usage
      if (financials.promotionId) {
        const promoRef = db.collection("promotions").doc(financials.promotionId);
        transaction.update(promoRef, {
          currentUses: FieldValue.increment(1),
        });
      }
    });

    // After the commit: tell the trainer there is a request waiting (plan A1).
    await notifySafely(newRequestTarget(bookingRef.id, {
      userId,
      instructorId: bookingData.instructorId,
      userName: bookingData.userName,
      instructorName: bookingData.instructorName,
      serviceName: bookingData.serviceName,
      venueName: bookingData.venueName,
      scheduledAt: scheduledDate,
    }));

    return {
      bookingId: bookingRef.id,
      finalPrice: financials.finalPrice,
      depositAmount: financials.depositAmount,
      pointsUsed: financials.pointsUsed,
      pointsEarned: financials.pointsEarned,
    };
  }
);

/**
 * Get a single booking
 * Users can read their own bookings
 * Providers can read bookings assigned to them
 * Admins can read any booking
 */
export const getBooking = onCall<GetBookingData>(
  { region },
  async (request: CallableRequest<GetBookingData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;
    const { bookingId } = request.data;

    const bookingDoc = await db.collection("bookings").doc(bookingId).get();

    if (!bookingDoc.exists) {
      throw new HttpsError("not-found", "Booking not found");
    }

    const booking = bookingDoc.data()!;

    // Check permissions
    const isOwner = booking.userId === callerId;
    const isAssignedProvider = booking.instructorId === callerId;
    const isAdmin = await checkIsAdmin(callerId);

    if (!isOwner && !isAssignedProvider && !isAdmin) {
      throw new HttpsError("permission-denied", "Cannot access this booking");
    }

    return {
      bookingId: bookingDoc.id,
      ...booking,
    };
  }
);

/**
 * List bookings
 * Users see their own bookings
 * Providers see bookings assigned to them
 * Admins see all bookings
 */
export const listBookings = onCall<ListBookingsData>(
  { region },
  async (request: CallableRequest<ListBookingsData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;
    const { status, limit = 20, offset = 0, asProvider } = request.data || {};
    const callerInfo = await getUserRoleInfo(callerId);

    if (!callerInfo) {
      throw new HttpsError("not-found", "User not found");
    }

    let query: admin.firestore.Query = db.collection("bookings");

    // Filter by caller's role
    if (callerInfo.role === "customer") {
      // Customers only see their own bookings
      query = query.where("userId", "==", callerId);
    } else if (callerInfo.role === "provider") {
      // Providers can view bookings assigned to them
      if (asProvider) {
        query = query.where("instructorId", "==", callerId);
      } else {
        // Or their own bookings as a customer
        query = query.where("userId", "==", callerId);
      }
    }
    // Admins/superadmins see all bookings (no filter)

    // Apply status filter if provided
    if (status) {
      query = query.where("status", "==", status);
    }

    // Order by created date
    query = query.orderBy("createdAt", "desc");

    // Apply pagination
    const snapshot = await query.limit(limit).offset(offset).get();

    const bookings = snapshot.docs.map((doc) => ({
      bookingId: doc.id,
      ...doc.data(),
    }));

    return {
      bookings,
      pagination: {
        limit,
        offset,
        count: bookings.length,
        hasMore: bookings.length === limit,
      },
    };
  }
);

/**
 * Cancel a booking
 * Users can cancel their own bookings
 * Providers can cancel bookings assigned to them
 * Admins can cancel any booking
 */
export const cancelBooking = onCall<CancelBookingData>(
  { region, secrets: EMAIL_SECRETS },
  async (request: CallableRequest<CancelBookingData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;
    const { bookingId, reason } = request.data;

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      throw new HttpsError("not-found", "Booking not found");
    }

    const booking = bookingDoc.data()!;

    // Check permissions
    const isOwner = booking.userId === callerId;
    const isAssignedProvider = booking.instructorId === callerId;
    const isAdminUser = await checkIsAdmin(callerId);

    if (!isOwner && !isAssignedProvider && !isAdminUser) {
      throw new HttpsError("permission-denied", "Cannot cancel this booking");
    }

    const cancellableFrom: BookingStatus[] = ["requested", "accepted"];
    if (!cancellableFrom.includes(booking.status)) {
      throw new HttpsError("failed-precondition", "Booking cannot be cancelled");
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

    // Determine who cancelled. The status records client-vs-trainer; the actorRole on the
    // history entry records the true actor, so admin cancellations are not misattributed
    // to trainers in the P0-2 reliability metric. Spec §7.3.
    let cancelledBy = "user";
    let newStatus: BookingStatus = "cancelled_by_client";
    let actorRole: StatusActorRole = "client";
    if (isAssignedProvider) {
      cancelledBy = "provider";
      newStatus = "cancelled_by_trainer";
      actorRole = "trainer";
    } else if (isAdminUser) {
      cancelledBy = "admin";
      newStatus = "cancelled_by_trainer";
      actorRole = "admin";
    }

    const late = isLateCancellation(scheduledAt, now);
    const batch = db.batch();

    batch.update(bookingRef, {
      status: newStatus,
      statusHistory: FieldValue.arrayUnion({
        status: newStatus,
        actorUid: callerId,
        actorRole,
        at: Timestamp.now(),
        ...(reason ? { note: reason } : {}),
      }),
      // PILOT: flagged for data collection only — no cancellation fees in the pilot.
      lateCancellation: late,
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy,
      cancellationReason: reason || null,
      refundAmount,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Refund points if used
    if (booking.pointsUsed > 0) {
      const userRef = db.collection("users").doc(booking.userId);
      batch.update(userRef, {
        pointsBalance: FieldValue.increment(booking.pointsUsed),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const userDoc = await userRef.get();
      const userData = userDoc.data();

      const pointsTransactionRef = db.collection("users").doc(booking.userId).collection("pointsTransactions").doc();
      batch.set(pointsTransactionRef, {
        points: booking.pointsUsed,
        type: "refund",
        source: "booking",
        sourceId: bookingId,
        description: "Rimborso punti - prenotazione cancellata",
        balanceAfter: (userData?.pointsBalance || 0) + booking.pointsUsed,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    // Tell the other side (plan A2): client cancel -> trainer (with late flag),
    // trainer/admin cancel -> client (with reason).
    await notifySafely(cancellationTarget(bookingId, {
      userId: booking.userId,
      instructorId: booking.instructorId ?? null,
      userName: booking.userName ?? null,
      instructorName: booking.instructorName ?? null,
      serviceName: booking.serviceName ?? null,
      venueName: booking.venueName ?? null,
      scheduledAt,
    }, { cancelledBy: cancelledBy as "user" | "provider" | "admin", late, reason: reason ?? null }));

    // Write to audit_logs collection (only when actor is admin/superadmin)
    if (isAdminUser) {
      const callerSnap = await db.collection("users").doc(callerId).get();
      const caller = callerSnap.data();
      const callerRole = (caller?.role === "superadmin" ? "superadmin" : "admin") as "admin" | "superadmin";
      await writeAuditLog({
        actorUid: callerId,
        actorEmail: caller?.email ?? "",
        actorRole: callerRole,
        action: "update",
        entityType: "booking",
        entityId: bookingId,
        before: { status: booking.status },
        after: { status: newStatus },
        ...(reason ? { reason } : {}),
      });
    }

    return { success: true, refundAmount };
  }
);

/**
 * Confirm a booking (admin/staff only or after payment)
 */
export const confirmBooking = onCall<ConfirmBookingData>(
  { region },
  async (request: CallableRequest<ConfirmBookingData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;
    const { bookingId } = request.data;

    // Check admin permission
    try {
      await requirePermission(callerId, "bookings:confirm");
    } catch (error) {
      throw new HttpsError("permission-denied", "Admin access required to confirm bookings");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      throw new HttpsError("not-found", "Booking not found");
    }

    const booking = bookingDoc.data()!;

    if (booking.status !== "requested") {
      throw new HttpsError("failed-precondition", "Booking is not awaiting a response");
    }

    await bookingRef.update({
      status: "accepted" as BookingStatus,
      statusHistory: FieldValue.arrayUnion({
        status: "accepted" as BookingStatus,
        actorUid: callerId,
        actorRole: "admin" as StatusActorRole,
        at: Timestamp.now(),
      }),
      confirmedAt: FieldValue.serverTimestamp(),
      confirmedBy: callerId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Send notification to user
    await db.collection("users").doc(booking.userId).collection("notifications").add({
      title: "Prenotazione confermata",
      body: `La tua prenotazione per ${booking.serviceName} è stata confermata`,
      type: "booking_confirmed",
      data: { bookingId },
      imageUrl: null,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Write to audit_logs collection (only when actor is admin/superadmin)
    const callerSnap = await db.collection("users").doc(callerId).get();
    const caller = callerSnap.data();
    if (caller?.role === "admin" || caller?.role === "superadmin") {
      const callerRole = (caller?.role === "superadmin" ? "superadmin" : "admin") as "admin" | "superadmin";
      await writeAuditLog({
        actorUid: callerId,
        actorEmail: caller?.email ?? "",
        actorRole: callerRole,
        action: "update",
        entityType: "booking",
        entityId: bookingId,
        before: { status: booking.status },
        after: { status: "accepted" },
      });
    }

    return { success: true };
  }
);

/**
 * Update booking status
 * Admin/staff only
 */
export const updateBookingStatus = onCall<UpdateBookingStatusData>(
  { region },
  async (request: CallableRequest<UpdateBookingStatusData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;
    const { bookingId, status, notes } = request.data;

    // Check admin permission
    const callerInfo = await getUserRoleInfo(callerId);
    if (!callerInfo || (callerInfo.role !== "admin" && callerInfo.role !== "superadmin")) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      throw new HttpsError("not-found", "Booking not found");
    }

    // Sourced from the shared type so it cannot drift from the enum again. Spec §5.6.
    if (!(BOOKING_STATUSES as readonly string[]).includes(status)) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid status. Valid statuses: ${BOOKING_STATUSES.join(", ")}`
      );
    }
    const nextStatus = status as BookingStatus;

    const updateData: Record<string, unknown> = {
      status: nextStatus,
      statusHistory: FieldValue.arrayUnion({
        status: nextStatus,
        actorUid: callerId,
        actorRole: "admin" as StatusActorRole,
        at: Timestamp.now(),
        ...(notes ? { note: notes } : {}),
      }),
      updatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: callerId,
      statusUpdatedAt: FieldValue.serverTimestamp(),
    };

    if (notes) {
      updateData.internalNotes = notes;
    }

    // Add timestamp for specific statuses
    if (nextStatus === "accepted") {
      updateData.confirmedAt = FieldValue.serverTimestamp();
      updateData.confirmedBy = callerId;
    } else if (nextStatus === "completed") {
      updateData.completedAt = FieldValue.serverTimestamp();
      updateData.completedBy = callerId;
    }

    await bookingRef.update(updateData);

    // Send notification to user for status changes
    const booking = bookingDoc.data()!;
    // PILOT: admin-initiated overrides keep the legacy Italian copy. Trainer-initiated
    // transitions go through the localized catalog in notifications/bookingMessages.ts.
    const statusMessages: Partial<Record<BookingStatus, string>> = {
      accepted: "La tua prenotazione è stata confermata",
      completed: "La tua prenotazione è stata completata",
      declined: "La tua prenotazione è stata rifiutata",
      cancelled_by_client: "La tua prenotazione è stata cancellata",
      cancelled_by_trainer: "La tua prenotazione è stata cancellata",
    };

    if (statusMessages[nextStatus]) {
      await db.collection("users").doc(booking.userId).collection("notifications").add({
        title: "Aggiornamento prenotazione",
        body: statusMessages[nextStatus],
        type: `booking_${nextStatus}`,
        data: { bookingId },
        imageUrl: null,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // Write to audit_logs collection
    const callerSnap = await db.collection("users").doc(callerId).get();
    const caller = callerSnap.data();
    const callerRole = (callerInfo.role === "superadmin" ? "superadmin" : "admin") as "admin" | "superadmin";
    await writeAuditLog({
      actorUid: callerId,
      actorEmail: caller?.email ?? "",
      actorRole: callerRole,
      action: "update",
      entityType: "booking",
      entityId: bookingId,
      before: { status: booking.status },
      after: { status },
      ...(notes ? { reason: notes } : {}),
    });

    return { success: true, bookingId, status };
  }
);

// New P0-1 modules. This barrel is the single owner — functions/src/index.ts already
// does `export * from "./bookings"`, so nothing is added there (avoids duplicate stars).
export * from "./transitionCallables";
export * from "./reschedule";
export * from "./payments";
export * from "./migrate";

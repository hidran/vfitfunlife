/**
 * createBookingAsTrainer — "Aggiungi appuntamento" on /provider/schedule.
 *
 * The trainer puts a session in one of their clients' calendars. The slot is re-checked
 * inside the same provider-day transaction createBooking uses (readDayDocs reads the
 * `bookingDays` lock and this writes it), so a trainer booking and a customer request for
 * the same time can never both land. The pure rules live in ./trainerBookingCore.
 *
 * Kept out of ./index.ts on purpose: that file's createBooking is edited independently.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { addMinutes } from "date-fns";
import type { ServiceData, UserData } from "../types";
import type { BookingStatus, StatusActorRole } from "./types";
import { bookingDayRef, readDayDocs } from "../availability/dayReads";
import { romeDateOf } from "../availability/slots";
import { isBookableInstructor, validateServiceDuration } from "../availability/validate";
import { EMAIL_SECRETS } from "../lib/email";
import { region } from "../lib/runtimeOptions";
import { getUserRoleInfo } from "../utils/roles";
import { notifyTransition } from "./notify";
import { computeBookingPricing } from "./pricing";
import {
  decideTrainerStart,
  isTrainersClient,
  trainerScheduledTarget,
  validateTrainerBookingRequest,
} from "./trainerBookingCore";

/** Legacy shape: some provider docs still embed their services inline (see createBooking). */
interface InlineServicePricing {
  id: string;
  name?: string;
  serviceName?: string;
  price: number;
  durationMinutes?: number;
  description?: string;
}

async function loadTrainerService(
  db: Firestore,
  instructorId: string,
  instructor: Record<string, unknown>,
  serviceId: string,
): Promise<ServiceData> {
  const snap = await db.collection("instructors").doc(instructorId)
    .collection("services").doc(serviceId).get();
  if (snap.exists) {
    const service = snap.data() as ServiceData;
    if (service.isActive === false) throw new HttpsError("failed-precondition", "service_inactive");
    return service;
  }
  const profile = instructor.providerProfile as { servicePricing?: InlineServicePricing[] } | undefined;
  const inline = (profile?.servicePricing ?? []).find((s) => s.id === serviceId);
  if (!inline) throw new HttpsError("not-found", "service_not_found");
  return {
    name: inline.serviceName ?? inline.name ?? "Service",
    price: inline.price,
    durationMinutes: inline.durationMinutes as number,
    description: inline.description,
  };
}

export const createBookingAsTrainer = onCall(
  { region, secrets: EMAIL_SECRETS },
  async (req) => {
    const trainerId = req.auth?.uid;
    if (!trainerId) throw new HttpsError("unauthenticated", "Must be authenticated");

    const input = validateTrainerBookingRequest(req.data, trainerId);
    const db = getFirestore();

    // The caller must be an active, bookable provider — the same bar a customer's
    // createBooking implicitly needs the trainer to clear (getProviderSlots refuses others).
    const roleInfo = await getUserRoleInfo(trainerId);
    if (!roleInfo || roleInfo.isActive === false) {
      throw new HttpsError("permission-denied", "Account is deactivated");
    }
    const [instructorSnap, clientSnap, rosterSnap, priorSnap] = await Promise.all([
      db.collection("instructors").doc(trainerId).get(),
      db.collection("users").doc(input.clientUserId).get(),
      db.collection("clients")
        .where("providerId", "==", trainerId)
        .where("userId", "==", input.clientUserId)
        .limit(1).get(),
      db.collection("bookings")
        .where("instructorId", "==", trainerId)
        .where("userId", "==", input.clientUserId)
        .limit(1).get(),
    ]);
    const instructor = instructorSnap.data();
    if (!instructor) throw new HttpsError("permission-denied", "Providers only");
    if (!isBookableInstructor(instructor)) throw new HttpsError("failed-precondition", "instructor_not_bookable");

    if (!isTrainersClient({ rosterDocs: rosterSnap.size, priorBookings: priorSnap.size })) {
      throw new HttpsError("permission-denied", "not_your_client");
    }
    const client = clientSnap.data() as UserData | undefined;
    if (!client || client.isDeleted === true) throw new HttpsError("not-found", "client_not_found");

    const service = await loadTrainerService(db, trainerId, instructor, input.serviceId);
    const durationMinutes = validateServiceDuration(service.durationMinutes);

    // Trainer sessions go through the same price arithmetic as the customer flow — no promo,
    // no points (those are the client's to spend), bookingType as /book sends it.
    const bookingType = "in_venue";
    const pricing = computeBookingPricing({ service, user: client, bookingType, promo: null, usePoints: false });

    const startsAt = input.startsAt;
    const endsAt = addMinutes(startsAt, durationMinutes);
    const bookingRef = db.collection("bookings").doc();
    const instructorName = (instructor.fullName as string | undefined) ||
      (instructor.displayName as string | undefined) || null;
    const now = Timestamp.now();

    const bookingData = {
      userId: input.clientUserId,
      venueId: null,
      serviceId: input.serviceId,
      instructorId: trainerId,

      userName: client.fullName ?? (client.displayName as string | undefined) ?? null,
      userPhone: client.phone ?? null,
      userEmail: client.email ?? null,
      venueName: null,
      venueAddress: null,
      serviceName: service.name,
      instructorName,

      bookingType,
      serviceAddress: null,

      scheduledAt: Timestamp.fromDate(startsAt),
      scheduledEndAt: Timestamp.fromDate(endsAt),
      durationMinutes,

      // Trainer-created: the trainer is the party who would have accepted it.
      status: "accepted" as BookingStatus,
      statusHistory: [
        {
          status: "accepted" as BookingStatus,
          actorUid: trainerId,
          actorRole: "trainer" as StatusActorRole,
          at: now,
        },
      ],
      createdBy: "trainer",
      lateCancellation: false,
      paymentConfirmation: null,
      completionReminderSentAt: null,

      ...pricing,
      promotionId: null,
      promotionCode: null,
      depositPaid: false,

      paymentStatus: "pending",
      paymentMethod: null,
      stripePaymentIntentId: null,

      // The client did not write anything; the trainer's note is theirs alone.
      userNotes: null,
      internalNotes: input.note,

      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      refundAmount: null,

      hasReviewed: false,
      reviewId: null,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      confirmedAt: FieldValue.serverTimestamp(),
      confirmedBy: trainerId,
      completedAt: null,
    };

    await db.runTransaction(async (tx) => {
      // All reads first: readDayDocs reads the provider-day lock, the set() below writes it,
      // so concurrent bookings for this trainer and day serialize (see createBooking).
      const day = romeDateOf(startsAt);
      const docs = await readDayDocs(db, trainerId, day, tx);
      const decision = decideTrainerStart(docs, startsAt, durationMinutes, new Date());
      if (!decision.ok) throw new HttpsError("failed-precondition", "slot_unavailable");
      tx.set(
        bookingDayRef(db, trainerId, day),
        { lastBookingId: bookingRef.id, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      tx.set(bookingRef, bookingData);
    });

    // After the commit, best effort: a failed notification never fails the booking.
    const target = trainerScheduledTarget(bookingRef.id, {
      userId: input.clientUserId,
      instructorName,
      serviceName: service.name,
      scheduledAt: startsAt,
    });
    try {
      await notifyTransition(target);
    } catch (err) {
      logger.warn("[booking-notify] notification failed", {
        bookingId: bookingRef.id,
        event: target.event,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    return { bookingId: bookingRef.id, finalPrice: pricing.finalPrice };
  },
);

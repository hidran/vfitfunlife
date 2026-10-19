import { createHash } from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { region } from "../lib/runtimeOptions";
import { quote } from "./core";
import { activePartner, assertGymManager, authUid, db, membershipId, safeId, serverTime,
  type GymBooking, type GymSession } from "./store";
import { queueGymNotification } from "./notifications";

function quoteFor(session: GymSession, venue: FirebaseFirestore.DocumentData,
  instructor: FirebaseFirestore.DocumentData | undefined) {
  const gymPercent = venue.memberDiscountPercent ?? 0;
  const instructorPercent = instructor?.partnerStatus === "active" ?
    venue.partnerInstructorExtraPercent ?? 0 : 0;
  return quote(session.regularPriceCents, gymPercent, instructorPercent);
}

function validInstructor(instructor: FirebaseFirestore.DocumentData | undefined) {
  return !!instructor && instructor.isActive !== false && instructor.providerProfile?.isVerified === true &&
    !["pending", "rejected", "suspended"].includes(instructor.applicationStatus);
}

export const quoteGymBooking = onCall({ region }, async (req) => {
  const sessionId = safeId(req.data.sessionId);
  const session = (await db.doc(`gymSessions/${sessionId}`).get()).data() as GymSession | undefined;
  if (!session || session.status !== "published") throw new HttpsError("not-found", "session_not_found");
  const [venueDoc, instructorDoc, locationDoc, roomDoc] = await Promise.all([
    db.doc(`venues/${session.venueId}`).get(), db.doc(`instructors/${session.instructorId}`).get(),
    db.doc(`venues/${session.venueId}/locations/${session.locationId}`).get(),
    db.doc(`venues/${session.venueId}/locations/${session.locationId}/rooms/${session.roomId}`).get(),
  ]);
  if (!activePartner(venueDoc.data())) throw new HttpsError("failed-precondition", "active_partner_gym_required");
  if (!validInstructor(instructorDoc.data())) throw new HttpsError("failed-precondition", "valid_instructor_required");
  if (locationDoc.data()?.isActive === false || roomDoc.data()?.isActive === false ||
    !locationDoc.exists || !roomDoc.exists) throw new HttpsError("failed-precondition", "active_gym_space_required");
  return { ...quoteFor(session, venueDoc.data()!, instructorDoc.data()),
    sessionId, cancellationHours: session.cancellationHours,
    revision: session.revision ?? 1, title: session.title, roomName: session.roomName,
    instructorName: session.instructorName, timezone: session.timezone,
    startsAtMillis: session.startsAt.toMillis(), endsAtMillis: session.endsAt.toMillis(),
    availablePlaces: Math.max(0, session.capacity - session.booked), capacity: session.capacity };
});

export const quoteGymTimetable = onCall({ region }, async (req) => {
  const ids = req.data.sessionIds;
  if (!Array.isArray(ids) || ids.length > 30 || ids.length === 0) {
    throw new HttpsError("invalid-argument", "invalid_sessions");
  }
  const sessionIds = [...new Set(ids.map(safeId))];
  const sessions = await db.getAll(...sessionIds.map((id) => db.doc(`gymSessions/${id}`)));
  const records = sessions.map((doc) => ({ id: doc.id, session: doc.data() as GymSession | undefined }));
  const active = records.filter((row): row is { id: string; session: GymSession } =>
    !!row.session && row.session.status === "published");
  if (!active.length) return { quotes: {} };
  const venueIds = [...new Set(active.map((row) => row.session.venueId))];
  const instructorIds = [...new Set(active.map((row) => row.session.instructorId))];
  const [venues, instructors] = await Promise.all([
    db.getAll(...venueIds.map((id) => db.doc(`venues/${id}`))),
    db.getAll(...instructorIds.map((id) => db.doc(`instructors/${id}`))),
  ]);
  const venueMap = new Map(venues.map((doc) => [doc.id, doc.data()]));
  const instructorMap = new Map(instructors.map((doc) => [doc.id, doc.data()]));
  const quotes = Object.fromEntries(active.filter((row) => activePartner(venueMap.get(row.session.venueId)) &&
    validInstructor(instructorMap.get(row.session.instructorId)))
    .map((row) => [row.id, quoteFor(row.session, venueMap.get(row.session.venueId)!,
      instructorMap.get(row.session.instructorId))]));
  return { quotes };
});

export const bookGymClass = onCall({ region }, async (req) => {
  const uid = authUid(req.auth);
  const sessionId = safeId(req.data.sessionId);
  const requestId = safeId(req.data.requestId);
  const bookingId = createHash("sha256").update(`${sessionId}:${uid}:${requestId}`).digest("hex");
  const result = await db.runTransaction(async (tx) => {
    const sessionRef = db.doc(`gymSessions/${sessionId}`);
    const bookingRef = db.doc(`gymBookings/${bookingId}`);
    const memberRef = db.doc(`gymSessionMembers/${membershipId(sessionId, uid)}`);
    const [sessionDoc, bookingDoc, memberDoc, userDoc] = await Promise.all([
      tx.get(sessionRef), tx.get(bookingRef), tx.get(memberRef), tx.get(db.doc(`users/${uid}`)),
    ]);
    const session = sessionDoc.data() as GymSession | undefined;
    const user = userDoc.data();
    if (!session) throw new HttpsError("not-found", "session_not_found");
    if (!user || user.isActive === false || ["suspended", "deleted"].includes(user.accountStatus)) {
      throw new HttpsError("permission-denied", "account_inactive");
    }
    if (bookingDoc.exists) {
      if (bookingDoc.data()?.state !== "confirmed") throw new HttpsError("already-exists", "booking_already_cancelled");
      return { bookingId, finalPriceCents: bookingDoc.data()?.finalPriceCents as number, state: "confirmed" };
    }
    if (memberDoc.exists) throw new HttpsError("already-exists", "already_booked");
    if (session.status !== "published" || session.startsAt.toMillis() <= Date.now() + 2 * 3600000) {
      throw new HttpsError("failed-precondition", "booking_closed");
    }
    if (session.booked >= session.capacity) throw new HttpsError("resource-exhausted", "class_full");
    if (req.data.expectedRevision !== (session.revision ?? 1)) {
      throw new HttpsError("failed-precondition", "session_changed_review_again");
    }
    const [venueDoc, instructorDoc, locationDoc, roomDoc] = await Promise.all([
      tx.get(db.doc(`venues/${session.venueId}`)), tx.get(db.doc(`instructors/${session.instructorId}`)),
      tx.get(db.doc(`venues/${session.venueId}/locations/${session.locationId}`)),
      tx.get(db.doc(`venues/${session.venueId}/locations/${session.locationId}/rooms/${session.roomId}`)),
    ]);
    if (!activePartner(venueDoc.data())) throw new HttpsError("failed-precondition", "active_partner_gym_required");
    if (!validInstructor(instructorDoc.data())) {
      throw new HttpsError("failed-precondition", "valid_instructor_required");
    }
    if (!locationDoc.exists || !roomDoc.exists || locationDoc.data()?.isActive === false ||
      roomDoc.data()?.isActive === false) throw new HttpsError("failed-precondition", "active_gym_space_required");
    const price = quoteFor(session, venueDoc.data()!, instructorDoc.data());
    if (req.data.expectedFinalPriceCents !== price.finalPriceCents) {
      throw new HttpsError("failed-precondition", "price_changed_review_again");
    }
    tx.create(bookingRef, { userId: uid, customerName: user.fullName || user.displayName || "",
      sessionId, venueId: session.venueId, requestId,
      title: session.title, venueName: session.venueName, locationName: session.locationName,
      roomName: session.roomName, instructorName: session.instructorName,
      startsAt: session.startsAt, endsAt: session.endsAt,
      timezone: session.timezone, state: "confirmed", paymentMode: "direct",
      paymentStatus: price.finalPriceCents === 0 ? "paid" : "pending",
      ...price, cancellationHours: session.cancellationHours,
      createdAt: serverTime(), updatedAt: serverTime() });
    tx.create(memberRef, { sessionId, userId: uid, bookingId, createdAt: serverTime() });
    tx.update(sessionRef, { booked: session.booked + 1, updatedAt: serverTime() });
    queueGymNotification(tx, `${bookingId}_confirmed`, uid, "accepted", session.title,
      session.startsAt.toDate());
    return { bookingId, finalPriceCents: price.finalPriceCents, state: "confirmed" };
  });
  return result;
});

export const cancelGymBooking = onCall({ region }, async (req) => {
  const uid = authUid(req.auth);
  const bookingId = safeId(req.data.bookingId);
  const reason = String(req.data.reason ?? "").trim().slice(0, 500);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`gymBookings/${bookingId}`);
    const booking = (await tx.get(ref)).data() as GymBooking | undefined;
    if (!booking) throw new HttpsError("not-found", "booking_not_found");
    if (uid !== booking.userId) await assertGymManager(uid, booking.venueId, tx);
    if (booking.state === "cancelled") return;
    const sessionRef = db.doc(`gymSessions/${booking.sessionId}`);
    const memberRef = db.doc(`gymSessionMembers/${membershipId(booking.sessionId, booking.userId)}`);
    const [sessionDoc, memberDoc] = await Promise.all([tx.get(sessionRef), tx.get(memberRef)]);
    const session = sessionDoc.data() as GymSession | undefined;
    if (!session) throw new HttpsError("not-found", "session_not_found");
    const isCustomer = uid === booking.userId;
    if (session.startsAt.toMillis() <= Date.now() + (isCustomer ? booking.cancellationHours * 3600000 : 0)) {
      throw new HttpsError("failed-precondition", "cancellation_deadline");
    }
    if (session.booked < 1) throw new HttpsError("internal", "seat_counter_inconsistent");
    if (memberDoc.data()?.bookingId !== bookingId) throw new HttpsError("internal", "membership_inconsistent");
    const refundDueCents = booking.paymentStatus === "paid" ? booking.finalPriceCents : 0;
    tx.update(ref, { state: "cancelled", cancellationReason: reason,
      refundDueCents, cancelledAt: serverTime(), updatedAt: serverTime() });
    tx.update(sessionRef, { booked: session.booked - 1, updatedAt: serverTime() });
    tx.delete(memberRef);
    queueGymNotification(tx, `${bookingId}_cancelled`, booking.userId,
      isCustomer ? "cancelled_by_client" : "cancelled_by_trainer", booking.title,
      booking.startsAt.toDate(), reason);
  });
  return { success: true };
});

export const recordGymPayment = onCall({ region }, async (req) => {
  const uid = authUid(req.auth);
  const bookingId = safeId(req.data.bookingId);
  const method = req.data.method;
  if (!["cash", "bank_transfer", "satispay", "other"].includes(method)) {
    throw new HttpsError("invalid-argument", "invalid_payment_method");
  }
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`gymBookings/${bookingId}`);
    const booking = (await tx.get(ref)).data() as GymBooking | undefined;
    if (!booking) throw new HttpsError("not-found", "booking_not_found");
    await assertGymManager(uid, booking.venueId, tx);
    if (booking.state !== "confirmed") throw new HttpsError("failed-precondition", "booking_not_active");
    if (booking.paymentStatus === "paid") return;
    tx.update(ref, { paymentStatus: "paid", paymentMethod: method, paidAt: serverTime(), paidBy: uid });
    queueGymNotification(tx, `${bookingId}_paid`, booking.userId, "payment_confirmed", booking.title,
      booking.startsAt.toDate());
  });
  return { success: true };
});

export const confirmGymRefund = onCall({ region }, async (req) => {
  const uid = authUid(req.auth);
  const bookingId = safeId(req.data.bookingId);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`gymBookings/${bookingId}`);
    const booking = (await tx.get(ref)).data() as GymBooking | undefined;
    if (!booking) throw new HttpsError("not-found", "booking_not_found");
    await assertGymManager(uid, booking.venueId, tx);
    if (booking.state !== "cancelled" || !booking.finalPriceCents) {
      throw new HttpsError("failed-precondition", "refund_not_due");
    }
    if (booking.paymentStatus !== "paid" || !((booking as GymBooking & { refundDueCents?: number }).refundDueCents)) {
      throw new HttpsError("failed-precondition", "refund_not_due");
    }
    tx.update(ref, { refundDueCents: 0, refundConfirmedAt: serverTime(), refundConfirmedBy: uid });
  });
  return { success: true };
});

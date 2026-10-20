import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { region } from "../lib/runtimeOptions";
import { localInstant, occurrences, scheduleSchema, seriesId } from "./core";
import { activePartner, assertGymManager, authUid, db, membershipId, safeId, serverTime,
  slotOf, updateScheduleLocks, type GymSession, type Slot } from "./store";
import { queueGymNotification } from "./notifications";

async function gymAssignment(tx: FirebaseFirestore.Transaction, venueId: string, locationId: string,
  roomId: string, instructorId: string) {
  const [locationDoc, roomDoc, instructorDoc, linkDoc] = await Promise.all([
    tx.get(db.doc(`venues/${venueId}/locations/${locationId}`)),
    tx.get(db.doc(`venues/${venueId}/locations/${locationId}/rooms/${roomId}`)),
    tx.get(db.doc(`instructors/${instructorId}`)),
    tx.get(db.doc(`venues/${venueId}/instructors/${instructorId}`)),
  ]);
  const location = locationDoc.data(); const room = roomDoc.data(); const instructor = instructorDoc.data();
  if (!location || location.isActive === false || !room || room.isActive === false) {
    throw new HttpsError("failed-precondition", "active_gym_space_required");
  }
  if (!instructor || instructor.isActive === false || instructor.providerProfile?.isVerified !== true ||
    ["pending", "rejected", "suspended"].includes(instructor.applicationStatus) ||
    (instructor.venueId !== venueId && linkDoc.data()?.isActive !== true)) {
    throw new HttpsError("failed-precondition", "valid_instructor_required");
  }
  new Intl.DateTimeFormat("en", { timeZone: location.timezone || "Europe/Rome" });
  return { location, room, instructor, timezone: location.timezone || "Europe/Rome" };
}

export const saveGymSchedule = onCall({ region }, async (req) => {
  const uid = authUid(req.auth);
  const input = scheduleSchema.parse(req.data);
  const id = seriesId(uid, input.requestId);
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const result = await db.runTransaction(async (tx) => {
    const seriesRef = db.doc(`gymSeries/${id}`);
    const prior = await tx.get(seriesRef);
    if (prior.exists) {
      if (prior.data()?.digest !== digest) throw new HttpsError("invalid-argument", "request_id_reused");
      return { seriesId: id, sessionIds: prior.data()?.sessionIds as string[] };
    }
    const venue = await assertGymManager(uid, input.venueId, tx);
    if (input.status === "published" && !activePartner(venue)) {
      throw new HttpsError("failed-precondition", "active_partner_gym_required");
    }
    const assignment = await gymAssignment(tx, input.venueId, input.locationId, input.roomId, input.instructorId);
    const dates = occurrences(input, assignment.timezone);
    if (input.status === "published" && dates.some((date) => date.startsAt <= new Date())) {
      throw new HttpsError("invalid-argument", "start_must_be_future");
    }
    const sessions = dates.map((date) => ({ ...date, id: `${id}_${date.day.replace(/-/g, "")}` }));
    const refs = sessions.map((session) => db.doc(`gymSessions/${session.id}`));
    const existing = await tx.getAll(...refs);
    if (existing.some((doc) => doc.exists)) throw new HttpsError("already-exists", "session_exists");
    const slots: Slot[] = sessions.map((session) => ({ id: session.id, venueId: input.venueId,
      locationId: input.locationId, roomId: input.roomId, instructorId: input.instructorId,
      startsAt: session.startsAt, endsAt: session.endsAt }));
    if (input.status === "published") await updateScheduleLocks(tx, [], slots);
    sessions.forEach((session, index) => tx.create(refs[index], {
      venueId: input.venueId, locationId: input.locationId, roomId: input.roomId,
      instructorId: input.instructorId, venueName: venue.name, locationName: assignment.location.name,
      roomName: assignment.room.name, instructorName: assignment.instructor.fullName || assignment.instructor.name,
      instructorPhotoUrl: assignment.instructor.avatarUrl || assignment.instructor.photoUrls?.[0] || "",
      title: input.title, description: input.description, timezone: assignment.timezone,
      startsAt: Timestamp.fromDate(session.startsAt), endsAt: Timestamp.fromDate(session.endsAt),
      capacity: input.capacity, booked: 0, regularPriceCents: input.regularPriceCents, currency: "EUR",
      cancellationHours: input.cancellationHours, status: input.status, seriesId: id, revision: 1,
      createdAt: serverTime(), updatedAt: serverTime(),
    }));
    tx.create(seriesRef, { venueId: input.venueId, createdBy: uid, digest,
      sessionIds: sessions.map((session) => session.id), createdAt: serverTime() });
    return { seriesId: id, sessionIds: sessions.map((session) => session.id) };
  });
  return result;
});

const editSchema = z.object({ sessionId: z.string(), title: z.string().trim().min(2).max(120),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  description: z.string().trim().max(2000), locationId: z.string(), roomId: z.string(), instructorId: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  capacity: z.number().int().min(1).max(100), regularPriceCents: z.number().int().min(0).max(10000000),
  cancellationHours: z.number().min(0).max(720), status: z.enum(["draft", "published", "cancelled"]),
  reason: z.string().trim().max(500).default(""),
});

export const updateGymSession = onCall({ region }, async (req) => {
  const uid = authUid(req.auth);
  const input = editSchema.parse(req.data);
  const sessionId = safeId(input.sessionId);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`gymSessions/${sessionId}`);
    const old = (await tx.get(ref)).data() as GymSession | undefined;
    if (!old) throw new HttpsError("not-found", "session_not_found");
    const venue = await assertGymManager(uid, old.venueId, tx);
    if (old.status === "cancelled") throw new HttpsError("failed-precondition", "session_cancelled");
    if (old.startsAt.toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "past_session_locked");
    if (input.status === "published" && !activePartner(venue)) {
      throw new HttpsError("failed-precondition", "active_partner_gym_required");
    }
    if (input.status === "cancelled" && !input.reason) throw new HttpsError("invalid-argument", "reason_required");
    if (input.status === "draft" && old.booked > 0) {
      throw new HttpsError("failed-precondition", "booked_session_locked");
    }
    if (input.status === "cancelled") {
      const bookings = await tx.get(db.collection("gymBookings").where("sessionId", "==", sessionId)
        .where("state", "==", "confirmed"));
      if (old.status === "published") await updateScheduleLocks(tx, [slotOf(sessionId, old)], []);
      tx.update(ref, { status: "cancelled", booked: 0, cancellationReason: input.reason, updatedAt: serverTime() });
      bookings.docs.forEach((doc) => {
        tx.update(doc.ref, { state: "cancelled", cancellationReason: input.reason,
          refundDueCents: doc.data().paymentStatus === "paid" ? doc.data().finalPriceCents : 0,
          cancelledAt: serverTime(), updatedAt: serverTime() });
        tx.delete(db.doc(`gymSessionMembers/${membershipId(sessionId, doc.data().userId)}`));
        queueGymNotification(tx, `${doc.id}_${input.requestId}`, doc.data().userId,
          "cancelled_by_trainer", old.title, old.startsAt.toDate(), input.reason);
      });
      return;
    }
    if (input.capacity < old.booked) throw new HttpsError("failed-precondition", "capacity_below_bookings");
    const assignment = await gymAssignment(tx, old.venueId, safeId(input.locationId), safeId(input.roomId),
      safeId(input.instructorId));
    if (input.endTime <= input.startTime) throw new HttpsError("invalid-argument", "invalid_time_range");
    const startsAt = localInstant(input.startDate, input.startTime, assignment.timezone);
    const endsAt = localInstant(input.startDate, input.endTime, assignment.timezone);
    if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 8 * 3600000 ||
      (input.status === "published" && startsAt <= new Date())) {
      throw new HttpsError("invalid-argument", "invalid_time_range");
    }
    const changedForBooking = startsAt.getTime() !== old.startsAt.toMillis() ||
      endsAt.getTime() !== old.endsAt.toMillis() || assignment.timezone !== old.timezone ||
      input.title !== old.title || input.locationId !== old.locationId ||
      input.roomId !== old.roomId || input.instructorId !== old.instructorId;
    const bookings = changedForBooking ?
      await tx.get(db.collection("gymBookings").where("sessionId", "==", sessionId)
        .where("state", "==", "confirmed")) : null;
    await updateScheduleLocks(tx, old.status === "published" ? [slotOf(sessionId, old)] : [],
      input.status === "published" ? [{ id: sessionId, venueId: old.venueId,
        locationId: input.locationId, roomId: input.roomId, instructorId: input.instructorId, startsAt, endsAt }] : []);
    tx.update(ref, { title: input.title, description: input.description, locationId: input.locationId,
      roomId: input.roomId, instructorId: input.instructorId, locationName: assignment.location.name,
      roomName: assignment.room.name, instructorName: assignment.instructor.fullName || assignment.instructor.name,
      instructorPhotoUrl: assignment.instructor.avatarUrl || assignment.instructor.photoUrls?.[0] || "",
      timezone: assignment.timezone, startsAt: Timestamp.fromDate(startsAt), endsAt: Timestamp.fromDate(endsAt),
      capacity: input.capacity, regularPriceCents: input.regularPriceCents, revision: (old.revision ?? 1) + 1,
      cancellationHours: input.cancellationHours, status: input.status,
      updatedAt: serverTime() });
    bookings?.docs.forEach((doc) => {
      tx.update(doc.ref, { title: input.title, locationName: assignment.location.name,
        roomName: assignment.room.name, instructorName: assignment.instructor.fullName || assignment.instructor.name,
        startsAt: Timestamp.fromDate(startsAt), endsAt: Timestamp.fromDate(endsAt),
        timezone: assignment.timezone, updatedAt: serverTime() });
      queueGymNotification(tx, `${doc.id}_${input.requestId}`, doc.data().userId,
        "rescheduled", input.title, startsAt, input.reason);
    });
  });
  return { success: true };
});

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { dayContextFrom } from "./dayContext";
import { readDayDocs } from "./dayReads";
import { freeSlots } from "./slots";
import {
  canManageOwnAvailability,
  isBookableInstructor,
  validateAvailabilityUpdate,
  validateServiceDuration,
  validateSlotsRequest,
} from "./validate";

const region = process.env.FIREBASE_REGION || "europe-west1";

/**
 * Signed-in users: the free start times for one provider, service and date.
 *
 * Runs server-side because it has to see the provider's other bookings, which clients may
 * not read. Each slot carries its instant so the client can book it without doing
 * Europe/Rome arithmetic in the browser.
 */
export const getProviderSlots = onCall({ region }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const { instructorId, serviceId, date } = validateSlotsRequest(req.data);

  const db = getFirestore();
  const serviceSnap = await db.collection("instructors").doc(instructorId)
    .collection("services").doc(serviceId).get();
  const service = serviceSnap.data();
  if (!service || service.isActive === false) throw new HttpsError("not-found", "service_not_found");

  const docs = await readDayDocs(db, instructorId, date);
  if (!docs.instructor) throw new HttpsError("not-found", "instructor_not_found");
  if (!isBookableInstructor(docs.instructor)) throw new HttpsError("failed-precondition", "instructor_not_bookable");

  const slots = freeSlots({
    ...dayContextFrom(docs, date),
    durationMinutes: validateServiceDuration(service.durationMinutes),
    date,
    now: new Date(),
  });
  return { slots: slots.map((s) => ({ time: s.time, startsAt: s.startsAt.toISOString() })) };
});

/**
 * The provider saves their own weekly hours, booking rules and date exceptions.
 *
 * A callable, not a client write: the owner rule on instructors/{uid} compares a `uid` field
 * that older provider documents lack, and this validates the whole schedule once, here.
 */
export const updateMyAvailability = onCall({ region }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required");

  const db = getFirestore();
  const instructorRef = db.collection("instructors").doc(uid);
  const [userSnap, instructorSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    instructorRef.get(),
  ]);
  if (!canManageOwnAvailability(userSnap.data())) {
    throw new HttpsError("permission-denied", "Providers only");
  }
  // Never create a bare catalogue entry: a provider without a profile has nothing to book.
  if (!instructorSnap.exists) throw new HttpsError("failed-precondition", "no_instructor_profile");

  const update = validateAvailabilityUpdate(req.data);

  const batch = db.batch();
  batch.update(instructorRef, {
    availabilitySchedule: update.schedule,
    bookingRules: update.bookingRules,
    // backfillAvailability leaves a provider alone once this is set.
    availabilityUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const { date, reason, ...override } of update.upserts) {
    // merge: true so a save never drops unknown fields (e.g. createdAt) on this doc; reason
    // is written explicitly (a real value or an explicit delete) so a cleared reason doesn't
    // get silently kept by the merge.
    batch.set(instructorRef.collection("availability").doc(date), {
      ...override,
      date,
      reason: reason ?? FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  for (const date of update.deletes) {
    batch.delete(instructorRef.collection("availability").doc(date));
  }
  await batch.commit();

  return {
    windows: update.schedule.length,
    overridesWritten: update.upserts.length,
    overridesDeleted: update.deletes.length,
  };
});

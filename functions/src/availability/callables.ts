import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { dayContextFrom } from "./dayContext";
import { readDayDocs } from "./dayReads";
import { freeSlots, romeInstant } from "./slots";
import { validateSlotsRequest } from "./validate";

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

  const slots = freeSlots({
    ...dayContextFrom(docs),
    durationMinutes: Number(service.durationMinutes),
    date,
    now: new Date(),
  });
  return { slots: slots.map((time) => ({ time, startsAt: romeInstant(date, time).toISOString() })) };
});

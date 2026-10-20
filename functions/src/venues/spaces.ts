import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { region } from "../lib/runtimeOptions";
import { hostsCourses, type VenueType } from "../types";
import { managesVenue } from "../courses/authority";
import { db, domainError, nowStamp, safeId, uidOf } from "../courses/store";

const spaceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("location"), venueId: z.string(), id: z.string().optional(),
    name: z.string().trim().min(2).max(120), address: z.string().trim().min(2).max(300),
    city: z.string().trim().min(2).max(120), timezone: z.string().default("Europe/Rome"), isActive: z.boolean() }),
  z.object({ kind: z.literal("room"), venueId: z.string(), locationId: z.string(), id: z.string().optional(),
    name: z.string().trim().min(2).max(120), isActive: z.boolean() }),
]);

/** An unknown IANA zone is the caller's mistake (`invalid_timezone`), not an internal error. */
function assertTimezone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new HttpsError("invalid-argument", "invalid_timezone", { fields: ["timezone"] });
  }
}

/** A venue that cannot host courses is "not found" for everyone, as it was in the partner-gym flow. */
async function assertSpaceManager(uid: string, venueId: string, tx: Transaction) {
  const venue = (await tx.get(db.doc(`venues/${venueId}`))).data();
  if (!venue || !hostsCourses(venue.type as VenueType)) throw new HttpsError("not-found", "gym_not_found");
  if (!(await managesVenue(uid, venueId, tx))) {
    throw new HttpsError("permission-denied", "venue_authorization_required");
  }
}

export const saveGymSpace = onCall({ region }, async (req) => {
  try {
    return await saveSpace(req);
  } catch (error) {
    return domainError(error);
  }
});

async function saveSpace(req: CallableRequest) {
  const uid = uidOf(req.auth);
  const input = spaceSchema.parse(req.data);
  const venueId = safeId(input.venueId);
  const id = input.id ? safeId(input.id) : db.collection("venues").doc().id;
  if (input.kind === "location") {
    assertTimezone(input.timezone);
    await db.runTransaction(async (tx) => {
      await assertSpaceManager(uid, venueId, tx);
      tx.set(db.doc(`venues/${venueId}/locations/${id}`), {
        name: input.name, address: input.address, city: input.city,
        timezone: input.timezone, isActive: input.isActive, updatedAt: nowStamp(),
      }, { merge: true });
    });
  } else {
    const locationId = safeId(input.locationId);
    await db.runTransaction(async (tx) => {
      await assertSpaceManager(uid, venueId, tx);
      if (!(await tx.get(db.doc(`venues/${venueId}/locations/${locationId}`))).exists) {
        throw new HttpsError("not-found", "gym_location_not_found");
      }
      tx.set(db.doc(`venues/${venueId}/locations/${locationId}/rooms/${id}`), {
        name: input.name, isActive: input.isActive, updatedAt: nowStamp(),
      }, { merge: true });
    });
  }
  return { id };
}

export const configureGymInstructor = onCall({ region }, async (req) => {
  try {
    return await configureInstructor(req);
  } catch (error) {
    return domainError(error);
  }
});

async function configureInstructor(req: CallableRequest) {
  const uid = uidOf(req.auth);
  const venueId = safeId(req.data.venueId);
  const instructorId = safeId(req.data.instructorId);
  const status = req.data.partnerStatus;
  if (!["pending", "active", "suspended"].includes(status) || typeof req.data.isActive !== "boolean") {
    throw new HttpsError("invalid-argument", "invalid_instructor_partnership");
  }
  await db.runTransaction(async (tx) => {
    const [actor, venue, instructor] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`venues/${venueId}`)),
      tx.get(db.doc(`instructors/${instructorId}`)),
    ]);
    if (!["admin", "superadmin"].includes(actor.data()?.role)) {
      throw new HttpsError("permission-denied", "admin_required");
    }
    if (!hostsCourses(venue.data()?.type as VenueType) || instructor.data()?.providerProfile?.isVerified !== true) {
      throw new HttpsError("failed-precondition", "verified_instructor_required");
    }
    tx.set(db.doc(`venues/${venueId}/instructors/${instructorId}`), {
      isActive: req.data.isActive, name: instructor.data()?.fullName || instructor.data()?.name || "",
      photoUrl: instructor.data()?.avatarUrl || instructor.data()?.photoUrls?.[0] || "",
      updatedAt: nowStamp(),
    }, { merge: true });
    tx.update(db.doc(`instructors/${instructorId}`), { partnerStatus: status, updatedAt: nowStamp() });
  });
  return { success: true };
}

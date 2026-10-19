import { createHash } from "crypto";
import { getFirestore, FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { hostsCourses, type VenueType } from "../types";

export const db = getFirestore();
export const serverTime = () => FieldValue.serverTimestamp();

export interface GymSession {
  venueId: string; locationId: string; roomId: string; instructorId: string;
  venueName: string; locationName: string; roomName: string; instructorName: string; instructorPhotoUrl: string;
  title: string; description: string; timezone: string; startsAt: Timestamp; endsAt: Timestamp;
  capacity: number; booked: number; regularPriceCents: number; currency: "EUR";
  cancellationHours: number; status: "draft" | "published" | "cancelled";
  seriesId: string; revision?: number;
}

export interface GymBooking {
  userId: string; customerName: string; sessionId: string; venueId: string; title: string;
  venueName: string; locationName: string; roomName: string; instructorName: string;
  startsAt: Timestamp; endsAt: Timestamp; timezone: string;
  state: "confirmed" | "cancelled";
  paymentMode: "direct"; paymentStatus: "pending" | "paid";
  regularPriceCents: number; discountCents: number; finalPriceCents: number;
  gymPercent: number; instructorPercent: number; currency: "EUR";
  cancellationHours: number; createdAt: Timestamp;
}

export function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError("invalid-argument", "invalid_id");
  }
  return value;
}

export function membershipId(sessionId: string, uid: string): string {
  return createHash("sha256").update(`${sessionId}:${uid}`).digest("hex");
}

export function authUid(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required");
  return auth.uid;
}

export async function assertGymManager(uid: string, venueId: string, tx: Transaction) {
  const [userDoc, venueDoc, staffDoc] = await Promise.all([
    tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`venues/${venueId}`)), tx.get(db.doc(`venueStaff/${uid}`)),
  ]);
  const user = userDoc.data();
  const venue = venueDoc.data();
  if (!user || user.isActive === false || ["suspended", "deleted"].includes(user.accountStatus)) {
    throw new HttpsError("permission-denied", "account_inactive");
  }
  if (!venue || !hostsCourses(venue.type as VenueType)) throw new HttpsError("not-found", "gym_not_found");
  if (user.role !== "admin" && user.role !== "superadmin" && venue.ownerId !== uid &&
    (staffDoc.data()?.venueId !== venueId || staffDoc.data()?.isActive === false)) {
    throw new HttpsError("permission-denied", "gym_staff_required");
  }
  return venue;
}

export function activePartner(venue: FirebaseFirestore.DocumentData | undefined) {
  return !!venue && hostsCourses(venue.type as VenueType) && venue.isActive !== false &&
    venue.partnerStatus === "active";
}

export type Slot = { id: string; venueId: string; locationId: string; roomId: string;
  instructorId: string; startsAt: Date; endsAt: Date };

function days(start: Date, end: Date) {
  const first = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const lastDate = new Date(end.getTime() - 1);
  const last = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate());
  const values: string[] = [];
  for (let ms = first; ms <= last; ms += 86400000) values.push(new Date(ms).toISOString().slice(0, 10));
  return values;
}

function lockPaths(slot: Slot) {
  return days(slot.startsAt, slot.endsAt).flatMap((day) => [
    `gymScheduleLocks/room_${slot.venueId}_${slot.locationId}_${slot.roomId}_${day}`,
    `gymScheduleLocks/instructor_${slot.instructorId}_${day}`,
  ]);
}

/** Read and write the same day documents in one transaction so concurrent publishers cannot overlap. */
export async function updateScheduleLocks(tx: Transaction, remove: Slot[], add: Slot[]) {
  const paths = [...new Set([...remove, ...add].flatMap(lockPaths))];
  if (!paths.length) return;
  const refs = paths.map((path) => db.doc(path));
  const docs = await tx.getAll(...refs);
  const entries = new Map(docs.map((doc) => [doc.ref.path,
    { ...(doc.data()?.slots ?? {}) } as Record<string, { start: number; end: number }>]));
  for (const slot of remove) for (const path of lockPaths(slot)) delete entries.get(path)?.[slot.id];
  for (const slot of add) {
    for (const path of lockPaths(slot)) {
      const current = entries.get(path)!;
      if (Object.values(current).some((other) => other.start < slot.endsAt.getTime() &&
        other.end > slot.startsAt.getTime())) {
        throw new HttpsError("failed-precondition", path.includes("/room_") ? "room_conflict" : "instructor_conflict");
      }
      current[slot.id] = { start: slot.startsAt.getTime(), end: slot.endsAt.getTime() };
    }
  }
  refs.forEach((ref) => tx.set(ref, { slots: entries.get(ref.path) }));
}

export function slotOf(id: string, session: GymSession): Slot {
  return { id, venueId: session.venueId, locationId: session.locationId, roomId: session.roomId,
    instructorId: session.instructorId, startsAt: session.startsAt.toDate(), endsAt: session.endsAt.toDate() };
}

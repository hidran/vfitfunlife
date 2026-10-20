import { HttpsError } from "firebase-functions/v2/https";
import type { DocumentData, Transaction } from "firebase-admin/firestore";
import { db, type Course } from "./store";

export type Authority = { uid: string; via: "owner" | "venue" | "admin" };

const read = async (path: string, tx?: Transaction): Promise<DocumentData | undefined> => {
  const ref = db.doc(path);
  return (await (tx ? tx.get(ref) : ref.get())).data();
};
const activeUser = (user: DocumentData | undefined) =>
  !!user && user.isActive !== false && user.accountStatus !== "suspended" && user.accountStatus !== "deleted";
const isAdmin = (user: DocumentData | undefined) => user?.role === "admin" || user?.role === "superadmin";

async function load(uid: string, venueId: string | null, tx?: Transaction) {
  const [user, venue, staff] = await Promise.all([
    read(`users/${uid}`, tx),
    venueId ? read(`venues/${venueId}`, tx) : undefined,
    venueId ? read(`venueStaff/${uid}`, tx) : undefined,
  ]);
  return { user, venue, staff };
}

function venueAccess(uid: string, venueId: string, { user, venue, staff }: Awaited<ReturnType<typeof load>>) {
  if (!venue || !activeUser(user)) return false;
  return isAdmin(user) || venue.ownerId === uid || (staff?.venueId === venueId && staff.isActive !== false);
}

/** Owner, active staff or admin. Does not require the venue to host courses: callers decide. */
export async function managesVenue(uid: string, venueId: string, tx?: Transaction): Promise<boolean> {
  return venueAccess(uid, venueId, await load(uid, venueId, tx));
}

export async function canManageCourse(
  uid: string, course: Pick<Course, "providerId" | "venueId">, tx?: Transaction,
): Promise<Authority> {
  const loaded = await load(uid, course.venueId, tx);
  if (!activeUser(loaded.user)) throw new HttpsError("permission-denied", "account_inactive");
  if (uid === course.providerId) return { uid, via: "owner" };
  if (isAdmin(loaded.user)) return { uid, via: "admin" };
  if (course.venueId && venueAccess(uid, course.venueId, loaded)) return { uid, via: "venue" };
  throw new HttpsError("permission-denied", "course_owner_required");
}

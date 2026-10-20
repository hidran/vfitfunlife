import { getFirestore, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export type LockSlot = {
  id: string; courseName: string; venueId: string | null; locationId: string | null; roomId: string | null;
  instructorId: string | null; startsAt: Date; endsAt: Date;
};
type StoredSlot = { start: number; end: number; courseName?: string };

// A course that takes any lock writes up to two day documents per session; this keeps one transaction small.
export const MAX_LOCKED_SESSIONS = 400;

// Keys are UTC days so a slot's documents never depend on the venue timezone or on DST.
function utcDays(start: Date, end: Date): string[] {
  const first = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const lastDate = new Date(end.getTime() - 1);
  const last = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate());
  const days: string[] = [];
  for (let ms = first; ms <= last; ms += 86400000) days.push(new Date(ms).toISOString().slice(0, 10));
  return days;
}

export function lockPaths(slot: LockSlot): string[] {
  const room = slot.venueId && slot.locationId && slot.roomId ?
    `room_${slot.venueId}_${slot.locationId}_${slot.roomId}` : null;
  return utcDays(slot.startsAt, slot.endsAt).flatMap((day) => [
    ...(room ? [`courseScheduleLocks/${room}_${day}`] : []),
    ...(slot.instructorId ? [`courseScheduleLocks/instructor_${slot.instructorId}_${day}`] : []),
  ]);
}

// courseName is display-only (it feeds the overlap error), so a rename does not rewrite hundreds of lock documents.
const sameSlot = (a: LockSlot, b: LockSlot) => a.venueId === b.venueId && a.locationId === b.locationId &&
  a.roomId === b.roomId && a.instructorId === b.instructorId &&
  a.startsAt.getTime() === b.startsAt.getTime() && a.endsAt.getTime() === b.endsAt.getTime();

export function diffSlots(before: LockSlot[], after: LockSlot[]): { remove: LockSlot[]; add: LockSlot[] } {
  const prior = new Map(before.map((slot) => [slot.id, slot]));
  const next = new Map(after.map((slot) => [slot.id, slot]));
  return {
    remove: before.filter((slot) => {
      const kept = next.get(slot.id); return !kept || !sameSlot(slot, kept);
    }),
    add: after.filter((slot) => {
      const old = prior.get(slot.id); return !old || !sameSlot(slot, old);
    }),
  };
}

/** Reads and writes the same day documents in the caller's transaction, so concurrent publishers cannot overlap. */
export async function updateScheduleLocks(tx: Transaction, remove: LockSlot[], add: LockSlot[]): Promise<void> {
  const paths = [...new Set([...remove, ...add].flatMap(lockPaths))];
  if (!paths.length) return;
  const db = getFirestore();
  const refs = paths.map((path) => db.doc(path));
  const docs = await tx.getAll(...refs);
  const entries = new Map(docs.map((doc) => [doc.ref.path,
    { ...(doc.data()?.slots ?? {}) } as Record<string, StoredSlot>]));
  const exists = new Map(docs.map((doc) => [doc.ref.path, doc.exists]));
  const dirty = new Set<string>();
  for (const slot of remove) {
    for (const path of lockPaths(slot)) {
      if (entries.get(path)![slot.id]) {
        delete entries.get(path)![slot.id]; dirty.add(path);
      }
    }
  }
  for (const slot of add) {
    const start = slot.startsAt.getTime();
    const end = slot.endsAt.getTime();
    for (const path of lockPaths(slot)) {
      const current = entries.get(path)!;
      const clash = Object.entries(current).find(([id, other]) =>
        id !== slot.id && other.start < end && other.end > start);
      if (clash) {
        throw new HttpsError("failed-precondition", path.includes("/room_") ? "room_overlap" : "instructor_overlap", {
          courseName: clash[1].courseName ?? "", startsAt: new Date(clash[1].start).toISOString(),
          endsAt: new Date(clash[1].end).toISOString(),
        });
      }
      current[slot.id] = { start, end, courseName: slot.courseName };
      dirty.add(path);
    }
  }
  refs.filter((ref) => dirty.has(ref.path)).forEach((ref) => {
    const slots = entries.get(ref.path)!;
    if (Object.keys(slots).length) tx.set(ref, { slots });
    else if (exists.get(ref.path)) tx.delete(ref);
  });
}

type StampLike = { toDate(): Date };
type LockableSession = {
  startsAt: StampLike; endsAt: StampLike; state: string;
  venueId?: string | null; locationId?: string | null; roomId?: string | null; instructorId?: string | null;
};

/** The slots a course should hold: none unless it is published, and only for sessions still scheduled. */
export function slotsOf(
  courseId: string, course: { state: string; name: string }, sessions: { id: string; data: LockableSession }[]
): LockSlot[] {
  if (course.state !== "published") return [];
  return sessions.filter(({ data }) => data.state === "scheduled").map(({ id, data }) => ({
    id: `${courseId}_${id}`, courseName: course.name, venueId: data.venueId ?? null,
    locationId: data.locationId ?? null,
    roomId: data.roomId ?? null, instructorId: data.instructorId ?? null,
    startsAt: data.startsAt.toDate(), endsAt: data.endsAt.toDate(),
  }));
}

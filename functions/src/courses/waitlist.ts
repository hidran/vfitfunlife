import type { Timestamp } from "firebase-admin/firestore";
import type { Course, Session } from "./store";

export const WAITLIST_MAX = 100;
// Candidates tried per freed seat inside one transaction, and lessons handled per transaction (R16).
export const PROMOTION_SCAN = 5;
export const MAX_PROMOTION_SESSIONS_PER_TX = 25;

// "free" = the seat is already free in the stored counters (capacity raised, stranded entry).
export type FreedSeat = { sessionId: string; kind: "occupied" | "held" | "free" };

export type JoinRefusal = "waitlist_disabled" | "waitlist_not_open" | "already_enrolled" | "already_waitlisted" |
  "waitlist_full";

type WaitlistCourse = Pick<Course, "state" | "enrollmentClosed" | "capacity" | "bookingNoticeHours"> &
  { waitlistEnabled?: boolean };
type Starts = { startsAt: Date | Pick<Timestamp, "toMillis"> };
type WaitlistSession = Pick<Session, "state" | "occupied" | "held"> & { capacity?: number } & Starts;

const startMillis = (session: Starts) =>
  session.startsAt instanceof Date ? session.startsAt.getTime() : session.startsAt.toMillis();

export function isFull(session: Pick<WaitlistSession, "occupied" | "held" | "capacity">,
  course: Pick<WaitlistCourse, "capacity">): boolean {
  return session.occupied + session.held >= (session.capacity ?? course.capacity);
}

/** Promotion (and joining) needs the same notice a walk-in booking needs: a lesson at the boundary is closed. */
export function promotionWindowOpen(session: Starts,
  course: Pick<WaitlistCourse, "bookingNoticeHours">, now: Date): boolean {
  return startMillis(session) > now.getTime() + course.bookingNoticeHours * 3600000;
}

export function joinDecision(args: {
  course: WaitlistCourse; session: WaitlistSession; now: Date;
  hasParticipant: boolean; hasEntry: boolean; waitlisted: number;
}): JoinRefusal | null {
  const { course, session, now } = args;
  if (course.waitlistEnabled === false) return "waitlist_disabled";
  if (args.hasParticipant) return "already_enrolled";
  if (args.hasEntry) return "already_waitlisted";
  if (course.state !== "published" || course.enrollmentClosed || session.state !== "scheduled" ||
    !isFull(session, course) || !promotionWindowOpen(session, course, now)) return "waitlist_not_open";
  if (args.waitlisted >= WAITLIST_MAX) return "waitlist_full";
  return null;
}

/** Positions stay contiguous from 1 and keep their order; ids not in the list are ignored. */
export function renumber(entries: { id: string; position: number }[], removed: string[]):
  { id: string; position: number }[] {
  const gone = new Set(removed);
  return entries.filter((entry) => !gone.has(entry.id)).map((entry, index) => ({ id: entry.id, position: index + 1 }));
}

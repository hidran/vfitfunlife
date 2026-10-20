import { createHash } from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import { readPaymentSettings } from "../payments/paymentSettingsCallables";
import { checkoutActive } from "./core";
import { db, safeId, uidOf, nowStamp, domainError, eligibleProvider, Course, Session, WaitlistEntry } from "./store";

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

const waitlistRef = (courseId: string, sessionId: string, uid: string) =>
  db.doc(`courses/${courseId}/sessions/${sessionId}/waitlist/${uid}`);

/**
 * A customer joins the waitlist of one full lesson. The entry carries what promotion needs (requestId, paymentMode)
 * so the later enrollment is a plain replay-safe enrollInTx. Positions are contiguous: join = waitlisted + 1.
 */
export const joinCourseWaitlist = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  const courseId = safeId(req.data.courseId);
  const sessionId = safeId(req.data.sessionId);
  const requestId = safeId(req.data.requestId);
  const paymentMode = req.data.paymentMode ?? "direct";
  if (!["direct", "stripe"].includes(paymentMode)) throw new HttpsError("invalid-argument", "invalid_booking_option");
  if (paymentMode === "stripe" && !checkoutActive(await readPaymentSettings())) {
    throw new HttpsError("failed-precondition", "Online course payments are not enabled");
  }
  const enrollmentId = createHash("sha256").update(`${uid}:${requestId}`).digest("hex");
  const entryRef = waitlistRef(courseId, sessionId, uid);
  try {
    return await db.runTransaction(async (tx) => {
      const sessionRef = db.doc(`courses/${courseId}/sessions/${sessionId}`);
      const [courseDoc, sessionDoc, participant, entry, enrollment, userDoc] = await tx.getAll(
        db.doc(`courses/${courseId}`), sessionRef, sessionRef.collection("participants").doc(uid), entryRef,
        db.doc(`courseEnrollments/${enrollmentId}`), db.doc(`users/${uid}`));
      const course = courseDoc.data() as Course | undefined;
      if (!course) throw new HttpsError("not-found", "course_not_found");
      const session = sessionDoc.data() as Session | undefined;
      if (!session) throw new HttpsError("not-found", "session_not_found");
      const prior = entry.data() as WaitlistEntry | undefined;
      if (prior?.requestId === requestId) return { success: true, position: prior.position, replay: true };
      if (enrollment.exists) throw new HttpsError("invalid-argument", "request_id_reused");
      const user = userDoc.data();
      if (!user || user.isActive === false || ["suspended", "deleted"].includes(user.accountStatus)) {
        throw new HttpsError("permission-denied", "account_inactive");
      }
      if (course.providerId === uid) throw new HttpsError("failed-precondition", "cannot_book_yourself");
      await eligibleProvider(course.providerId, tx);
      if (course.venueId) {
        const venue = (await tx.get(db.doc(`venues/${course.venueId}`))).data();
        if (!venue || venue.isActive === false || venue.partnerStatus !== "active") {
          throw new HttpsError("failed-precondition", "venue_not_active");
        }
      }
      const waitlisted = session.waitlisted ?? 0;
      const refusal = joinDecision({ course, session, now: new Date(), hasParticipant: participant.exists,
        hasEntry: entry.exists, waitlisted });
      if (refusal) throw new HttpsError("failed-precondition", refusal);
      const position = waitlisted + 1;
      const record: Omit<WaitlistEntry, "createdAt"> & { createdAt: FieldValue } = {
        userId: uid, customerName: user.fullName ?? user.displayName ?? "", scope: "lesson", requestId,
        paymentMode, position, createdAt: nowStamp(), courseId, sessionId,
        courseName: course.name, providerId: course.providerId, venueId: course.venueId ?? null,
      };
      tx.create(entryRef, record);
      tx.update(sessionRef, { waitlisted: FieldValue.increment(1) });
      return { success: true, position, replay: false };
    });
  } catch (error) {
    return domainError(error);
  }
});

/**
 * Removes one entry and closes the gap behind it. Used by the customer (leave) and, with authority resolved by the
 * caller, by staff removing another customer's entry. Returns false when there was nothing to remove.
 */
export async function removeFromWaitlist(courseId: string, sessionId: string, uid: string): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const sessionRef = db.doc(`courses/${courseId}/sessions/${sessionId}`);
    const list = db.collection(`courses/${courseId}/sessions/${sessionId}/waitlist`);
    // The session is read so that a concurrent join (which writes it) cannot slip a duplicate position in.
    const [sessionDoc, entries] = await Promise.all([
      tx.get(sessionRef), tx.get(list.orderBy("position").limit(WAITLIST_MAX))]);
    if (!sessionDoc.exists || !entries.docs.some((doc) => doc.id === uid)) return false;
    const kept = renumber(entries.docs.map((doc) => ({ id: doc.id, position: doc.data().position as number })), [uid]);
    const current = new Map(entries.docs.map((doc) => [doc.id, doc.data().position as number]));
    tx.delete(list.doc(uid));
    for (const { id, position } of kept) if (current.get(id) !== position) tx.update(list.doc(id), { position });
    tx.update(sessionRef, { waitlisted: FieldValue.increment(-1) });
    return true;
  });
}

export const leaveCourseWaitlist = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  const courseId = safeId(req.data.courseId);
  const sessionId = safeId(req.data.sessionId);
  try {
    await removeFromWaitlist(courseId, sessionId, uid);
    return { success: true };
  } catch (error) {
    return domainError(error);
  }
});

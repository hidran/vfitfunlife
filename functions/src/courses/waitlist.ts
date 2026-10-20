import { createHash } from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { FieldValue, type DocumentReference, type Timestamp, type Transaction } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import { readPaymentSettings } from "../payments/paymentSettingsCallables";
import { checkoutActive } from "./core";
import { db, safeId, uidOf, nowStamp, domainError, eligibleProvider, Course, Session, WaitlistEntry } from "./store";
import { enrollInTx } from "./enrollTx";
import { queueCourseNotification } from "./notifications";

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

/** The id a promotion gives the enrollment: the same as a direct booking with that request id, so retries replay. */
const waitlistEnrollmentId = (uid: string, requestId: string) =>
  createHash("sha256").update(`${uid}:${requestId}`).digest("hex");

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
  const enrollmentId = waitlistEnrollmentId(uid, requestId);
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

// ---------------------------------------------------------------------------------------------------------------
// Promotion (D4). Everything here runs inside the caller's transaction: reads in planPromotions, writes in apply().
// ---------------------------------------------------------------------------------------------------------------

// A Firestore transaction commits at most 500 writes. The caller's own release writes are small (a few per lesson),
// so the planner keeps its share well below the limit; lessons that do not fit are left to promoteWaitlist / the sweep.
export const PROMOTION_WRITE_BUDGET = 350;

export type PromotionPlan = {
  apply: () => void;
  promoted: { sessionId: string; uid: string; enrollmentId: string }[];
  // Lessons whose whole waitlist was closed because the notice window is over.
  cleared: string[];
  // Entries removed one by one because they can never be promoted.
  dropped: { sessionId: string; uid: string }[];
};

type Candidate = { id: string; ref: DocumentReference; data: WaitlistEntry };
type CourseRef = Pick<Course, "name" | "providerName" | "providerId" | "venueId"> & { id: string };

// Refusals that belong to the entry: it can never be promoted as it stands, so it leaves the list and the next one
// is tried. Anything else concerns the lesson (full, venue off, deadline, closed...): the entry stays for later.
const ENTRY_REFUSALS = new Set(["account_inactive", "cannot_book_yourself", "already_enrolled", "request_id_reused",
  "checkout_amount_too_low", "Online course payments are not enabled"]);

/** Contention and transport errors (numeric gRPC codes) must abort so the surrounding transaction retries. */
function classifyRefusal(error: unknown): "drop" | "stop" {
  if (typeof (error as { code?: unknown } | null)?.code === "number") throw error;
  const message = error instanceof Error ? error.message : "";
  if (!ENTRY_REFUSALS.has(message)) logger.warn("waitlist promotion stopped", { message });
  return ENTRY_REFUSALS.has(message) ? "drop" : "stop";
}

const listOf = (courseId: string, sessionId: string) =>
  db.collection(`courses/${courseId}/sessions/${sessionId}/waitlist`);

function queueCleared(tx: Transaction, course: CourseRef, entry: WaitlistEntry, reason: string): void {
  queueCourseNotification(tx, `${course.id}_${entry.sessionId}_${entry.requestId}`, "waitlist_cleared",
    entry.userId, course, undefined, reason);
}

/**
 * Closes the whole waitlist of one lesson (cancelled, rescheduled, archived, window closed). Reads now; the returned
 * writer deletes every entry, zeroes the counter and tells each customer. An empty list writes nothing.
 */
export async function clearWaitlistInTx(tx: Transaction, course: CourseRef, sessionId: string,
  reason: "lesson_cancelled" | "rescheduled" | "archived" | "window_closed"): Promise<() => void> {
  const entries = (await tx.get(listOf(course.id, sessionId).orderBy("position").limit(WAITLIST_MAX))).docs;
  if (!entries.length) return () => undefined;
  return () => {
    for (const doc of entries) {
      tx.delete(doc.ref);
      queueCleared(tx, course, doc.data() as WaitlistEntry, reason);
    }
    tx.update(db.doc(`courses/${course.id}/sessions/${sessionId}`), { waitlisted: 0 });
  };
}

type SessionPlan = {
  writers: (() => void)[]; promoted: PromotionPlan["promoted"]; dropped: PromotionPlan["dropped"];
  cleared: boolean; cost: number; enrollmentIds: string[];
};

async function planSession(tx: Transaction, args: {
  course: Course & { id: string }; sessionId: string; session: Session; seats: FreedSeat[]; checkoutOn: boolean;
  now: Date; taken: ReadonlySet<string>;
}): Promise<SessionPlan | null> {
  const { course, sessionId, session, seats, checkoutOn, now } = args;
  const entries: Candidate[] = (await tx.get(listOf(course.id, sessionId).orderBy("position").limit(WAITLIST_MAX)))
    .docs.map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() as WaitlistEntry }));
  if (!entries.length) return null;
  const sessionRef = db.doc(`courses/${course.id}/sessions/${sessionId}`);
  const plan: SessionPlan = { writers: [], promoted: [], dropped: [], cleared: false, cost: 1, enrollmentIds: [] };
  const startsAt = session.startsAt.toDate();

  if (!promotionWindowOpen(session, course, now)) {
    plan.cleared = true;
    plan.cost += entries.length * 2;
    plan.writers.push(() => {
      for (const entry of entries) {
        tx.delete(entry.ref);
        queueCleared(tx, course, entry.data, "window_closed");
      }
      tx.update(sessionRef, { waitlisted: 0 });
    });
    return plan;
  }

  // The freed seats count as free for the capacity check of every promotion into this lesson; there are never more
  // promotions than freed seats, so the lesson cannot end up over capacity.
  const released = { occupied: seats.filter((s) => s.kind === "occupied").length,
    held: seats.filter((s) => s.kind === "held").length };
  const removed = new Set<string>();
  const entryAt = { cursor: 0 };
  const writers: (() => void)[] = [];
  const notify: (() => void)[] = [];
  let stopped = false;
  for (let seat = 0; seat < seats.length && !stopped; seat++) {
    for (let scanned = 0; scanned < PROMOTION_SCAN && entryAt.cursor < entries.length; scanned++) {
      const entry = entries[entryAt.cursor++];
      const uid = entry.data.userId;
      const enrollmentId = waitlistEnrollmentId(uid, entry.data.requestId);
      let outcome: "promoted" | "drop" | "drop_silently" | "stop";
      if (entry.data.paymentMode === "stripe" && !checkoutOn) outcome = "drop";
      // One request id can sit on several lessons; the first promotion consumes it (the enrollment id derives from it).
      else if (args.taken.has(enrollmentId) || plan.enrollmentIds.includes(enrollmentId)) outcome = "drop";
      else {
        try {
          const { result, commit } = await enrollInTx(tx, {
            actor: uid, uid, courseId: course.id, scope: "lesson", sessionId, paymentMode: entry.data.paymentMode,
            requestId: entry.data.requestId, byProvider: false, skipPriceCheck: true, promotedFromWaitlist: true,
            checkoutOn, released: { [sessionId]: released },
          });
          if (result.replay) outcome = "drop_silently";
          else {
            outcome = "promoted";
            writers.push(commit);
            plan.enrollmentIds.push(enrollmentId);
            plan.promoted.push({ sessionId, uid, enrollmentId });
            plan.cost += 10;
            notify.push(() => queueCourseNotification(tx, enrollmentId, "waitlist_promoted", uid, course, startsAt));
          }
        } catch (error) {
          outcome = classifyRefusal(error);
        }
      }
      if (outcome === "stop") {
        stopped = true;
        break;
      }
      removed.add(entry.id);
      if (outcome === "promoted") break;
      plan.cost += 1;
      if (outcome === "drop") {
        plan.dropped.push({ sessionId, uid });
        notify.push(() => queueCleared(tx, course, entry.data, "entry_dropped"));
        plan.cost += 1;
      }
    }
  }
  if (!removed.size) return null;
  const kept = renumber(entries.map((e) => ({ id: e.id, position: e.data.position })), [...removed]);
  const current = new Map(entries.map((e) => [e.id, e.data.position]));
  const moves = kept.filter(({ id, position }) => current.get(id) !== position);
  plan.cost += moves.length;
  plan.writers.push(...writers, () => {
    for (const id of removed) tx.delete(listOf(course.id, sessionId).doc(id));
    for (const { id, position } of moves) tx.update(listOf(course.id, sessionId).doc(id), { position });
    tx.update(sessionRef, { waitlisted: FieldValue.increment(-removed.size) });
    notify.forEach((send) => send());
  });
  return plan;
}

/**
 * Plans the promotion of waitlisted customers into seats the caller frees in the SAME transaction. Only reads here;
 * the caller writes its own release first or after, then calls apply(). No write happens unless apply() is called.
 *
 * Per freed seat the first PROMOTION_SCAN entries are tried in order. An entry that can never be promoted (inactive
 * account, Stripe entry while checkout is off or the price is unpayable, the customer's own course, a request id
 * already used by an earlier promotion) is dropped with `waitlist_cleared` and the next is tried. A refusal that
 * concerns the lesson (full, venue off, deadline) stops that lesson and keeps its entries. Lessons whose notice
 * window is over lose their whole waitlist. Lessons are skipped, not failed, when the write budget is spent.
 */
export async function planPromotions(tx: Transaction, args: {
  course: Course & { id: string }; sessions: Map<string, Session>; freed: FreedSeat[]; checkoutOn: boolean; now: Date;
}): Promise<PromotionPlan> {
  const { course, sessions, freed } = args;
  const plan: PromotionPlan = { apply: () => undefined, promoted: [], cleared: [], dropped: [] };
  if (course.state !== "published" || course.enrollmentClosed) return plan;
  const seatsOf = new Map<string, FreedSeat[]>();
  for (const seat of freed) {
    const session = sessions.get(seat.sessionId);
    // The stored counter decides whether there is anything to read; joins write the session, so a racing join
    // conflicts with the caller's transaction.
    if (session?.state !== "scheduled" || (session.waitlisted ?? 0) < 1) continue;
    seatsOf.set(seat.sessionId, [...(seatsOf.get(seat.sessionId) ?? []), seat]);
  }
  const writers: (() => void)[] = [];
  const taken = new Set<string>();
  let writes = 0;
  for (const sessionId of [...seatsOf.keys()].slice(0, MAX_PROMOTION_SESSIONS_PER_TX)) {
    const sessionPlan = await planSession(tx, { course, sessionId, session: sessions.get(sessionId)!,
      seats: seatsOf.get(sessionId)!, checkoutOn: args.checkoutOn, now: args.now, taken });
    if (!sessionPlan || writes + sessionPlan.cost > PROMOTION_WRITE_BUDGET) continue;
    writes += sessionPlan.cost;
    writers.push(...sessionPlan.writers);
    sessionPlan.enrollmentIds.forEach((id) => taken.add(id));
    plan.promoted.push(...sessionPlan.promoted);
    plan.dropped.push(...sessionPlan.dropped);
    if (sessionPlan.cleared) plan.cleared.push(sessionId);
  }
  plan.apply = () => writers.forEach((write) => write());
  return plan;
}

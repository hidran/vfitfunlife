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
export async function removeFromWaitlist(courseId: string, sessionId: string, uid: string,
  opts: { notifyRemoved?: boolean } = {}): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const sessionRef = db.doc(`courses/${courseId}/sessions/${sessionId}`);
    const list = db.collection(`courses/${courseId}/sessions/${sessionId}/waitlist`);
    // The session is read so that a concurrent join (which writes it) cannot slip a duplicate position in.
    const [sessionDoc, entries, courseDoc] = await Promise.all([
      tx.get(sessionRef), tx.get(list.orderBy("position").limit(WAITLIST_MAX)),
      opts.notifyRemoved ? tx.get(db.doc(`courses/${courseId}`)) : Promise.resolve(undefined)]);
    const entry = entries.docs.find((doc) => doc.id === uid);
    if (!sessionDoc.exists || !entry) return false;
    const kept = renumber(entries.docs.map((doc) => ({ id: doc.id, position: doc.data().position as number })), [uid]);
    const current = new Map(entries.docs.map((doc) => [doc.id, doc.data().position as number]));
    tx.delete(list.doc(uid));
    for (const { id, position } of kept) if (current.get(id) !== position) tx.update(list.doc(id), { position });
    tx.update(sessionRef, { waitlisted: FieldValue.increment(-1) });
    const course = courseDoc?.data() as Course | undefined;
    if (course) {
      // The same customer may be removed twice over time (joined again with the same request id): one notice each.
      queueRemoved(tx, { ...course, id: courseId }, entry.data() as WaitlistEntry, "staff", `_${Date.now()}`);
    }
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

// Why an entry leaves on its own. `waitlist_removed` words payment_unavailable / amount_too_low specifically ("online
// payment is unavailable, join again") and everything else with the generic sentence.
export type RemovalReason = "payment_unavailable" | "amount_too_low" | "account_inactive" | "request_reused" |
  "own_course" | "already_enrolled" | "staff";

// Refusals that belong to the entry: it can never be promoted as it stands, so it leaves the list and the next one
// is tried. Anything else concerns the lesson (full, venue off, deadline, closed...): the entry stays for later.
const ENTRY_REFUSALS: Record<string, RemovalReason> = {
  "account_inactive": "account_inactive", "cannot_book_yourself": "own_course", "already_enrolled": "already_enrolled",
  "request_id_reused": "request_reused", "checkout_amount_too_low": "amount_too_low",
  "Online course payments are not enabled": "payment_unavailable",
};

/** Contention and transport errors (numeric gRPC codes) must abort so the surrounding transaction retries. */
function classifyRefusal(error: unknown): RemovalReason | "stop" {
  if (typeof (error as { code?: unknown } | null)?.code === "number") throw error;
  const message = error instanceof Error ? error.message : "";
  const reason = ENTRY_REFUSALS[message];
  if (!reason) logger.warn("waitlist promotion stopped", { message });
  return reason ?? "stop";
}

const listOf = (courseId: string, sessionId: string) =>
  db.collection(`courses/${courseId}/sessions/${sessionId}/waitlist`);

/** The lesson's whole list was closed (cancelled, moved, archived, inside the notice window). */
function queueCleared(tx: Transaction, course: CourseRef, entry: WaitlistEntry, reason: string): void {
  queueCourseNotification(tx, `${course.id}_${entry.sessionId}_${entry.requestId}`, "waitlist_cleared",
    entry.userId, course, undefined, reason);
}

/** One entry left the list on its own (or by staff): the customer is told why. */
function queueRemoved(tx: Transaction, course: CourseRef, entry: WaitlistEntry, reason: RemovalReason,
  suffix = ""): void {
  queueCourseNotification(tx, `${course.id}_${entry.sessionId}_${entry.requestId}${suffix}`, "waitlist_removed",
    entry.userId, course, undefined, reason);
}

/**
 * Closes the whole waitlist of one lesson (cancelled, rescheduled, archived, window closed). Reads now; the returned
 * writer deletes every entry, zeroes the counter and tells each customer. An empty list under a zero counter writes
 * nothing; an empty list under a stale non-zero counter (a ghost) only zeroes it.
 */
export async function clearWaitlistInTx(tx: Transaction, course: CourseRef, sessionId: string,
  reason: "lesson_cancelled" | "rescheduled" | "archived" | "window_closed"): Promise<() => void> {
  const sessionRef = db.doc(`courses/${course.id}/sessions/${sessionId}`);
  const [sessionDoc, list] = await Promise.all([
    tx.get(sessionRef), tx.get(listOf(course.id, sessionId).orderBy("position").limit(WAITLIST_MAX))]);
  const entries = list.docs;
  if (!entries.length) {
    const ghost = sessionDoc.exists && ((sessionDoc.data() as Session).waitlisted ?? 0) !== 0;
    return ghost ? () => tx.update(sessionRef, { waitlisted: 0 }) : () => undefined;
  }
  return () => {
    for (const doc of entries) {
      tx.delete(doc.ref);
      queueCleared(tx, course, doc.data() as WaitlistEntry, reason);
    }
    tx.update(sessionRef, { waitlisted: 0 });
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
  const sessionRef = db.doc(`courses/${course.id}/sessions/${sessionId}`);
  // The session was read by the caller in this transaction, so a recount written as an absolute value cannot lose a
  // concurrent join or leave (those write the session and would have conflicted). A full page is not a recount: the
  // list may hold more than the page.
  const exact = entries.length < WAITLIST_MAX;
  const drifted = exact && (session.waitlisted ?? 0) !== entries.length;
  if (!entries.length) {
    // A ghost counter (> 0, nothing behind it) is repaired here: nothing else would ever look at it again.
    return drifted ? { writers: [() => tx.update(sessionRef, { waitlisted: 0 })], promoted: [], dropped: [],
      cleared: false, cost: 1, enrollmentIds: [] } : null;
  }
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
      let dropReason: RemovalReason = "request_reused";
      if (entry.data.paymentMode === "stripe" && !checkoutOn) {
        outcome = "drop";
        dropReason = "payment_unavailable";
      // One request id can sit on several lessons; the first promotion consumes it (the enrollment id derives from it).
      } else if (args.taken.has(enrollmentId) || plan.enrollmentIds.includes(enrollmentId)) outcome = "drop";
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
            // The customer hears once: a confirmed seat (the booking's own "accepted" is skipped for promotions)
            // or a 30 minute hold to pay.
            const event = result.state === "confirmed" ? "waitlist_promoted" : "waitlist_promoted_hold";
            notify.push(() => queueCourseNotification(tx, enrollmentId, event, uid, course, startsAt));
          }
        } catch (error) {
          const refusal = classifyRefusal(error);
          outcome = refusal === "stop" ? "stop" : "drop";
          if (refusal !== "stop") dropReason = refusal;
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
        notify.push(() => queueRemoved(tx, course, entry.data, dropReason));
        plan.cost += 1;
      }
    }
  }
  if (!removed.size) {
    return drifted ? { ...plan, writers: [() => tx.update(sessionRef, { waitlisted: entries.length })] } : null;
  }
  const kept = renumber(entries.map((e) => ({ id: e.id, position: e.data.position })), [...removed]);
  const current = new Map(entries.map((e) => [e.id, e.data.position]));
  const moves = kept.filter(({ id, position }) => current.get(id) !== position);
  plan.cost += moves.length;
  plan.writers.push(...writers, () => {
    for (const id of removed) tx.delete(listOf(course.id, sessionId).doc(id));
    for (const { id, position } of moves) tx.update(listOf(course.id, sessionId).doc(id), { position });
    tx.update(sessionRef, {
      waitlisted: drifted ? entries.length - removed.size : FieldValue.increment(-removed.size),
    });
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
  // Also read the list of every given lesson that has no freed seat or a zero counter, and fix a counter that
  // disagrees with its entries. The sweep and promoteWaitlist set it; a release trusts the stored counter instead.
  reconcile?: boolean;
}): Promise<PromotionPlan> {
  const { course, sessions, freed } = args;
  const plan: PromotionPlan = { apply: () => undefined, promoted: [], cleared: [], dropped: [] };
  if (course.state !== "published" || course.enrollmentClosed) return plan;
  const seatsOf = new Map<string, FreedSeat[]>();
  for (const seat of freed) {
    const session = sessions.get(seat.sessionId);
    // The stored counter decides whether there is anything to read; joins write the session, so a racing join
    // conflicts with the caller's transaction.
    if (session?.state !== "scheduled" || (!args.reconcile && (session.waitlisted ?? 0) < 1)) continue;
    seatsOf.set(seat.sessionId, [...(seatsOf.get(seat.sessionId) ?? []), seat]);
  }
  if (args.reconcile) {
    for (const [sessionId, session] of sessions) {
      if (session.state === "scheduled" && !seatsOf.has(sessionId)) seatsOf.set(sessionId, []);
    }
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

// ---------------------------------------------------------------------------------------------------------------
// Standalone promotion (D6): seats that were free before anyone looked (capacity raised, lessons D5 skipped, a venue
// that came back). Used by the capacity increase and by the maintenance sweep.
// ---------------------------------------------------------------------------------------------------------------

const MAX_PROMOTION_ROUNDS = 50;

/**
 * Fills the free seats of one lesson from its waitlist, one single-seat transaction at a time, and returns how many
 * customers were seated. Replays are inert: a seated customer leaves the list, so a second call finds nothing to do.
 * A round that dropped unpromotable entries counts as progress (the next entries have not been examined yet); a
 * round that only meets a lesson-level refusal (venue off, deadline) ends the loop and keeps the entries.
 *
 * The stored counter is not trusted: the list is read every round, so a ghost counter (> 0, no entries) is zeroed and
 * an under-count (entries behind a zero counter) is served and recounted. `opts.checkoutOn` lets a caller that serves
 * many lessons read the payment settings once.
 */
export async function promoteWaitlist(courseId: string, sessionId: string,
  opts: { checkoutOn?: boolean } = {}): Promise<number> {
  const checkoutOn = opts.checkoutOn ?? checkoutActive(await readPaymentSettings());
  const courseRef = db.doc(`courses/${courseId}`);
  const sessionRef = courseRef.collection("sessions").doc(sessionId);
  let promoted = 0;
  for (let round = 0; round < MAX_PROMOTION_ROUNDS; round++) {
    const outcome = await db.runTransaction(async (tx) => {
      const [courseDoc, sessionDoc] = await tx.getAll(courseRef, sessionRef);
      const course = courseDoc.data() as Course | undefined;
      const session = sessionDoc.data() as Session | undefined;
      if (!course || !session || session.state !== "scheduled") return { seated: 0, progress: false };
      const free = session.capacity - session.occupied - session.held >= 1;
      const plan = await planPromotions(tx, { course: { ...course, id: courseId },
        sessions: new Map([[sessionId, session]]), freed: free ? [{ sessionId, kind: "free" }] : [], checkoutOn,
        now: new Date(), reconcile: true });
      plan.apply();
      return { seated: plan.promoted.length,
        progress: plan.promoted.length + plan.dropped.length + plan.cleared.length > 0 };
    });
    promoted += outcome.seated;
    if (!outcome.progress) break;
  }
  return promoted;
}

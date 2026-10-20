import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import { readPaymentSettings } from "../payments/paymentSettingsCallables";
import { checkoutActive } from "./core";
import {
  db, safeId, uidOf, nowStamp, domainError, providerUsable, UNLIST_LIMIT, Enrollment, Course, Session,
} from "./store";
import { canManageCourse, type Authority } from "./authority";
import { queueCourseNotification } from "./notifications";
import { planPromotions, clearWaitlistInTx, removeFromWaitlist, promoteWaitlist } from "./waitlist";
import { slotsOf, diffSlots, updateScheduleLocks } from "./locks";

// Authority is resolved once by the caller (R13); release never looks it up again.
export type ReleaseActor =
  { kind: "system" } | { kind: "customer"; uid: string } | { kind: "manager"; authority: Authority };

export async function releaseActorFor(uid: string, enrollment: Pick<Enrollment, "userId" | "courseId">):
  Promise<ReleaseActor> {
  if (uid === enrollment.userId) return { kind: "customer", uid };
  const course = (await db.doc(`courses/${enrollment.courseId}`).get()).data() as Course | undefined;
  if (!course) throw new HttpsError("not-found", "course_not_found");
  return { kind: "manager", authority: await canManageCourse(uid, course) };
}

export async function releaseEnrollment(
  enrollmentId: string, actor: ReleaseActor, selected?: string[], reason = "", expired = false,
  opts: { markLate?: boolean } = {}
): Promise<void> {
  // Read once, outside the transaction: promoted Stripe entries are only held while checkout is on.
  const checkoutOn = checkoutActive(await readPaymentSettings());
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`courseEnrollments/${enrollmentId}`);
    const enrollment = (await tx.get(ref)).data() as Enrollment | undefined;
    if (!enrollment) throw new HttpsError("not-found", "enrollment_not_found");
    if (actor.kind === "customer" && actor.uid !== enrollment.userId) {
      throw new HttpsError("permission-denied", "course_owner_required");
    }
    if (expired && (enrollment.state !== "held" || enrollment.holdExpiresAt.toMillis() > Date.now())) return;
    if (!["confirmed", "held"].includes(enrollment.state)) return;
    const ids = enrollment.state === "held" ? enrollment.activeSessionIds : selected ?? enrollment.activeSessionIds;
    if (ids.some((id) => !enrollment.sessionIds.includes(id))) throw new Error("session_not_in_enrollment");
    const active = [...new Set(ids)].filter((id) => enrollment.activeSessionIds.includes(id));
    if (!active.length) return;
    const sessions = await tx.getAll(...active.map((id) => db.doc(`courses/${enrollment.courseId}/sessions/${id}`)));
    const isCustomer = actor.kind === "customer";
    if (isCustomer && !expired && enrollment.state === "confirmed" && sessions.some((doc) =>
      (doc.data() as Session).startsAt.toMillis() <= Date.now() + enrollment.cancellationHours * 3600000)) {
      throw new Error("cancellation_deadline");
    }
    if (actor.kind === "manager" && sessions.some((doc) => (doc.data() as Session).startsAt.toMillis() <= Date.now())) {
      throw new Error("cannot_cancel_past_lesson");
    }
    const courseRef = db.doc(`courses/${enrollment.courseId}`);
    const course = (await tx.get(courseRef)).data() as Course;
    // A staff removal after the customer's own deadline is recorded against the customer (no fee, R20). Only a paid-up
    // seat counts: an unpaid Stripe hold was never the customer's commitment.
    const late = opts.markLate && !expired && enrollment.state === "confirmed" ?
      sessions.filter((doc) => (doc.data() as Session).startsAt.toMillis() <=
        Date.now() + enrollment.cancellationHours * 3600000).map((doc) => doc.id) : [];
    // The freed seats go to the waitlist inside this transaction. The planner only reads, so it runs before the first
    // write; its writes follow ours and compose with them (every seat counter below is an increment).
    const promotion = await planPromotions(tx, { course: { ...course, id: enrollment.courseId },
      sessions: new Map(sessions.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data() as Session])),
      freed: active.map((sessionId) => ({ sessionId, kind: enrollment.state === "held" ? "held" : "occupied" })),
      checkoutOn, now: new Date() });
    if (active.includes(course.nextSessionId)) {
      tx.update(courseRef, { nextAvailableSeats: FieldValue.increment(1) });
    }
    const refund = enrollment.paymentStatus === "paid" ?
      active.reduce((sum, id) => sum + enrollment.allocations[id], 0) : 0;
    const remaining = enrollment.activeSessionIds.filter((id) => !active.includes(id));
    tx.update(ref, { activeSessionIds: remaining,
      cancelledSessionIds: [...enrollment.cancelledSessionIds, ...active],
      state: remaining.length ? enrollment.state : expired ? "expired" : "cancelled",
      refundCents: enrollment.refundCents + refund,
      ...(late.length ? { lateCancelledSessionIds: FieldValue.arrayUnion(...late) } : {}),
      ...(enrollment.paymentMode === "stripe" ? {
        providerAmountOwedCents: Math.max(0, (enrollment.providerAmountOwedCents ?? 0) - refund),
      } : {}), updatedAt: nowStamp(), cancellationReason: reason });
    sessions.forEach((doc) => {
      const s = doc.data() as Session;
      const field = enrollment.state === "held" ? "held" : "occupied";
      if (s[field] < 1) throw new Error("seat_counter_inconsistent");
      tx.update(doc.ref, { [field]: FieldValue.increment(-1) });
      tx.delete(doc.ref.collection("participants").doc(enrollment.userId));
      if (refund && enrollment.allocations[doc.id] > 0) {
        tx.set(db.doc(`courseRefunds/${enrollmentId}_${doc.id}`), {
          enrollmentId, providerId: enrollment.providerId, userId: enrollment.userId,
          courseId: enrollment.courseId, venueId: enrollment.venueId ?? null, sessionId: doc.id,
          amountCents: enrollment.allocations[doc.id], paymentMode: enrollment.paymentMode,
          paymentIntentId: enrollment.stripePaymentIntentId ?? null, status: "pending", createdAt: nowStamp(),
        });
      }
    });
    if (late.length) {
      tx.set(db.doc(`courses/${enrollment.courseId}/customers/${enrollment.userId}`),
        { userId: enrollment.userId, lateCancels: FieldValue.increment(late.length) }, { merge: true });
    }
    if (!expired) {
      queueCourseNotification(tx, `${enrollmentId}_${active.join("_")}`,
        isCustomer ? "cancelled_by_client" : "cancelled_by_trainer", enrollment.userId,
        { name: enrollment.courseName }, undefined, reason);
    }
    promotion.apply();
  });
}

export const cancelCourseEnrollment = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  try {
    const selected = req.data.sessionIds;
    if (selected !== undefined && (!Array.isArray(selected) || !selected.length)) {
      throw new Error("invalid_sessions");
    }
    const enrollmentId = safeId(req.data.enrollmentId);
    const enrollment = (await db.doc(`courseEnrollments/${enrollmentId}`).get()).data() as Enrollment | undefined;
    if (!enrollment) throw new HttpsError("not-found", "enrollment_not_found");
    await releaseEnrollment(enrollmentId, await releaseActorFor(uid, enrollment), selected?.map(safeId),
      String(req.data.reason ?? "").slice(0, 500));
    return { success: true };
  } catch (error) {
    return domainError(error);
  }
});

export const recordCoursePayment = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  const id = safeId(req.data.enrollmentId);
  const method = req.data.method;
  if (!["cash", "satispay", "bank_transfer", "other"].includes(method)) {
    throw new HttpsError("invalid-argument", "invalid_payment_method");
  }
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`courseEnrollments/${id}`);
    const e = (await tx.get(ref)).data() as Enrollment | undefined;
    if (!e) throw new HttpsError("not-found", "enrollment_not_found");
    const course = (await tx.get(db.doc(`courses/${e.courseId}`))).data() as Course | undefined;
    if (!course) throw new HttpsError("not-found", "course_not_found");
    await canManageCourse(uid, course, tx);
    if (e.paymentMode !== "direct" || e.state !== "confirmed") {
      throw new HttpsError("failed-precondition", "direct_confirmed_enrollment_required");
    }
    if (e.paymentStatus === "paid") return;
    const activeAmount = e.activeSessionIds.reduce((sum, s) => sum + e.allocations[s], 0);
    tx.update(ref, { paymentStatus: "paid", paidCents: activeAmount, paymentMethod: method,
      paidAt: nowStamp(), paidBy: uid, updatedAt: nowStamp() });
    queueCourseNotification(tx, id, "payment_confirmed", e.userId, { name: e.courseName });
  });
  return { success: true };
});

type SessionAction = {
  uid: string; courseId: string; sessionId: string; data: Record<string, unknown>; course: Course;
  manager: Extract<ReleaseActor, { kind: "manager" }>;
};
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const sessionPath = (courseId: string, sessionId: string) => `courses/${courseId}/sessions/${sessionId}`;

/**
 * Moves the lock slots from one state of a course to the next, in the caller's transaction. Slots are derived from the
 * stored sessions and from the sessions as they will be, so a published course whose last lesson is cancelled (and
 * therefore archived) releases everything, and a single moved lesson releases only its own old slot. Throws
 * room_overlap / instructor_overlap before it writes anything; call it after the last transaction read.
 */
async function relock(tx: Transaction, courseId: string,
  before: { course: Pick<Course, "state" | "name">; sessions: { id: string; data: Session }[] },
  after: { course: Pick<Course, "state" | "name">; sessions: { id: string; data: Session }[] }): Promise<void> {
  const { remove, add } = diffSlots(slotsOf(courseId, before.course, before.sessions),
    slotsOf(courseId, after.course, after.sessions, new Date()));
  await updateScheduleLocks(tx, remove, add);
}

async function cancelOrReschedule(a: SessionAction, action: "cancel" | "reschedule"): Promise<Date | null> {
  const { courseId, sessionId, data } = a;
  const reason = text(data.reason);
  if (!reason) throw new Error("reason_required");
  // Removing one customer is its own action: a stray customer id must never turn into a lesson cancellation.
  if (data.userId !== undefined) throw new Error("invalid_session_action");
  const courseRef = db.doc(`courses/${courseId}`);
  const ref = db.doc(sessionPath(courseId, sessionId));
  const requested = action === "reschedule" ? new Date(String(data.startsAt)) : null;
  await db.runTransaction(async (tx) => {
    const [courseDoc, sessionDoc] = await tx.getAll(courseRef, ref);
    const course = courseDoc.data() as Course | undefined;
    if (!course) throw new HttpsError("not-found", "course_not_found");
    const s = sessionDoc.data() as Session | undefined;
    if (!s) throw new Error("session_not_found");
    if (s.startsAt.toMillis() <= Date.now()) throw new Error("cannot_change_past_lesson");
    // Already cancelled: nothing to release or clear (the caller still finishes the participants' reconciliation).
    if (action === "cancel" && s.state === "cancelled") return;
    let place: Partial<Session> = {};
    let moved: Pick<Session, "startsAt" | "endsAt"> | null = null;
    if (action === "reschedule") {
      if (s.state !== "scheduled" || s.held > 0) throw new Error("session_unavailable");
      if (!requested || !Number.isFinite(requested.getTime()) ||
        requested.getTime() <= Date.now() + course.bookingNoticeHours * 3600000) throw new Error("invalid_start_time");
      moved = { startsAt: Timestamp.fromDate(requested),
        endsAt: Timestamp.fromMillis(requested.getTime() + course.durationMinutes * 60000) };
      // The room only means something for a venue course; an unlinked course ignores it.
      const roomId = course.venueId && data.roomId != null ? safeId(data.roomId) : null;
      if (roomId && roomId !== (s.roomId ?? null)) {
        const locationId = s.locationId ?? course.locationId;
        if (!locationId) throw new HttpsError("invalid-argument", "invalid_space");
        const [room, location] = await tx.getAll(
          db.doc(`venues/${course.venueId}/locations/${locationId}/rooms/${roomId}`),
          db.doc(`venues/${course.venueId}/locations/${locationId}`));
        if (room.data()?.isActive !== true || !location.exists) {
          throw new HttpsError("invalid-argument", "invalid_space");
        }
        place = { roomId, locationId, venueId: course.venueId,
          location: `${room.data()!.name} · ${location.data()!.name}` };
      }
    }
    // A repeated request changes nothing (the participants are told again by the caller; their notice ids repeat).
    if (moved && moved.startsAt.toMillis() === s.startsAt.toMillis() && !Object.keys(place).length) return;
    const allSessions = await tx.get(courseRef.collection("sessions"));
    const stored = allSessions.docs.map((doc) => ({ id: doc.id, data: doc.data() as Session }));
    const changed: Session = action === "cancel" ? { ...s, state: "cancelled" } : { ...s, ...moved!, ...place };
    const actual = stored.map((x) => x.id === sessionId ? { ...changed, id: x.id } : { ...x.data, id: x.id })
      .sort((x, y) => x.startsAt.toMillis() - y.startsAt.toMillis());
    const next = actual.find((x) => x.state === "scheduled" && x.startsAt.toMillis() > Date.now());
    const metadata = { firstStartsAt: actual[0].startsAt,
      ...(next ? { nextStartsAt: next.startsAt, nextSessionId: next.id,
        nextAvailableSeats: next.capacity - next.occupied - next.held } :
        { enrollmentClosed: true, state: "archived" as const }) };
    // The waitlist is read now (a writer comes back); the locks are read and written last among the reads. Only the
    // changed lesson's slot moves (as in substituteInstructor), so no other lesson's lock day is read; the whole
    // course is diffed only when this was its last lesson and it is archived below, which gives every slot back.
    const archiving = !next;
    const clearWaitlist = await clearWaitlistInTx(tx, { ...course, id: courseId }, sessionId,
      action === "cancel" ? "lesson_cancelled" : "rescheduled");
    const scope = archiving ? stored : [{ id: sessionId, data: s }];
    await relock(tx, courseId, { course, sessions: scope }, { course: { ...course, ...metadata },
      sessions: scope.map((x) => ({ id: x.id, data: x.id === sessionId ? changed : x.data })) });
    if (action === "cancel") {
      tx.update(ref, { state: "cancelled", listed: false, cancellationReconciled: false, cancellationReason: reason });
    } else {
      tx.update(ref, { ...moved!, ...place, rescheduleReason: reason, revision: FieldValue.increment(1) });
    }
    tx.update(courseRef, metadata);
    // An archived course is not listed: the lessons it keeps (done, or under way) leave the public timetable with it.
    if (archiving) {
      stored.filter((x) => x.id !== sessionId && x.data.listed !== false).slice(0, UNLIST_LIMIT)
        .forEach((x) => tx.update(courseRef.collection("sessions").doc(x.id), { listed: false }));
    }
    clearWaitlist();
  });
  return requested;
}

/**
 * Gives one lesson to another instructor. Existing enrollments keep the price they were booked at; the lesson's
 * revision moves so a customer who reviewed the old quote sees the change. The instructor's day lock moves in the
 * same transaction (instructor_overlap before any write); the room slot is rewritten unchanged.
 */
async function substituteInstructor(a: SessionAction): Promise<void> {
  const { courseId, sessionId, data } = a;
  const instructorId = safeId(data.instructorId);
  const reason = text(data.reason);
  const courseRef = db.doc(`courses/${courseId}`);
  const ref = db.doc(sessionPath(courseId, sessionId));
  await db.runTransaction(async (tx) => {
    const [courseDoc, sessionDoc] = await tx.getAll(courseRef, ref);
    const course = courseDoc.data() as Course | undefined;
    if (!course) throw new HttpsError("not-found", "course_not_found");
    const s = sessionDoc.data() as Session | undefined;
    if (!s) throw new Error("session_not_found");
    if (s.state !== "scheduled") throw new Error("session_unavailable");
    if (s.startsAt.toMillis() <= Date.now()) throw new Error("cannot_change_past_lesson");
    if (instructorId === (s.instructorId ?? course.instructorId ?? null)) {
      throw new HttpsError("invalid-argument", "invalid_instructor");
    }
    // As when a course is saved: an unlinked course may only name its own provider (an admin may name anyone).
    if (!course.venueId && instructorId !== course.providerId && a.manager.authority.via !== "admin") {
      throw new HttpsError("permission-denied", "course_instructor_not_allowed");
    }
    const [instructor, link] = await tx.getAll(db.doc(`instructors/${instructorId}`),
      db.doc(`venues/${course.venueId ?? "none"}/instructors/${instructorId}`));
    if (!providerUsable(instructor.data()) || (course.venueId && link.data()?.isActive !== true)) {
      throw new HttpsError("invalid-argument", "invalid_instructor");
    }
    const name = instructor.data()!.fullName || instructor.data()!.name || link.data()?.name || s.instructor;
    const participants = await tx.get(ref.collection("participants"));
    const stored = [{ id: sessionId, data: s }];
    await relock(tx, courseId, { course, sessions: stored }, { course, sessions: [{ id: sessionId,
      data: { ...s, instructorId, instructorName: name, instructor: name } }] });
    const revision = (s.revision ?? 1) + 1;
    tx.update(ref, { instructorId, instructorName: name, instructor: name, revision: FieldValue.increment(1) });
    for (const p of participants.docs) {
      queueCourseNotification(tx, `${p.data().enrollmentId}_${sessionId}_r${revision}`, "instructor_changed", p.id,
        course, s.startsAt.toDate(), reason);
    }
  });
}

/**
 * Sets one lesson's capacity. The lesson's revision moves so a quote reviewed against the old number is re-reviewed.
 * Seats that opened up are offered to the waitlist after the commit (promotion runs its own transactions); a failure
 * there is logged, never thrown: the capacity is already saved and the maintenance sweep serves the waitlist later.
 */
async function changeCapacity(a: SessionAction): Promise<void> {
  const { courseId, sessionId, data } = a;
  const capacity = data.capacity;
  if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    throw new Error("invalid_capacity");
  }
  const courseRef = db.doc(`courses/${courseId}`);
  const ref = db.doc(sessionPath(courseId, sessionId));
  await db.runTransaction(async (tx) => {
    const [courseDoc, sessionDoc] = await tx.getAll(courseRef, ref);
    const course = courseDoc.data() as Course | undefined;
    if (!course) throw new HttpsError("not-found", "course_not_found");
    const s = sessionDoc.data() as Session | undefined;
    if (!s) throw new Error("session_not_found");
    if (s.state !== "scheduled") throw new Error("session_unavailable");
    if (s.startsAt.toMillis() <= Date.now()) throw new Error("cannot_change_past_lesson");
    if (capacity < s.occupied + s.held) throw new Error("capacity_below_bookings");
    if (capacity === (s.capacity ?? course.capacity)) return;
    tx.update(ref, { capacity, revision: FieldValue.increment(1) });
    if (course.nextSessionId === sessionId) {
      tx.update(courseRef, { nextAvailableSeats: capacity - s.occupied - s.held });
    }
  });
  try {
    await promoteWaitlist(courseId, sessionId);
  } catch (error) {
    logger.error("waitlist promotion after a capacity change failed", { courseId, sessionId, error: String(error) });
  }
}

export const manageCourseSession = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  const courseId = safeId(req.data.courseId);
  const sessionId = safeId(req.data.sessionId);
  const action = req.data.action;
  try {
    const course = (await db.doc(`courses/${courseId}`).get()).data() as Course | undefined;
    if (!course) throw new HttpsError("not-found", "course_not_found");
    const authority = await canManageCourse(uid, course);
    const manager = { kind: "manager", authority } as const;
    const a: SessionAction = { uid, courseId, sessionId, data: req.data, course, manager };
    const ref = db.doc(sessionPath(courseId, sessionId));
    if (action === "attendance") {
      const userId = safeId(req.data.userId);
      if (!["present", "absent", "unmarked"].includes(req.data.attendance)) throw new Error("invalid_attendance");
      await db.runTransaction(async (tx) => {
        const participant = ref.collection("participants").doc(userId);
        const [s, p] = await Promise.all([tx.get(ref), tx.get(participant)]);
        if (!p.exists || p.data()?.state !== "confirmed" || !s.exists ||
          s.data()?.state === "cancelled" || s.data()?.startsAt.toMillis() > Date.now()) {
          throw new Error("attendance_unavailable");
        }
        // "absent" is the no-show; the per-customer counter follows the transitions, so marking twice counts once.
        const absent = req.data.attendance === "absent";
        const wasAbsent = p.data()?.noShow === true;
        tx.update(participant, { attendance: req.data.attendance, noShow: absent, markedAt: nowStamp(),
          markedBy: uid });
        if (absent !== wasAbsent) {
          tx.set(db.doc(`courses/${courseId}/customers/${userId}`),
            { userId, noShows: FieldValue.increment(absent ? 1 : -1) }, { merge: true });
        }
      });
    } else if (action === "cancel" || action === "reschedule") {
      const startsAt = await cancelOrReschedule(a, action);
      const reason = text(req.data.reason);
      // Mark unavailable before processing participants: concurrent enrollments see cancellation immediately.
      const participants = await ref.collection("participants").get();
      for (const p of participants.docs) {
        if (action === "cancel") await releaseEnrollment(p.data().enrollmentId, manager, [sessionId], reason);
        else {
          const batch = db.batch();
          // Batch shares the notification setter API with transactions.
          queueCourseNotification(batch,
            `${p.data().enrollmentId}_${sessionId}_${startsAt!.getTime()}`,
            "rescheduled", p.id, course, startsAt!, reason);
          await batch.commit();
        }
      }
      if (action === "cancel") await ref.update({ cancellationReconciled: true });
    } else if (action === "removeParticipant") {
      const userId = safeId(req.data.userId);
      const participant = (await ref.collection("participants").doc(userId).get()).data();
      if (!participant) throw new HttpsError("not-found", "participant_not_found");
      // The seat is released through the same path as a customer cancellation: refund, notice and waitlist promotion.
      await releaseEnrollment(participant.enrollmentId, manager, [sessionId], text(req.data.reason), false,
        { markLate: true });
    } else if (action === "removeWaitlistEntry") {
      await removeFromWaitlist(courseId, sessionId, safeId(req.data.userId), { notifyRemoved: true });
    } else if (action === "capacity") {
      await changeCapacity(a);
    } else if (action === "substitute") {
      await substituteInstructor(a);
    } else throw new Error("invalid_session_action");
    return { success: true };
  } catch (error) {
    return domainError(error);
  }
});

export const confirmCourseRefund = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  const ref = db.doc(`courseRefunds/${safeId(req.data.refundId)}`);
  await db.runTransaction(async (tx) => {
    const refund = (await tx.get(ref)).data();
    if (!refund) throw new HttpsError("not-found", "refund_not_found");
    // Refunds written before venue courses carry no courseId (R14).
    const courseId = refund.courseId ?? ((await tx.get(db.doc(`courseEnrollments/${refund.enrollmentId}`)))
      .data() as Enrollment | undefined)?.courseId;
    if (!courseId) throw new HttpsError("not-found", "enrollment_not_found");
    const course = (await tx.get(db.doc(`courses/${courseId}`))).data() as Course | undefined;
    if (!course) throw new HttpsError("not-found", "course_not_found");
    await canManageCourse(uid, course, tx);
    if (refund.paymentMode !== "direct") throw new HttpsError("failed-precondition", "direct_refund_required");
    tx.update(ref, { status: "completed", confirmedAt: nowStamp(), confirmedBy: uid });
  });
  return { success: true };
});

export const cancelRemainingCourse = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  const courseId = safeId(req.data.courseId);
  const reason = String(req.data.reason ?? "").trim().slice(0, 500);
  if (!reason) throw new HttpsError("invalid-argument", "reason_required");
  const ref = db.doc(`courses/${courseId}`);
  await db.runTransaction(async (tx) => {
    const course = (await tx.get(ref)).data() as Course | undefined;
    if (!course) throw new HttpsError("not-found", "course_not_found");
    await canManageCourse(uid, course, tx);
    const sessions = await tx.get(ref.collection("sessions"));
    const future = sessions.docs.filter((d) => d.data().state !== "cancelled" &&
      d.data().startsAt.toMillis() > Date.now());
    // Every waiting customer is told; reads first, writers after the last read.
    const clears = await Promise.all(future.filter((d) => (d.data().waitlisted ?? 0) > 0)
      .map((d) => clearWaitlistInTx(tx, { ...course, id: courseId }, d.id, "lesson_cancelled")));
    // The course is archived, so every slot it holds (including a lesson in progress) goes back.
    const stored = sessions.docs.map((d) => ({ id: d.id, data: d.data() as Session }));
    await relock(tx, courseId, { course, sessions: stored },
      { course: { ...course, state: "archived" }, sessions: stored });
    tx.update(ref, { enrollmentClosed: true, state: "archived", updatedAt: nowStamp() });
    future.forEach((d) => {
      tx.update(d.ref, { state: "cancelled", listed: false, cancellationReconciled: false,
        cancellationReason: reason });
    });
    // The course is archived, so the lessons that stay as they are (done, or under way) are unlisted with it.
    const futureIds = new Set(future.map((d) => d.id));
    sessions.docs.filter((d) => !futureIds.has(d.id) && d.data().listed !== false).slice(0, UNLIST_LIMIT)
      .forEach((d) => tx.update(d.ref, { listed: false }));
    clears.forEach((clear) => clear());
  });
  const sessions = await ref.collection("sessions").where("state", "==", "cancelled").get();
  for (const s of sessions.docs) {
    const participants = await s.ref.collection("participants").get();
    for (const p of participants.docs) {
      await releaseEnrollment(p.data().enrollmentId, { kind: "system" }, [s.id], reason);
    }
    await s.ref.update({ cancellationReconciled: true });
  }
  return { success: true };
});

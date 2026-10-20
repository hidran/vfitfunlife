import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import { db, safeId, uidOf, nowStamp, domainError, Enrollment, Course, Session } from "./store";
import { canManageCourse, type Authority } from "./authority";
import { queueCourseNotification } from "./notifications";

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
  enrollmentId: string, actor: ReleaseActor, selected?: string[], reason = "", expired = false
): Promise<void> {
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
    if (active.includes(course.nextSessionId)) {
      tx.update(courseRef, { nextAvailableSeats: course.nextAvailableSeats + 1 });
    }
    const refund = enrollment.paymentStatus === "paid" ?
      active.reduce((sum, id) => sum + enrollment.allocations[id], 0) : 0;
    const remaining = enrollment.activeSessionIds.filter((id) => !active.includes(id));
    tx.update(ref, { activeSessionIds: remaining,
      cancelledSessionIds: [...enrollment.cancelledSessionIds, ...active],
      state: remaining.length ? enrollment.state : expired ? "expired" : "cancelled",
      refundCents: enrollment.refundCents + refund,
      ...(enrollment.paymentMode === "stripe" ? {
        providerAmountOwedCents: Math.max(0, (enrollment.providerAmountOwedCents ?? 0) - refund),
      } : {}), updatedAt: nowStamp(), cancellationReason: reason });
    sessions.forEach((doc) => {
      const s = doc.data() as Session;
      const field = enrollment.state === "held" ? "held" : "occupied";
      if (s[field] < 1) throw new Error("seat_counter_inconsistent");
      tx.update(doc.ref, { [field]: s[field] - 1 });
      tx.delete(doc.ref.collection("participants").doc(enrollment.userId));
      if (refund && enrollment.allocations[doc.id] > 0) {
        tx.set(db.doc(`courseRefunds/${enrollmentId}_${doc.id}`), {
          enrollmentId, providerId: enrollment.providerId, userId: enrollment.userId,
          sessionId: doc.id, amountCents: enrollment.allocations[doc.id], paymentMode: enrollment.paymentMode,
          paymentIntentId: enrollment.stripePaymentIntentId ?? null, status: "pending", createdAt: nowStamp(),
        });
      }
    });
    if (!expired) {
      queueCourseNotification(tx, `${enrollmentId}_${active.join("_")}`,
        isCustomer ? "cancelled_by_client" : "cancelled_by_trainer", enrollment.userId,
        { name: enrollment.courseName }, undefined, reason);
    }
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

export const manageCourseSession = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  const courseId = safeId(req.data.courseId);
  const sessionId = safeId(req.data.sessionId);
  const action = req.data.action;
  try {
    const course = (await db.doc(`courses/${courseId}`).get()).data() as Course | undefined;
    if (!course) throw new HttpsError("not-found", "course_not_found");
    const manager: ReleaseActor = { kind: "manager", authority: await canManageCourse(uid, course) };
    const ref = db.doc(`courses/${courseId}/sessions/${sessionId}`);
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
        tx.update(participant, { attendance: req.data.attendance, markedAt: nowStamp(), markedBy: uid });
      });
    } else if (action === "cancel" || action === "reschedule") {
      const reason = String(req.data.reason ?? "").trim().slice(0, 500);
      if (!reason) throw new Error("reason_required");
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(ref)).data() as Session | undefined;
        if (!s) throw new Error("session_not_found");
        if (s.startsAt.toMillis() <= Date.now()) throw new Error("cannot_change_past_lesson");
        const courseRef = db.doc(`courses/${courseId}`);
        const allSessions = await tx.get(courseRef.collection("sessions"));
        const actual = allSessions.docs.map((doc) => {
          const data = doc.data() as Session;
          return { ...data, id: doc.id, state: doc.id === sessionId && action === "cancel" ? "cancelled" : data.state,
            startsAt: doc.id === sessionId && action === "reschedule" ?
              Timestamp.fromDate(new Date(req.data.startsAt)) : data.startsAt };
        }).sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis());
        const next = actual.find((s) => s.state === "scheduled" && s.startsAt.toMillis() > Date.now());
        const metadata = { firstStartsAt: actual[0].startsAt,
          ...(next ? { nextStartsAt: next.startsAt, nextSessionId: next.id,
            nextAvailableSeats: next.capacity - next.occupied - next.held } :
            { enrollmentClosed: true, state: "archived" }) };
        if (action === "cancel") {
          tx.update(ref, {
            state: "cancelled", cancellationReconciled: false, cancellationReason: reason,
          });
        } else {
          if (s.state !== "scheduled" || s.held > 0) throw new Error("session_unavailable");
          const starts = new Date(req.data.startsAt);
          if (!Number.isFinite(starts.getTime()) ||
            starts.getTime() <= Date.now() + course.bookingNoticeHours * 3600000) {
            throw new Error("invalid_start_time");
          }
          tx.update(ref, { startsAt: Timestamp.fromDate(starts),
            endsAt: Timestamp.fromMillis(starts.getTime() + course.durationMinutes * 60000),
            rescheduleReason: reason });
        }
        tx.update(courseRef, metadata);
      });
      // Mark unavailable before processing participants: concurrent enrollments see cancellation immediately.
      const participants = await ref.collection("participants").get();
      for (const p of participants.docs) {
        if (action === "cancel") await releaseEnrollment(p.data().enrollmentId, manager, [sessionId], reason);
        else {
          const batch = db.batch();
          const startsAt = new Date(req.data.startsAt);
          // Batch shares the notification setter API with transactions.
          queueCourseNotification(batch,
            `${p.data().enrollmentId}_${sessionId}_${startsAt.getTime()}`,
            "rescheduled", p.id, course, startsAt, reason);
          await batch.commit();
        }
      }
      if (action === "cancel") await ref.update({ cancellationReconciled: true });
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
    tx.update(ref, { enrollmentClosed: true, state: "archived", updatedAt: nowStamp() });
    sessions.docs.filter((d) => d.data().startsAt.toMillis() > Date.now()).forEach((d) => {
      tx.update(d.ref, { state: "cancelled", cancellationReconciled: false, cancellationReason: reason });
    });
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

import { createHash } from "crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { allocatePrice, assertReservable } from "./core";
import { db, safeId, eligibleProvider, nowStamp, Course, Session, Enrollment } from "./store";
import { canManageCourse } from "./authority";
import { rosterClientId } from "../bookings/clientRosterCore";
import { queueCourseNotification } from "./notifications";

export type EnrollInput = {
  actor: string; uid: string; courseId: string; scope: "lesson" | "series"; sessionId?: string;
  paymentMode: "direct" | "stripe"; requestId: string; byProvider: boolean;
  expectedFinalCents?: number; expectedRevisions?: Record<string, number>; skipPriceCheck?: boolean;
  // Seats the caller frees in the same transaction; they count as free for the capacity check only.
  released?: Record<string, { occupied: number; held: number }>;
  promotedFromWaitlist?: boolean; checkoutOn: boolean;
};
export type EnrollResult = { enrollmentId: string; state: "held" | "confirmed"; totalCents: number; replay: boolean };

// Every read happens here; the returned commit() performs every write. A caller that never commits writes nothing.
export async function enrollInTx(tx: Transaction, input: EnrollInput):
  Promise<{ result: EnrollResult; commit: () => void }> {
  const { actor, uid, courseId, scope, paymentMode, requestId, byProvider } = input;
  const enrollmentId = createHash("sha256").update(`${byProvider ? actor + ":" : ""}${uid}:${requestId}`).digest("hex");
  const enrollmentRef = db.doc(`courseEnrollments/${enrollmentId}`);
  const managed = byProvider ?
    (await tx.get(db.doc(`courses/${courseId}`))).data() as Course | undefined : undefined;
  if (byProvider) {
    if (!managed) throw new HttpsError("not-found", "course_not_found");
    await canManageCourse(actor, managed, tx);
  }
  const prior = (await tx.get(enrollmentRef)).data() as Enrollment | undefined;
  if (prior) {
    // A free booking is stored as direct whatever mode was requested, so its replay must not compare modes.
    if (prior.courseId !== courseId || prior.scope !== scope ||
      (prior.totalCents !== 0 && prior.paymentMode !== paymentMode) ||
      (scope === "lesson" && prior.sessionIds[0] !== input.sessionId)) {
      throw new HttpsError("invalid-argument", "request_id_reused");
    }
    return {
      result: { enrollmentId, state: prior.state as EnrollResult["state"], totalCents: prior.totalCents, replay: true },
      commit: () => undefined,
    };
  }
  const course = managed ?? (await tx.get(db.doc(`courses/${courseId}`))).data() as Course | undefined;
  if (!course) throw new HttpsError("not-found", "course_not_found");
  if (course.providerId === uid) throw new HttpsError("failed-precondition", "cannot_book_yourself");
  await eligibleProvider(course.providerId, tx);
  const user = (await tx.get(db.doc(`users/${uid}`))).data();
  if (!user || user.isActive === false || ["suspended", "deleted"].includes(user.accountStatus)) {
    throw new HttpsError("permission-denied", "account_inactive");
  }
  const relation = await tx.get(db.collection("clients").where("providerId", "==", course.providerId)
    .where("userId", "==", uid));
  if (byProvider && relation.empty) throw new HttpsError("failed-precondition", "provider_client_required");
  const selected = scope === "series" ? course.sessionIds : [safeId(input.sessionId)];
  if (selected.some((id: string) => !course.sessionIds.includes(id))) {
    throw new HttpsError("invalid-argument", "session_not_in_course");
  }
  const sessionRefs = selected.map((id: string) => db.doc(`courses/${courseId}/sessions/${id}`));
  const participantRefs = selected.map((id: string) =>
    db.doc(`courses/${courseId}/sessions/${id}/participants/${uid}`));
  const customerRef = db.doc(`courses/${courseId}/customers/${uid}`);
  const [sessionDocs, memberships, customer] = await Promise.all([
    tx.getAll(...sessionRefs), tx.getAll(...participantRefs), tx.get(customerRef),
  ]);
  const now = new Date();
  if (scope === "series" && course.firstStartsAt.toDate() <= now) throw new Error("series_already_started");
  const sessions = sessionDocs.map((d, i) => {
    if (!d.exists) throw new Error("session_not_found");
    const s = d.data() as Session;
    const freed = input.released?.[selected[i]];
    return { ...s, startsAt: s.startsAt.toDate(),
      occupied: s.occupied - (freed?.occupied ?? 0), held: s.held - (freed?.held ?? 0) };
  });
  assertReservable(course, sessions, memberships.map((d) => d.exists), now);
  const totalCents = scope === "series" ? course.seriesPriceCents : course.lessonPriceCents;
  if (totalCents === null) throw new Error("pricing_option_unavailable");
  const prices = allocatePrice(totalCents, selected.length);
  const allocations = Object.fromEntries(selected.map((id: string, i: number) => [id, prices[i]]));
  // Free bookings never hold a seat for checkout: there is nothing to pay.
  const free = totalCents === 0;
  const mode = free ? "direct" : paymentMode;
  if (mode === "stripe" && !input.checkoutOn) {
    throw new HttpsError("failed-precondition", "Online course payments are not enabled");
  }
  const state = mode === "stripe" ? "held" : "confirmed";
  const commit = () => {
    tx.create(enrollmentRef, {
      createdBy: actor,
      userId: uid, customerName: user.fullName ?? user.displayName ?? "", providerId: course.providerId,
      courseId, courseName: course.name, sessionIds: selected, activeSessionIds: selected, cancelledSessionIds: [],
      timezone: course.timezone, allocations, scope, totalCents,
      cancellationHours: course.cancellationHours, paymentMode: mode, state,
      ...(free ? { paymentStatus: "paid", paidCents: 0, paymentMethod: "free", paidAt: nowStamp() } :
        { paymentStatus: "pending" }),
      refundCents: 0, holdExpiresAt: Timestamp.fromMillis(now.getTime() + 1800000),
      createdAt: nowStamp(), updatedAt: nowStamp(),
    });
    if (relation.empty) {
      tx.create(db.doc(`clients/${rosterClientId(course.providerId, uid)}`), {
        providerId: course.providerId, userId: uid, providerName: course.providerName,
        name: user.fullName ?? user.displayName ?? "", email: user.email ?? "", phone: user.phone ?? "",
        totalBookings: 0, totalSpent: 0, firstVisit: null, lastVisit: null, notes: "", tags: [], photoUrl: "",
        source: "course", createdAt: nowStamp(), updatedAt: nowStamp(),
        ...(user.accountStatus ? { accountStatus: user.accountStatus } : {}),
      });
    }
    // Later groups keep lateCancels/noShows counters on this doc: only ever create it.
    if (!customer.exists) tx.set(customerRef, { userId: uid, createdAt: nowStamp() });
    if (selected.includes(course.nextSessionId)) {
      tx.update(db.doc(`courses/${courseId}`), { nextAvailableSeats: FieldValue.increment(-1) });
    }
    sessionRefs.forEach((ref, i) => {
      tx.update(ref, mode === "stripe" ?
        { held: FieldValue.increment(1) } : { occupied: FieldValue.increment(1) });
      tx.create(participantRefs[i], { enrollmentId, userId: uid, customerName: user.fullName ?? "",
        providerId: course.providerId, state, attendance: "unmarked" });
    });
    if (state === "confirmed") {
      queueCourseNotification(tx, enrollmentId, "accepted", uid, course, undefined, undefined, !byProvider);
      queueCourseNotification(tx, enrollmentId, "new_request", course.providerId, course);
    }
  };
  return { result: { enrollmentId, state, totalCents, replay: false }, commit };
}

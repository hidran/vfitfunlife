import { createHash } from "crypto";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import { readPaymentSettings } from "../payments/paymentSettingsCallables";
import { allocatePrice, assertReservable, checkoutActive } from "./core";
import { db, safeId, uidOf, eligibleProvider, assertManager, domainError, nowStamp, Course, Session, Enrollment }
  from "./store";
import { rosterClientId } from "../bookings/clientRosterCore";
import { queueCourseNotification } from "./notifications";

async function enroll(req: CallableRequest, byProvider = false) {
  const actor = uidOf(req.auth);
  const uid = byProvider ? safeId(req.data.userId) : actor;
  const courseId = safeId(req.data.courseId);
  const requestId = safeId(req.data.requestId);
  const paymentMode = req.data.paymentMode ?? "direct";
  if (byProvider && paymentMode !== "direct") throw new HttpsError("invalid-argument", "direct_payment_required");
  const scope = req.data.scope;
  if (!["lesson", "series"].includes(scope) || !["direct", "stripe"].includes(paymentMode)) {
    throw new HttpsError("invalid-argument", "invalid_booking_option");
  }
  if (paymentMode === "stripe" && !checkoutActive(await readPaymentSettings())) {
    throw new HttpsError("failed-precondition", "Online course payments are not enabled");
  }
  const enrollmentId = createHash("sha256").update(`${byProvider ? actor + ":" : ""}${uid}:${requestId}`).digest("hex");
  const enrollmentRef = db.doc(`courseEnrollments/${enrollmentId}`);
  try {
    return await db.runTransaction(async (tx) => {
      const managed = byProvider ?
        (await tx.get(db.doc(`courses/${courseId}`))).data() as Course | undefined : undefined;
      if (byProvider) {
        if (!managed) throw new HttpsError("not-found", "course_not_found");
        await assertManager(actor, managed.providerId, tx);
      }
      const prior = (await tx.get(enrollmentRef)).data() as Enrollment | undefined;
      if (prior) {
        if (prior.courseId !== courseId || prior.scope !== scope || prior.paymentMode !== paymentMode ||
          (scope === "lesson" && prior.sessionIds[0] !== req.data.sessionId)) {
          throw new HttpsError("invalid-argument", "request_id_reused");
        }
        return { enrollmentId, state: prior.state, totalCents: prior.totalCents };
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
      const selected = scope === "series" ? course.sessionIds : [safeId(req.data.sessionId)];
      if (selected.some((id: string) => !course.sessionIds.includes(id))) {
        throw new HttpsError("invalid-argument", "session_not_in_course");
      }
      const sessionRefs = selected.map((id: string) => db.doc(`courses/${courseId}/sessions/${id}`));
      const participantRefs = selected.map((id: string) =>
        db.doc(`courses/${courseId}/sessions/${id}/participants/${uid}`));
      const [sessionDocs, memberships] = await Promise.all([
        tx.getAll(...sessionRefs), tx.getAll(...participantRefs),
      ]);
      const now = new Date();
      if (scope === "series" && course.firstStartsAt.toDate() <= now) throw new Error("series_already_started");
      const sessions = sessionDocs.map((d) => {
        if (!d.exists) throw new Error("session_not_found");
        const s = d.data() as Session;
        return { ...s, startsAt: s.startsAt.toDate() };
      });
      assertReservable(course, sessions, memberships.map((d) => d.exists), now);
      const totalCents = scope === "series" ? course.seriesPriceCents : course.lessonPriceCents;
      if (totalCents === null) throw new Error("pricing_option_unavailable");
      const prices = allocatePrice(totalCents, selected.length);
      const allocations = Object.fromEntries(selected.map((id: string, i: number) => [id, prices[i]]));
      const state = paymentMode === "stripe" ? "held" : "confirmed";
      tx.create(enrollmentRef, {
        createdBy: actor,
        userId: uid, customerName: user.fullName ?? user.displayName ?? "", providerId: course.providerId,
        courseId, courseName: course.name, sessionIds: selected, activeSessionIds: selected, cancelledSessionIds: [],
        timezone: course.timezone, allocations, scope, totalCents,
        cancellationHours: course.cancellationHours, paymentMode, state,
        paymentStatus: "pending", refundCents: 0, holdExpiresAt: Timestamp.fromMillis(now.getTime() + 1800000),
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
      tx.set(db.doc(`courses/${courseId}/customers/${uid}`), { userId: uid, createdAt: nowStamp() });
      if (selected.includes(course.nextSessionId)) {
        tx.update(db.doc(`courses/${courseId}`), { nextAvailableSeats: course.nextAvailableSeats - 1 });
      }
      sessionRefs.forEach((ref, i) => {
        tx.update(ref, paymentMode === "stripe" ?
          { held: sessions[i].held + 1 } : { occupied: sessions[i].occupied + 1 });
        tx.create(participantRefs[i], { enrollmentId, userId: uid, customerName: user.fullName ?? "",
          providerId: course.providerId, state, attendance: "unmarked" });
      });
      if (state === "confirmed") {
        queueCourseNotification(tx, enrollmentId, "accepted", uid, course, undefined, undefined, !byProvider);
        queueCourseNotification(tx, enrollmentId, "new_request", course.providerId, course);
      }
      return { enrollmentId, state, totalCents };
    });
  } catch (error) {
    return domainError(error);
  }
}
export const enrollInCourse = onCall({ region }, (req) => enroll(req));
export const enrollCourseParticipant = onCall({ region }, (req) => enroll(req, true));

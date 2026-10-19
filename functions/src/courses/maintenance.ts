import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { region } from "../lib/runtimeOptions";
import { db, Enrollment, Session, Course } from "./store";
import { releaseEnrollment } from "./operations";
import { processCourseRefund } from "./checkout";
import { queueCourseNotification } from "./notifications";

export const maintainCourseEnrollments = onSchedule(
  { region, schedule: "every 5 minutes", timeoutSeconds: 540, secrets: ["STRIPE_SECRET_KEY"] }, async () => {
    const holds = await db.collection("courseEnrollments").where("state", "==", "held")
      .where("holdExpiresAt", "<=", Timestamp.now()).limit(100).get();
    for (const d of holds.docs) await releaseEnrollment(d.id, null, undefined, "", true);
    const refundQuery = db.collection("courseRefunds").where("paymentMode", "==", "stripe")
      .where("status", "in", ["pending", "processing"]);
    let refunds = await refundQuery.limit(100).get();
    while (!refunds.empty) {
      for (const d of refunds.docs) {
        try {
          await processCourseRefund(d.id);
        } catch (error) {
          logger.error("course refund failed", { id: d.id, error });
        }
      }
      refunds = await refundQuery.startAfter(refunds.docs[refunds.docs.length - 1]).limit(100).get();
    }
    // Advance discovery after a lesson starts.
    const dueCourses = await db.collection("courses").where("state", "==", "published")
      .where("nextStartsAt", "<=", Timestamp.now()).limit(100).get();
    for (const doc of dueCourses.docs) {
      await db.runTransaction(async (tx) => {
        await tx.get(doc.ref);
        const sessions = await tx.get(doc.ref.collection("sessions"));
        const future = sessions.docs.filter((s) => s.data().state === "scheduled" &&
          s.data().startsAt.toMillis() > Date.now()).sort((a, b) =>
          a.data().startsAt.toMillis() - b.data().startsAt.toMillis());
        if (future.length) {
          const next = future[0].data();
          tx.update(doc.ref, { nextStartsAt: next.startsAt, nextSessionId: future[0].id,
            nextAvailableSeats: next.capacity - next.occupied - next.held });
        } else tx.update(doc.ref, { enrollmentClosed: true, state: "archived" });
      });
    }
    // Retry interrupted provider cancellations independently of the caller's browser.
    const cancelled = await db.collectionGroup("sessions").where("state", "==", "cancelled")
      .where("cancellationReconciled", "==", false).limit(100).get();
    for (const s of cancelled.docs) {
      if (s.ref.parent.parent?.parent.id !== "courses") continue;
      const participants = await s.ref.collection("participants").get();
      for (const p of participants.docs) {
        await releaseEnrollment(p.data().enrollmentId, null, [s.id], s.data().cancellationReason ?? "Lesson cancelled");
      }
      await s.ref.update({ cancellationReconciled: true });
    }
  }
);

export const remindCourseParticipants = onSchedule(
  { region, schedule: "every 60 minutes", timeoutSeconds: 540 }, async () => {
    const now = Date.now();
    const query = db.collectionGroup("sessions").where("state", "==", "scheduled")
      .where("startsAt", ">", Timestamp.fromMillis(now)).where("startsAt", "<=", Timestamp.fromMillis(now + 86400000))
      .orderBy("startsAt");
    let sessions = await query.limit(200).get();
    while (!sessions.empty) {
      for (const doc of sessions.docs) {
        if (doc.ref.parent.parent?.parent.id !== "courses") continue;
        const s = doc.data() as Session;
        const course = (await doc.ref.parent.parent.get()).data() as Course;
        const participants = await doc.ref.collection("participants").where("state", "==", "confirmed").get();
        for (const p of participants.docs) {
          const enrollment = (await db.doc(`courseEnrollments/${p.data().enrollmentId}`).get()).data() as Enrollment;
          if (!enrollment?.activeSessionIds.includes(doc.id)) continue;
          const batch = db.batch();
          queueCourseNotification(batch,
            `${p.data().enrollmentId}_${doc.id}_${s.startsAt.toMillis()}`,
            "reminder_24h", p.id, course, s.startsAt.toDate());
          await batch.commit();
        }
      }
      sessions = await query.startAfter(sessions.docs[sessions.docs.length - 1]).limit(200).get();
    }
  });

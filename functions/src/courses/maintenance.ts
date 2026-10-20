import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { region } from "../lib/runtimeOptions";
import { db, Enrollment, Session, Course } from "./store";
import { releaseEnrollment } from "./operations";
import { processCourseRefund } from "./checkout";
import { queueCourseNotification } from "./notifications";
import { dayOfPath } from "./locks";
import { clearWaitlistInTx, promoteWaitlist, promotionWindowOpen } from "./waitlist";

/**
 * Deletes the lock slots of lessons that have ended, and day documents left empty. Only documents of today or
 * earlier UTC days are visited (a slot that crosses midnight stays until it ends). Bounded: `pageSize` documents
 * per page, `maxPages` pages per run; the next run continues, since swept documents are gone.
 */
export async function sweepElapsedLocks(now = new Date(), pageSize = 100, maxPages = 5): Promise<number> {
  const today = now.toISOString().slice(0, 10);
  let swept = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (let page = 0; page < maxPages; page++) {
    let query = db.collection("courseScheduleLocks").where("day", "<=", today).orderBy("day").limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const elapsed = (data: FirebaseFirestore.DocumentData) =>
      Object.values(data.slots ?? {}).some((slot) => (slot as { end: number }).end <= now.getTime());
    for (const doc of snapshot.docs.filter((d) => elapsed(d.data()) || !Object.keys(d.data().slots ?? {}).length)) {
      swept += await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (!current.exists) return 0;
        const slots = { ...(current.data()?.slots ?? {}) } as Record<string, { end: number }>;
        const live = Object.fromEntries(Object.entries(slots).filter(([, slot]) => slot.end > now.getTime()));
        const dropped = Object.keys(slots).length - Object.keys(live).length;
        if (!Object.keys(live).length) tx.delete(doc.ref);
        else if (dropped) tx.set(doc.ref, { slots: live, day: dayOfPath(doc.ref.path) });
        return dropped || (Object.keys(live).length ? 0 : 1);
      });
    }
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < pageSize) break;
  }
  return swept;
}

// Where the previous waitlist sweep stopped. Lessons that legitimately keep a waitlist (they are full) never leave the
// query, so a fixed first page would starve the stranded ones behind them: each run continues after the last lesson
// the previous run looked at and wraps around at the end.
const WAITLIST_SWEEP_STATE = "courseSweepState/waitlist";
type SweepScan = "indexed" | "fallback";

/**
 * One page of lessons that may have a waitlist to serve. The indexed query needs the (state, waitlisted) collection
 * group index from the index task; until it is deployed Firestore answers FAILED_PRECONDITION (code 9) and the sweep
 * falls back to scanning scheduled lessons through the existing (state, startsAt) index, filtering in memory.
 */
async function waitlistPage(scan: SweepScan, cursor: FirebaseFirestore.DocumentSnapshot | undefined, limit: number):
  Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  let query: FirebaseFirestore.Query = db.collectionGroup("sessions").where("state", "==", "scheduled");
  query = scan === "indexed" ? query.where("waitlisted", ">", 0).orderBy("waitlisted") : query.orderBy("startsAt");
  // A cursor left by the fallback scan may lack the field the indexed query orders by.
  if (cursor && (scan === "fallback" || typeof cursor.get("waitlisted") === "number")) query = query.startAfter(cursor);
  return (await query.limit(limit).get()).docs;
}

/**
 * Serves waitlists nobody is looking at: promotes into free seats (promoteWaitlist) and closes the lists of lessons
 * inside the notice window or already started (`window_closed`). Bounded to `pageSize * maxPages` lessons per run.
 * Idempotent: a served list is empty, and every step re-checks its lesson inside its own transaction.
 */
export async function sweepWaitlists(
  options: { now?: Date; pageSize?: number; maxPages?: number; scan?: SweepScan } = {}
): Promise<{ examined: number; promoted: number; cleared: number }> {
  const { pageSize = 50, maxPages = 4 } = options;
  let scan: SweepScan = options.scan ?? "indexed";
  const stateRef = db.doc(WAITLIST_SWEEP_STATE);
  const cursorPath = (await stateRef.get()).data()?.cursor as string | undefined;
  let cursor = cursorPath ? await db.doc(cursorPath).get() : undefined;
  if (cursor && !cursor.exists) cursor = undefined;
  const result = { examined: 0, promoted: 0, cleared: 0 };
  for (let page = 0; page < maxPages; page++) {
    let docs: FirebaseFirestore.QueryDocumentSnapshot[];
    try {
      docs = await waitlistPage(scan, cursor, pageSize);
    } catch (error) {
      if (scan !== "indexed" || (error as { code?: unknown }).code !== 9) throw error;
      logger.warn("waitlist sweep: (state, waitlisted) index missing, scanning scheduled lessons", { error });
      scan = "fallback";
      docs = await waitlistPage(scan, cursor, pageSize);
    }
    for (const doc of docs) {
      const courseRef = doc.ref.parent.parent;
      if (!courseRef || courseRef.parent.id !== "courses" || ((doc.data().waitlisted as number | undefined) ?? 0) < 1) {
        continue;
      }
      result.examined++;
      const closed = await db.runTransaction(async (tx) => {
        const [courseDoc, sessionDoc] = await tx.getAll(courseRef, doc.ref);
        const course = courseDoc.data() as Course | undefined;
        const session = sessionDoc.data() as Session | undefined;
        if (!course || session?.state !== "scheduled" || (session.waitlisted ?? 0) < 1 ||
          promotionWindowOpen(session, course, options.now ?? new Date())) return false;
        (await clearWaitlistInTx(tx, { ...course, id: courseRef.id }, doc.id, "window_closed"))();
        return true;
      });
      if (closed) result.cleared++;
      else result.promoted += await promoteWaitlist(courseRef.id, doc.id);
    }
    // A short page means the end of the query: start from the top next time.
    if (docs.length < pageSize) {
      cursor = undefined;
      break;
    }
    cursor = docs[docs.length - 1];
  }
  await stateRef.set({ cursor: cursor?.ref.path ?? null, updatedAt: Timestamp.now() });
  return result;
}

export const maintainCourseEnrollments = onSchedule(
  { region, schedule: "every 5 minutes", timeoutSeconds: 540, secrets: ["STRIPE_SECRET_KEY"] }, async () => {
    const holds = await db.collection("courseEnrollments").where("state", "==", "held")
      .where("holdExpiresAt", "<=", Timestamp.now()).limit(100).get();
    for (const d of holds.docs) await releaseEnrollment(d.id, { kind: "system" }, undefined, "", true);
    try {
      await sweepWaitlists();
    } catch (error) {
      logger.error("waitlist sweep failed", { error });
    }
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
    try {
      await sweepElapsedLocks();
    } catch (error) {
      logger.error("lock sweep failed", { error });
    }
    // Retry interrupted provider cancellations independently of the caller's browser.
    const cancelled = await db.collectionGroup("sessions").where("state", "==", "cancelled")
      .where("cancellationReconciled", "==", false).limit(100).get();
    for (const s of cancelled.docs) {
      if (s.ref.parent.parent?.parent.id !== "courses") continue;
      const participants = await s.ref.collection("participants").get();
      for (const p of participants.docs) {
        await releaseEnrollment(p.data().enrollmentId, { kind: "system" }, [s.id],
          s.data().cancellationReason ?? "Lesson cancelled");
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

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { region } from "../lib/runtimeOptions";
import { readPaymentSettings } from "../payments/paymentSettingsCallables";
import { checkoutActive } from "./core";
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

const hasFreeSeat = (session: Pick<Session, "capacity" | "occupied" | "held">) =>
  session.capacity - session.occupied - session.held >= 1;

type SweepResult = { examined: number; promoted: number; cleared: number };

type Ref = FirebaseFirestore.DocumentReference;
type Settings = { checkoutOn: () => Promise<boolean> };

/**
 * Serves one lesson: closes its list when the notice window is over, otherwise promotes into free seats.
 * `underCounted` = reached through an entry whose lesson counter says zero; such a lesson is served whatever its
 * counter says (promoteWaitlist recounts), a counter-driven one only while the counter says there is a list.
 */
async function serveLesson(courseRef: Ref, sessionRef: Ref, now: Date, settings: Settings,
  underCounted: boolean): Promise<"cleared" | number> {
  const next = await db.runTransaction(async (tx): Promise<"cleared" | "promote" | "skip"> => {
    const [courseDoc, sessionDoc] = await tx.getAll(courseRef, sessionRef);
    const course = courseDoc.data() as Course | undefined;
    const session = sessionDoc.data() as Session | undefined;
    if (!course || session?.state !== "scheduled" || (!underCounted && (session.waitlisted ?? 0) < 1)) return "skip";
    if (!promotionWindowOpen(session, course, now)) {
      (await clearWaitlistInTx(tx, { ...course, id: courseRef.id }, sessionRef.id, "window_closed"))();
      return "cleared";
    }
    // A full lesson with an open window has nothing to promote: a legitimate waitlist costs one read, not a second
    // transaction. (A ghost counter on such a lesson is recounted by the next release or capacity change.)
    return underCounted || hasFreeSeat(session) ? "promote" : "skip";
  });
  if (next === "cleared") return "cleared";
  if (next === "skip") return 0;
  return promoteWaitlist(courseRef.id, sessionRef.id, { checkoutOn: await settings.checkoutOn() });
}

/**
 * Serves waitlists nobody is looking at: promotes into free seats (promoteWaitlist) and closes the lists of lessons
 * inside the notice window or already started (`window_closed`). Bounded to `pageSize * maxPages` lessons per run.
 * Idempotent: a served list is empty, and every step re-checks its lesson inside its own transaction.
 *
 * Two scans find work. The counter scan visits lessons whose `waitlisted` counter is above zero (a full lesson inside
 * its notice window is skipped after one read: nothing can be promoted). The entry scan
 * pages through the waitlist entries themselves and serves any lesson whose counter says zero although an entry
 * exists, so a counter that fell behind is repaired and its customers are not stranded.
 */
export async function sweepWaitlists(
  options: { now?: Date; pageSize?: number; maxPages?: number; scan?: SweepScan } = {}
): Promise<SweepResult> {
  const { pageSize = 50, maxPages = 4 } = options;
  const now = options.now ?? new Date();
  let scan: SweepScan = options.scan ?? "indexed";
  const stateRef = db.doc(WAITLIST_SWEEP_STATE);
  const state = (await stateRef.get()).data();
  const cursorPath = state?.cursor as string | undefined;
  let cursor = cursorPath ? await db.doc(cursorPath).get() : undefined;
  if (cursor && !cursor.exists) cursor = undefined;
  const result: SweepResult = { examined: 0, promoted: 0, cleared: 0 };
  // The payment settings are read once per run, and only when a lesson actually needs a promotion.
  let checkoutOn: Promise<boolean> | undefined;
  const settings = { checkoutOn: () => (checkoutOn ??= readPaymentSettings().then(checkoutActive)) };
  const served = new Set<string>();
  const serve = async (courseRef: Ref, sessionRef: Ref, underCounted: boolean) => {
    served.add(sessionRef.path);
    result.examined++;
    const outcome = await serveLesson(courseRef, sessionRef, now, settings, underCounted);
    if (outcome === "cleared") result.cleared++;
    else result.promoted += outcome;
  };
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
      await serve(courseRef, doc.ref, false);
    }
    // A short page means the end of the query: start from the top next time.
    if (docs.length < pageSize) {
      cursor = undefined;
      break;
    }
    cursor = docs[docs.length - 1];
  }
  // Entry scan: one page per run, continuing where the previous run stopped (document-name order, no index needed).
  let entryCursor = state?.entryCursor as string | undefined;
  let entries = db.collectionGroup("waitlist").orderBy(FieldPath.documentId()).limit(pageSize);
  if (entryCursor) entries = entries.startAfter(db.doc(entryCursor));
  const page = (await entries.get()).docs;
  for (const entry of page) {
    const sessionRef = entry.ref.parent.parent;
    const courseRef = sessionRef?.parent.parent;
    if (!sessionRef || !courseRef || courseRef.parent.id !== "courses" || sessionRef.parent.id !== "sessions" ||
      served.has(sessionRef.path)) continue;
    served.add(sessionRef.path);
    const session = (await sessionRef.get()).data() as Session | undefined;
    if (session?.state !== "scheduled" || (session.waitlisted ?? 0) > 0) continue;
    await serve(courseRef, sessionRef, true);
  }
  entryCursor = page.length < pageSize ? undefined : page[page.length - 1].ref.path;
  await stateRef.set({ cursor: cursor?.ref.path ?? null, entryCursor: entryCursor ?? null,
    updatedAt: Timestamp.now() });
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

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldPath, FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { region } from "../lib/runtimeOptions";
import { db, providerUsable } from "./store";

/** Sessions rewritten per transaction (plus the course document in the last one: well under the 500 write limit). */
export const SESSION_CHUNK = 400;

type EligibilityEvent = { params: { providerId: string } };
type Step = "stale" | "gone" | { eligible: boolean; last: boolean; lastId?: string };

/**
 * One course: sessions[].listed = (course published && provider eligible), then providerEligible on the course.
 *
 * Every chunk is a transaction that re-reads the provider, the course and its chunk of sessions, so what it writes is a
 * function of the state at its own commit: a concurrent saveCourse (which rewrites the sessions and the course) or a
 * second provider flip can never be overwritten with a value computed from an older read.
 *
 * A pass that spans several chunks leaves `listingSyncPending: true` on the course until its last chunk, which also
 * writes the flag. The marker is what makes a half-done pass findable even when the provider has flipped back since
 * (the flag alone would then look settled while some sessions carry the old verdict). If the provider's eligibility
 * changes between two chunks the pass stops without touching flag or marker; the handler of that change finds the
 * marker and repeats the whole pass.
 */
async function syncCourse(courseRef: DocumentReference, providerId: string): Promise<void> {
  let cursor: string | undefined;
  let expected: boolean | undefined;
  for (;;) {
    const step: Step = await db.runTransaction(async (tx) => {
      const [provider, course] = await Promise.all([tx.get(db.doc(`instructors/${providerId}`)), tx.get(courseRef)]);
      if (!course.exists) return "gone";
      const eligible = providerUsable(provider.data());
      if (expected !== undefined && expected !== eligible) return "stale";
      let query = courseRef.collection("sessions").orderBy(FieldPath.documentId()).limit(SESSION_CHUNK);
      if (cursor !== undefined) query = query.startAfter(cursor);
      const sessions = (await tx.get(query)).docs;
      const listed = course.get("state") === "published" && eligible;
      for (const session of sessions) if (session.get("listed") !== listed) tx.update(session.ref, { listed });
      const last = sessions.length < SESSION_CHUNK;
      const pending = course.get("listingSyncPending") === true;
      if (last) {
        const patch: Record<string, boolean | FieldValue> = {};
        if (course.get("providerEligible") !== eligible) patch.providerEligible = eligible;
        if (pending) patch.listingSyncPending = FieldValue.delete();
        if (Object.keys(patch).length) tx.update(courseRef, patch);
      } else if (!pending) {
        tx.update(courseRef, { listingSyncPending: true });
      }
      return { eligible, last, lastId: sessions.at(-1)?.id };
    });
    if (step === "stale" || step === "gone" || step.last) return;
    expected = step.eligible;
    cursor = step.lastId;
  }
}

/**
 * A provider's eligibility decides whether their courses are public (the course read rule and the discovery query) and
 * whether their lessons are `listed` (the public venue timetable query). The eligibility is read fresh, not taken from
 * the event: a retried or out-of-order event must not put an older state over a newer one.
 *
 * Only courses whose flag disagrees, or that a previous pass left pending, are touched. The courses go one after the
 * other and a failing course does not stop the others: the handler throws at the end and `retry: true` repeats it,
 * which is safe because every step is idempotent. It writes courses and sessions only, never
 * instructors, so it cannot re-trigger itself.
 */
export async function syncCourseEligibility(event: EligibilityEvent): Promise<void> {
  const { providerId } = event.params;
  const eligible = providerUsable((await db.doc(`instructors/${providerId}`).get()).data());
  // Courses whose flag disagrees, and courses a multi-chunk pass left half done. Both are equality-only queries on
  // single fields, so no composite index is involved; a settled provider costs two empty queries.
  const courses = db.collection("courses").where("providerId", "==", providerId);
  const [mismatched, pending] = await Promise.all([
    courses.where("providerEligible", "==", !eligible).get(), courses.where("listingSyncPending", "==", true).get()]);
  const todo = new Map([...mismatched.docs, ...pending.docs].map((doc) => [doc.id, doc]));
  let failed = 0;
  for (const course of todo.values()) {
    try {
      await syncCourse(course.ref, providerId);
    } catch (error) {
      failed++;
      logger.error("course eligibility sync failed", { providerId, courseId: course.id, error });
    }
  }
  if (failed) throw new Error(`course_eligibility_sync_failed:${failed}`);
}

export const onCourseProviderEligibility = onDocumentWritten(
  // The sync of a provider with many long courses is one transaction per 400 lessons.
  { region, retry: true, timeoutSeconds: 300, document: "instructors/{providerId}" },
  syncCourseEligibility,
);

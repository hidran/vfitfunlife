import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { DocumentData, DocumentReference, Transaction } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import { db, safeId, uidOf, domainError, venueTakesBookings, Course, Session } from "./store";
import { canManageCourse } from "./authority";
import { discountPercents, applyDiscount, quoteSeries, STRIPE_MIN_CENTS } from "./pricing";

export type SessionQuote = {
  sessionId: string; revision: number; regularCents: number; discountPercent: number; gymPercent: number;
  instructorPercent: number; discountCents: number; finalCents: number; availableSeats: number; waitlisted: number;
  // Online payment is possible: the final price reaches Stripe's minimum charge.
  stripeEligible: boolean;
};
export type CourseQuote = {
  sessions: SessionQuote[];
  series: null | {
    regularCents: number; discountPercent: number; gymPercent: number; instructorPercent: number;
    discountCents: number; finalCents: number; stripeEligible: boolean; allocations: Record<string, number>;
    // Revision of every lesson: a series booking confirms them all, however many lessons the course has.
    revisions: Record<string, number>;
  };
};
export type QuoteOptions = {
  // Session documents the caller has already read (inside the same transaction).
  sessions?: Map<string, Session>;
  // Series pricing reads every lesson of the course: lesson-only callers turn it off.
  includeSeries?: boolean;
  // The venue document, when the caller has already read it (null = no such venue).
  venue?: DocumentData | null;
};

const MAX_QUOTE_SESSIONS = 100;
const QUOTE_LIMIT = 60;
const QUOTE_WINDOW_MS = 10 * 60 * 1000;

/** Per-caller limit: a quote reads up to MAX_QUOTE_SESSIONS lessons (and every lesson of a linked series). */
async function enforceQuoteRateLimit(uid: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`rateLimits/quoteCourse_${uid}`);
    const data = (await tx.get(ref)).data();
    const recent = data?.windowStartedAt > Date.now() - QUOTE_WINDOW_MS;
    const count = recent ? data?.count ?? 0 : 0;
    if (count >= QUOTE_LIMIT) throw new HttpsError("resource-exhausted", "rate_limited");
    tx.set(ref, { windowStartedAt: recent ? data?.windowStartedAt : Date.now(), count: count + 1 });
  });
}

async function readAll(tx: Transaction | null, refs: DocumentReference[]): Promise<(DocumentData | undefined)[]> {
  if (!refs.length) return [];
  const docs = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  return docs.map((doc) => doc.data());
}

/** Venue and instructor reads go through `tx` when given, so a transaction's quote and writes see one snapshot. */
export async function buildQuote(
  tx: Transaction | null, course: Course & { id: string }, sessionIds: string[], options: QuoteOptions = {}
): Promise<CourseQuote> {
  const wantSeries = course.seriesPriceCents !== null && options.includeSeries !== false;
  // Lesson-only quotes read the requested lessons alone. A series quote reads every lesson, for the revisions
  // and (when linked) each lesson's substitute. Unlinked courses have no discounts, so they never read instructors.
  const linked = !!course.venueId;
  const needed = [...new Set([...sessionIds, ...(wantSeries ? course.sessionIds : [])])];
  const loaded = new Map<string, Session>(options.sessions ?? []);
  const missing = needed.filter((id) => !loaded.has(id));
  const [venue, fetched] = await Promise.all([
    !course.venueId ? undefined : options.venue !== undefined ? options.venue ?? undefined :
      readAll(tx, [db.doc(`venues/${course.venueId}`)]).then((r) => r[0]),
    readAll(tx, missing.map((id) => db.doc(`courses/${course.id}/sessions/${id}`))),
  ]);
  fetched.forEach((data, i) => {
    if (!data) throw new Error("session_not_found");
    loaded.set(missing[i], data as Session);
  });
  const instructorOf = (id: string) => loaded.get(id)!.instructorId ?? course.instructorId ?? null;
  const instructorIds = !linked ? [] : [...new Set([...needed.map(instructorOf), course.instructorId].filter(
    (id): id is string => !!id))];
  const partners = new Map<string, boolean>();
  (await readAll(tx, instructorIds.map((id) => db.doc(`instructors/${id}`)))).forEach((data, i) => {
    partners.set(instructorIds[i], data?.partnerStatus === "active");
  });
  const partnerOf = (id: string | null) => !!id && partners.get(id) === true;
  // Unlinked courses have no venue, so every percent is 0 whatever the instructor's partner status.
  const pricing = venue ? { memberDiscountPercent: venue.memberDiscountPercent,
    partnerInstructorExtraPercent: venue.partnerInstructorExtraPercent } : null;
  const percentsOf = (id: string) => discountPercents(pricing, linked && partnerOf(instructorOf(id)));

  const sessions: SessionQuote[] = course.lessonPriceCents === null ? [] : sessionIds.map((sessionId) => {
    const session = loaded.get(sessionId)!;
    const percents = percentsOf(sessionId);
    const price = applyDiscount(course.lessonPriceCents!, percents.percent);
    return {
      sessionId, revision: session.revision ?? 1, regularCents: price.regularCents,
      discountPercent: percents.percent, gymPercent: percents.gymPercent, instructorPercent: percents.instructorPercent,
      discountCents: price.discountCents, finalCents: price.finalCents,
      stripeEligible: price.finalCents >= STRIPE_MIN_CENTS,
      availableSeats: Math.max(0, (session.capacity ?? course.capacity) - session.occupied - session.held),
      waitlisted: session.waitlisted ?? 0,
    };
  });
  let series: CourseQuote["series"] = null;
  if (wantSeries) {
    const priced = quoteSeries(course.seriesPriceCents!, course.sessionIds.map((id) => percentsOf(id).percent));
    const courseLevel = discountPercents(pricing, partnerOf(course.instructorId ?? null));
    series = {
      regularCents: priced.regularCents, discountPercent: courseLevel.percent, gymPercent: courseLevel.gymPercent,
      instructorPercent: courseLevel.instructorPercent, discountCents: priced.discountCents,
      finalCents: priced.finalCents, stripeEligible: priced.finalCents >= STRIPE_MIN_CENTS,
      allocations: Object.fromEntries(course.sessionIds.map((id, i) => [id, priced.allocations[i]])),
      revisions: Object.fromEntries(course.sessionIds.map((id) => [id, loaded.get(id)!.revision ?? 1])),
    };
  }
  return { sessions, series };
}

export const quoteCourse = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  try {
    const courseId = safeId(req.data.courseId);
    const requested = req.data.sessionIds;
    if (requested !== undefined && (!Array.isArray(requested) || requested.length > MAX_QUOTE_SESSIONS)) {
      throw new HttpsError("invalid-argument", "too_many_sessions");
    }
    await enforceQuoteRateLimit(uid);
    const stored = (await db.doc(`courses/${courseId}`).get()).data() as Course | undefined;
    if (!stored) throw new HttpsError("not-found", "course_not_found");
    const course = { ...stored, id: courseId };
    const manages = await canManageCourse(uid, course).then(() => true, () => false);
    if (!manages && (course.state !== "published" || course.providerEligible !== true)) {
      throw new HttpsError("not-found", "course_not_found");
    }
    if (course.venueId && !manages) {
      const venue = (await db.doc(`venues/${course.venueId}`).get()).data();
      if (!venueTakesBookings(venue)) {
        throw new HttpsError("failed-precondition", "venue_not_active");
      }
    }
    // Omitting the ids means "the first lessons": never more than the cap, whatever the course length. The series
    // block still covers every lesson.
    const sessionIds = requested === undefined ? course.sessionIds.slice(0, MAX_QUOTE_SESSIONS) :
      [...new Set((requested as unknown[]).map(safeId))];
    if (sessionIds.some((id) => !course.sessionIds.includes(id))) {
      throw new HttpsError("invalid-argument", "session_not_in_course");
    }
    // Callers that only sell one lesson say so, and skip reading the whole series.
    return await buildQuote(null, course, sessionIds, { includeSeries: req.data.includeSeries !== false });
  } catch (error) {
    return domainError(error);
  }
});

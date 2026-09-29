/**
 * Pure rules behind the `submitReview` callable, kept apart from it so they can be tested
 * without a Firestore instance.
 */

/**
 * A session can be reviewed once it happened. `payment_confirmed` is a completed session
 * whose payment landed — refusing it (as the callable once did) meant that the moment a
 * client confirmed paying, they lost the right to review.
 */
export const REVIEWABLE_STATUSES: readonly string[] = ["completed", "payment_confirmed"];

export const REVIEW_COMMENT_MAX_LENGTH = 1000;

/** Keys of the quick tags on the review screen; the labels are translated client-side. */
export const REVIEW_TAGS: readonly string[] = [
  "punctual",
  "professional",
  "clearComm",
  "topExperience",
  "convenientLocation",
  "doItAgain",
];

export interface ReviewInput {
  bookingId: string;
  rating: number;
  comment: string;
  tags: string[];
}

export type ReviewInputResult =
  | { ok: true; value: ReviewInput }
  | { ok: false; message: string };

// C0 controls except tab/newline, DEL and C1.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g;

function cleanComment(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Validates and normalises what the client sent. */
export function validateReviewInput(data: unknown): ReviewInputResult {
  const d = (data ?? {}) as Record<string, unknown>;
  const bookingId = typeof d.bookingId === "string" ? d.bookingId.trim() : "";
  if (!bookingId || bookingId.includes("/")) {
    return { ok: false, message: "bookingId is required" };
  }
  const rating = d.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, message: "rating must be an integer from 1 to 5" };
  }
  const comment = cleanComment(d.comment);
  if (Array.from(comment).length > REVIEW_COMMENT_MAX_LENGTH) {
    return { ok: false, message: `comment must be at most ${REVIEW_COMMENT_MAX_LENGTH} characters` };
  }
  const tags = Array.isArray(d.tags) ?
    Array.from(new Set(d.tags.filter((t): t is string => typeof t === "string" && REVIEW_TAGS.includes(t)))) :
    [];
  return { ok: true, value: { bookingId, rating, comment, tags } };
}

export type ReviewableRefusal =
  | "not_found"
  | "permission_denied"
  | "already_reviewed"
  | "not_delivered"
  | "no_target";

export interface ReviewableBooking {
  userId?: string;
  status?: string;
  hasReviewed?: boolean;
  reviewId?: string | null;
  instructorId?: string | null;
  venueId?: string | null;
  serviceName?: string | null;
}

/** Whether `uid` may review this booking now, and if not, why. */
export function checkReviewable(
  booking: ReviewableBooking | undefined,
  uid: string
): { ok: true } | { ok: false; reason: ReviewableRefusal } {
  if (!booking) return { ok: false, reason: "not_found" };
  if (booking.userId !== uid) return { ok: false, reason: "permission_denied" };
  if (booking.hasReviewed || booking.reviewId) return { ok: false, reason: "already_reviewed" };
  if (!booking.status || !REVIEWABLE_STATUSES.includes(booking.status)) {
    return { ok: false, reason: "not_delivered" };
  }
  if (!booking.instructorId && !booking.venueId) return { ok: false, reason: "no_target" };
  return { ok: true };
}

/**
 * Average and count over a provider's reviews. Anything that is not a 1–5 rating (a
 * half-written legacy document) is left out of both, so it cannot drag the average to 0.
 */
export function computeRatingSummary(ratings: unknown[]): { ratingAvg: number; reviewCount: number } {
  const valid = ratings.filter(
    (r): r is number => typeof r === "number" && Number.isFinite(r) && r >= 1 && r <= 5
  );
  if (valid.length === 0) return { ratingAvg: 0, reviewCount: 0 };
  const avg = valid.reduce((sum, r) => sum + r, 0) / valid.length;
  return { ratingAvg: Math.round(avg * 10) / 10, reviewCount: valid.length };
}

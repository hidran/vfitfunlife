import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { region } from "../lib/runtimeOptions";
import { awardXp } from "./gamification";
import {
  checkReviewable,
  computeRatingSummary,
  validateReviewInput,
  type ReviewableBooking,
  type ReviewableRefusal,
} from "./reviewRules";

const db = admin.firestore();

const REVIEW_XP = 10;
const REVIEW_POINTS = 10;

const REFUSALS: Record<ReviewableRefusal, [ConstructorParameters<typeof HttpsError>[0], string]> = {
  not_found: ["not-found", "Booking not found"],
  permission_denied: ["permission-denied", "Not authorized"],
  already_reviewed: ["already-exists", "Review already submitted"],
  not_delivered: ["failed-precondition", "Booking not completed"],
  no_target: ["failed-precondition", "Booking has no trainer or venue to review"],
};

function refusal(reason: ReviewableRefusal): HttpsError {
  const [code, message] = REFUSALS[reason];
  return new HttpsError(code, message, { reason });
}

/**
 * Submit a review for a delivered booking (`completed` or `payment_confirmed`).
 *
 * Exactly one review per booking: the review documents use the booking id as their own id
 * and everything — the checks, the review, the booking's `hasReviewed`, the points — is one
 * transaction, so a double tap (or two devices) cannot publish two reviews or pay twice.
 *
 * The review lands under `instructors/{id}/reviews` (what the public reviews page and the
 * booking screen read) and, for venue bookings, under `venues/{id}/reviews`, in the shape
 * the client reads: `userName`, `avatarUrl`, `rating`, `text`.
 */
export const submitReview = onCall(
  { region },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }
    const userId = request.auth.uid;

    const input = validateReviewInput(request.data);
    if (!input.ok) throw new HttpsError("invalid-argument", input.message);
    const { bookingId, rating, comment, tags } = input.value;

    const bookingRef = db.collection("bookings").doc(bookingId);
    const userRef = db.collection("users").doc(userId);

    const { instructorId, venueId } = await db.runTransaction(async (tx) => {
      const [bookingSnap, userSnap] = await Promise.all([tx.get(bookingRef), tx.get(userRef)]);
      const booking = bookingSnap.exists ? (bookingSnap.data() as ReviewableBooking) : undefined;
      const check = checkReviewable(booking, userId);
      if (!check.ok) throw refusal(check.reason);

      const instructorId = booking?.instructorId || null;
      const venueId = booking?.venueId || null;
      const instructorReviewRef = instructorId ?
        db.collection("instructors").doc(instructorId).collection("reviews").doc(bookingId) :
        null;
      const venueReviewRef = venueId ?
        db.collection("venues").doc(venueId).collection("reviews").doc(bookingId) :
        null;

      // Belt and braces for bookings whose hasReviewed flag predates this callable.
      const existing = await Promise.all(
        [instructorReviewRef, venueReviewRef]
          .filter((ref): ref is admin.firestore.DocumentReference => ref !== null)
          .map((ref) => tx.get(ref))
      );
      if (existing.some((snap) => snap.exists)) throw refusal("already_reviewed");

      const userData = userSnap.data() ?? {};
      const now = admin.firestore.FieldValue.serverTimestamp();
      const review = {
        userId,
        userName: (userData.fullName as string | undefined) || "Utente",
        avatarUrl: (userData.avatarUrl as string | undefined) || null,
        bookingId,
        instructorId,
        venueId,
        serviceName: booking?.serviceName ?? null,
        rating,
        text: comment,
        tags,
        isVerified: true, // backed by a delivered booking
        createdAt: now,
        updatedAt: now,
      };

      if (instructorReviewRef) tx.set(instructorReviewRef, review);
      if (venueReviewRef) tx.set(venueReviewRef, review);

      tx.update(bookingRef, {
        hasReviewed: true,
        reviewId: bookingId,
        updatedAt: now,
      });

      // Points for the review (vision doc §4: +10 XP, +10 points), inside the transaction so
      // the ledger's balanceAfter is the balance actually written.
      const balanceBefore = typeof userData.pointsBalance === "number" ? userData.pointsBalance : 0;
      tx.set(
        userRef,
        { pointsBalance: admin.firestore.FieldValue.increment(REVIEW_POINTS), updatedAt: now },
        { merge: true }
      );
      tx.set(userRef.collection("pointsTransactions").doc(), {
        points: REVIEW_POINTS,
        type: "earned",
        source: "review",
        sourceId: bookingId,
        description: "Punti per recensione",
        balanceAfter: balanceBefore + REVIEW_POINTS,
        createdAt: now,
      });

      return { instructorId, venueId };
    });

    // XP writes its own ledger; it is ancillary to the review, so it never fails the call.
    try {
      await awardXp(userId, REVIEW_XP, "review", `Recensione ${bookingId}`);
    } catch (xpErr) {
      console.error("[submitReview] awarding XP failed", bookingId, xpErr);
    }

    // Awaited: work left running after a v2 callable returns may never finish.
    const aggregates = await Promise.allSettled([
      instructorId ? updateInstructorRating(instructorId) : Promise.resolve(),
      venueId ? updateVenueRating(venueId) : Promise.resolve(),
    ]);
    for (const result of aggregates) {
      if (result.status === "rejected") {
        console.error("[submitReview] rating aggregation failed", bookingId, result.reason);
      }
    }

    return { reviewId: bookingId, pointsEarned: REVIEW_POINTS };
  }
);

/**
 * Recomputes a trainer's rating from their reviews. Written both at the top level
 * (`ratingAvg`/`reviewCount`, read by the profile) and under `providerProfile` (read by the
 * search cards), which is where application-created instructor docs keep it.
 */
export async function updateInstructorRating(instructorId: string): Promise<void> {
  const ref = db.collection("instructors").doc(instructorId);
  const reviews = await ref.collection("reviews").get();
  const { ratingAvg, reviewCount } = computeRatingSummary(reviews.docs.map((d) => d.data().rating));
  await ref.update({
    "ratingAvg": ratingAvg,
    "reviewCount": reviewCount,
    "providerProfile.rating": ratingAvg,
    "providerProfile.reviewCount": reviewCount,
    "updatedAt": admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function updateVenueRating(venueId: string): Promise<void> {
  const ref = db.collection("venues").doc(venueId);
  const reviews = await ref.collection("reviews").get();
  const { ratingAvg, reviewCount } = computeRatingSummary(reviews.docs.map((d) => d.data().rating));
  await ref.update({
    ratingAvg,
    reviewCount,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

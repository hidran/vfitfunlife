/**
 * submitReview against the Firestore emulator:
 *   firebase emulators:exec --only firestore "cd functions && npx vitest run test/reviews.test.ts"
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import functionsTest from "firebase-functions-test";
import * as admin from "firebase-admin";

const testEnv = functionsTest({ projectId: "demo-vfit-test" });

let reviewsModule: typeof import("../src/users/reviews");
let n = 0;
let ids: { client: string; trainer: string; booking: string };

beforeEach(async () => {
  reviewsModule = await import("../src/users/reviews");
  n += 1;
  const run = `${Date.now()}-${n}`;
  ids = { client: `rv-client-${run}`, trainer: `rv-trainer-${run}`, booking: `rv-booking-${run}` };
  const db = admin.firestore();
  await db.doc(`users/${ids.client}`).set({ fullName: "Sofia Rossi", pointsBalance: 40, role: "customer" });
  await db.doc(`instructors/${ids.trainer}`).set({
    fullName: "Coach Marco",
    ratingAvg: 0,
    reviewCount: 0,
    providerProfile: { isVerified: true, rating: 0, reviewCount: 0 },
  });
  // An older review, so the aggregate is a real average rather than the new rating alone.
  await db.doc(`instructors/${ids.trainer}/reviews/older`).set({ userName: "A", rating: 4, text: "ok" });
  await db.doc(`bookings/${ids.booking}`).set({
    userId: ids.client,
    instructorId: ids.trainer,
    venueId: null,
    serviceName: "Personal Training",
    status: "payment_confirmed",
    hasReviewed: false,
    reviewId: null,
  });
});

afterAll(() => {
  testEnv.cleanup();
});

const call = (uid: string, data: Record<string, unknown>) =>
  testEnv.wrap(reviewsModule.submitReview)({
    data,
    auth: { uid, token: {} as admin.auth.DecodedIdToken },
  } as never);

describe("submitReview", () => {
  it("stores one review for a payment_confirmed booking and updates the rating", async () => {
    const result = await call(ids.client, {
      bookingId: ids.booking, rating: 5, comment: "Sessione ottima", tags: ["punctual", "bogus"],
    });
    expect(result).toEqual({ reviewId: ids.booking, pointsEarned: 10 });

    const db = admin.firestore();
    const review = (await db.doc(`instructors/${ids.trainer}/reviews/${ids.booking}`).get()).data();
    expect(review).toMatchObject({
      userId: ids.client, userName: "Sofia Rossi", rating: 5, text: "Sessione ottima",
      tags: ["punctual"], isVerified: true, bookingId: ids.booking,
    });

    const booking = (await db.doc(`bookings/${ids.booking}`).get()).data();
    expect(booking).toMatchObject({ hasReviewed: true, reviewId: ids.booking });

    const trainer = (await db.doc(`instructors/${ids.trainer}`).get()).data();
    expect(trainer).toMatchObject({
      ratingAvg: 4.5, reviewCount: 2, providerProfile: { rating: 4.5, reviewCount: 2, isVerified: true },
    });

    const user = (await db.doc(`users/${ids.client}`).get()).data();
    expect(user?.pointsBalance).toBe(50);
    const ledger = await db.collection(`users/${ids.client}/pointsTransactions`).get();
    expect(ledger.docs.map((d) => d.data())).toEqual([
      expect.objectContaining({ points: 10, source: "review", sourceId: ids.booking, balanceAfter: 50 }),
    ]);
  });

  it("refuses a second review of the same booking", async () => {
    await call(ids.client, { bookingId: ids.booking, rating: 5, comment: "first" });
    await expect(call(ids.client, { bookingId: ids.booking, rating: 1, comment: "second" }))
      .rejects.toMatchObject({ code: "already-exists" });
    const review = await admin.firestore().doc(`instructors/${ids.trainer}/reviews/${ids.booking}`).get();
    expect(review.data()?.rating).toBe(5);
  });

  it("lets exactly one of two simultaneous submissions through", async () => {
    const results = await Promise.allSettled([
      call(ids.client, { bookingId: ids.booking, rating: 5 }),
      call(ids.client, { bookingId: ids.booking, rating: 2 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const user = (await admin.firestore().doc(`users/${ids.client}`).get()).data();
    expect(user?.pointsBalance).toBe(50);
  });

  it("refuses a booking that has not been delivered", async () => {
    await admin.firestore().doc(`bookings/${ids.booking}`).update({ status: "accepted" });
    await expect(call(ids.client, { bookingId: ids.booking, rating: 5 }))
      .rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("accepts a completed booking too", async () => {
    await admin.firestore().doc(`bookings/${ids.booking}`).update({ status: "completed" });
    await expect(call(ids.client, { bookingId: ids.booking, rating: 3 })).resolves.toMatchObject({
      reviewId: ids.booking,
    });
  });

  it("refuses someone else's booking and a bad rating", async () => {
    await expect(call(ids.trainer, { bookingId: ids.booking, rating: 5 }))
      .rejects.toMatchObject({ code: "permission-denied" });
    await expect(call(ids.client, { bookingId: ids.booking, rating: 6 }))
      .rejects.toMatchObject({ code: "invalid-argument" });
  });
});

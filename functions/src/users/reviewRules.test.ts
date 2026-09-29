import { describe, it, expect } from "vitest";
import {
  checkReviewable,
  computeRatingSummary,
  REVIEW_COMMENT_MAX_LENGTH,
  validateReviewInput,
} from "./reviewRules";

describe("validateReviewInput", () => {
  it("accepts a well-formed review and normalises it", () => {
    expect(
      validateReviewInput({
        bookingId: " b-1 ",
        rating: 5,
        comment: "  Ottima sessione\r\n\n\n\ngrazie\u0000  ",
        tags: ["punctual", "punctual", "made-up", 3],
      })
    ).toEqual({
      ok: true,
      value: { bookingId: "b-1", rating: 5, comment: "Ottima sessione\n\ngrazie", tags: ["punctual"] },
    });
  });

  it("allows a rating without a comment or tags", () => {
    expect(validateReviewInput({ bookingId: "b-1", rating: 3 })).toEqual({
      ok: true,
      value: { bookingId: "b-1", rating: 3, comment: "", tags: [] },
    });
  });

  it("refuses a missing or path-like booking id", () => {
    expect(validateReviewInput({ rating: 4 }).ok).toBe(false);
    expect(validateReviewInput({ bookingId: "a/b", rating: 4 }).ok).toBe(false);
    expect(validateReviewInput(null).ok).toBe(false);
  });

  it("refuses ratings that are not integers from 1 to 5", () => {
    for (const rating of [0, 6, 4.5, "5", null, NaN]) {
      expect(validateReviewInput({ bookingId: "b-1", rating }).ok).toBe(false);
    }
  });

  it("refuses an overlong comment", () => {
    expect(
      validateReviewInput({ bookingId: "b-1", rating: 4, comment: "x".repeat(REVIEW_COMMENT_MAX_LENGTH + 1) }).ok
    ).toBe(false);
    expect(
      validateReviewInput({ bookingId: "b-1", rating: 4, comment: "x".repeat(REVIEW_COMMENT_MAX_LENGTH) }).ok
    ).toBe(true);
  });
});

describe("checkReviewable", () => {
  const booking = (over: Record<string, unknown> = {}) => ({
    userId: "client-1",
    instructorId: "trainer-1",
    venueId: null,
    status: "completed",
    hasReviewed: false,
    reviewId: null,
    ...over,
  });

  it("accepts completed and payment_confirmed bookings", () => {
    expect(checkReviewable(booking(), "client-1")).toEqual({ ok: true });
    expect(checkReviewable(booking({ status: "payment_confirmed" }), "client-1")).toEqual({ ok: true });
  });

  it("refuses a booking that did not happen (yet)", () => {
    for (const status of ["requested", "accepted", "declined", "cancelled_by_client", "no_show"]) {
      expect(checkReviewable(booking({ status }), "client-1")).toEqual({ ok: false, reason: "not_delivered" });
    }
  });

  it("refuses a second review", () => {
    expect(checkReviewable(booking({ hasReviewed: true }), "client-1"))
      .toEqual({ ok: false, reason: "already_reviewed" });
    expect(checkReviewable(booking({ reviewId: "r-1" }), "client-1"))
      .toEqual({ ok: false, reason: "already_reviewed" });
  });

  it("refuses someone else's booking and a missing one", () => {
    expect(checkReviewable(booking(), "trainer-1")).toEqual({ ok: false, reason: "permission_denied" });
    expect(checkReviewable(undefined, "client-1")).toEqual({ ok: false, reason: "not_found" });
  });

  it("refuses a booking with nobody to review", () => {
    expect(checkReviewable(booking({ instructorId: null }), "client-1"))
      .toEqual({ ok: false, reason: "no_target" });
    expect(checkReviewable(booking({ instructorId: null, venueId: "v-1" }), "client-1")).toEqual({ ok: true });
  });
});

describe("computeRatingSummary", () => {
  it("averages to one decimal", () => {
    expect(computeRatingSummary([5, 4, 4])).toEqual({ ratingAvg: 4.3, reviewCount: 3 });
  });

  it("ignores non-ratings instead of counting them as zero", () => {
    expect(computeRatingSummary([5, undefined, "4", 0, 7, 3])).toEqual({ ratingAvg: 4, reviewCount: 2 });
  });

  it("is zero with no reviews", () => {
    expect(computeRatingSummary([])).toEqual({ ratingAvg: 0, reviewCount: 0 });
  });
});

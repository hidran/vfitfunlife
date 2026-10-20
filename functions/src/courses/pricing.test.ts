import { describe, expect, it } from "vitest";
import { applyDiscount, discountPercents, quoteSeries } from "./pricing";

describe("discountPercents", () => {
  it("adds the venue and active partner instructor percents", () => {
    expect(discountPercents({ memberDiscountPercent: 10, partnerInstructorExtraPercent: 5 }, true))
      .toEqual({ gymPercent: 10, instructorPercent: 5, percent: 15 });
  });
  it("ignores the instructor part when the instructor is not an active partner", () => {
    expect(discountPercents({ memberDiscountPercent: 10, partnerInstructorExtraPercent: 5 }, false))
      .toEqual({ gymPercent: 10, instructorPercent: 0, percent: 10 });
  });
  it("is zero without a venue", () => {
    expect(discountPercents(null, true)).toEqual({ gymPercent: 0, instructorPercent: 0, percent: 0 });
  });
  it("caps the total at 100", () => {
    expect(discountPercents({ memberDiscountPercent: 95, partnerInstructorExtraPercent: 10 }, true))
      .toEqual({ gymPercent: 95, instructorPercent: 10, percent: 100 });
  });
  it("clamps invalid stored values to integers between 0 and 100", () => {
    const bad = { memberDiscountPercent: -5, partnerInstructorExtraPercent: "x" as unknown as number };
    expect(discountPercents(bad, true)).toEqual({ gymPercent: 0, instructorPercent: 0, percent: 0 });
    expect(discountPercents({ memberDiscountPercent: 150, partnerInstructorExtraPercent: 7.9 }, true))
      .toEqual({ gymPercent: 100, instructorPercent: 7, percent: 100 });
    expect(discountPercents({ memberDiscountPercent: NaN }, true).percent).toBe(0);
    expect(discountPercents({}, true).percent).toBe(0);
  });
});

describe("applyDiscount", () => {
  it("floors the discount in cents", () => {
    expect(applyDiscount(1500, 15)).toEqual({ regularCents: 1500, discountCents: 225, finalCents: 1275 });
    expect(applyDiscount(100, 33)).toEqual({ regularCents: 100, discountCents: 33, finalCents: 67 });
    expect(applyDiscount(1, 99)).toEqual({ regularCents: 1, discountCents: 0, finalCents: 1 });
  });
  it("is free at 100 percent and for a free lesson", () => {
    expect(applyDiscount(1500, 100)).toEqual({ regularCents: 1500, discountCents: 1500, finalCents: 0 });
    expect(applyDiscount(0, 40)).toEqual({ regularCents: 0, discountCents: 0, finalCents: 0 });
  });
  it("clamps the percent and rejects invalid money", () => {
    expect(applyDiscount(1000, 150).finalCents).toBe(0);
    expect(applyDiscount(1000, -5).finalCents).toBe(1000);
    expect(() => applyDiscount(10.5, 10)).toThrow("invalid_price");
    expect(() => applyDiscount(-1, 10)).toThrow("invalid_price");
  });
});

describe("quoteSeries", () => {
  it("allocates first and discounts each allocation (R2)", () => {
    const quote = quoteSeries(4000, [15, 15, 15]);
    expect(quote).toEqual({ regularCents: 4000, discountCents: 598, finalCents: 3402,
      allocations: [1134, 1134, 1134], discounts: [200, 199, 199] });
    expect(quote.allocations.reduce((a, b) => a + b, 0)).toBe(quote.finalCents);
  });
  it("uses each lesson's own percent", () => {
    const quote = quoteSeries(4000, [15, 10, 15]);
    expect(quote.discounts).toEqual([200, 133, 199]);
    expect(quote.allocations).toEqual([1134, 1200, 1134]);
    expect(quote.finalCents).toBe(3468);
    expect(quote.discountCents).toBe(532);
    expect(quote.allocations.reduce((a, b) => a + b, 0)).toBe(quote.finalCents);
  });
  it("handles a free series and a single lesson", () => {
    expect(quoteSeries(0, [10, 10])).toEqual({ regularCents: 0, discountCents: 0, finalCents: 0,
      allocations: [0, 0], discounts: [0, 0] });
    expect(quoteSeries(1500, [15])).toMatchObject({ finalCents: 1275, discountCents: 225, allocations: [1275] });
  });
  it("rejects an empty lesson list", () => {
    expect(() => quoteSeries(1000, [])).toThrow("invalid_price");
  });
});

import { describe, it, expect } from "vitest";
import { computeBookingPricing, type PricingInput } from "./pricing";

// Same cases as src/lib/bookingPrice.test.ts — the checkout must show what the server charges.
const base: PricingInput = {
  service: { price: 50 },
  user: { isVip: false, pointsBalance: 0 },
  bookingType: "in_venue",
  promo: null,
  usePoints: false,
};

describe("computeBookingPricing", () => {
  it("charges the service price and nothing else (no platform fee)", () => {
    const p = computeBookingPricing(base);
    expect(p.finalPrice).toBe(50);
    expect(p.discountAmount).toBe(0);
    expect(p.pointsUsed).toBe(0);
    expect(p.pointsEarned).toBe(50);
  });

  it("applies a percentage promo capped by maxDiscount", () => {
    const p = computeBookingPricing({
      ...base,
      promo: { discountType: "percentage", discountValue: 20, maxDiscount: 5 },
    });
    expect(p.discountAmount).toBe(5);
    expect(p.finalPrice).toBe(45);
  });

  it("applies a fixed promo", () => {
    const p = computeBookingPricing({
      ...base,
      promo: { discountType: "fixed_amount", discountValue: 15 },
    });
    expect(p.finalPrice).toBe(35);
  });

  it("uses only as many points as the discounted price needs", () => {
    const p = computeBookingPricing({
      ...base,
      user: { pointsBalance: 10_000 },
      promo: { discountType: "fixed_amount", discountValue: 10 },
      usePoints: true,
    });
    expect(p.pointsUsed).toBe(4000);
    expect(p.pointsValue).toBeCloseTo(40);
    expect(p.finalPrice).toBe(0);
  });

  it("uses the whole balance when it does not cover the price", () => {
    const p = computeBookingPricing({ ...base, user: { pointsBalance: 1250 }, usePoints: true });
    expect(p.pointsUsed).toBe(1250);
    expect(p.finalPrice).toBeCloseTo(37.5);
  });

  it("ignores points unless the client opted in", () => {
    const p = computeBookingPricing({ ...base, user: { pointsBalance: 1250 }, usePoints: false });
    expect(p.pointsUsed).toBe(0);
    expect(p.finalPrice).toBe(50);
  });

  it("never uses negative points when a fixed promo exceeds the price", () => {
    const p = computeBookingPricing({
      ...base,
      user: { pointsBalance: 500 },
      promo: { discountType: "fixed_amount", discountValue: 80 },
      usePoints: true,
    });
    expect(p.pointsUsed).toBe(0);
    expect(p.finalPrice).toBe(0);
  });

  it("uses the VIP price for VIP clients", () => {
    const p = computeBookingPricing({
      ...base,
      service: { price: 50, vipPrice: 40 },
      user: { isVip: true },
    });
    expect(p.originalPrice).toBe(40);
    expect(p.finalPrice).toBe(40);
  });

  it("adds the home-service fee only for home sessions", () => {
    const service = { price: 50, isHomeService: true, homeServiceFee: 10 };
    expect(computeBookingPricing({ ...base, service }).finalPrice).toBe(50);
    expect(
      computeBookingPricing({ ...base, service, bookingType: "home_service" }).finalPrice
    ).toBe(60);
  });
});

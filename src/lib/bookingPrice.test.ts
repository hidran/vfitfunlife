import { describe, it, expect } from 'vitest';
import { computeBookingPrice, type BookingPriceInput } from './bookingPrice';

// Same cases as functions/src/bookings/pricing.test.ts — the checkout must show what the
// server will store as finalPrice.
const base: BookingPriceInput = {
  service: { price: 50 },
  user: { isVip: false, pointsBalance: 0 },
  bookingType: 'in_venue',
  promo: null,
  usePoints: false,
};

describe('computeBookingPrice', () => {
  it('is the service price with no platform fee', () => {
    const p = computeBookingPrice(base);
    expect(p.finalPrice).toBe(50);
    expect(p.discountAmount).toBe(0);
    expect(p.pointsUsed).toBe(0);
  });

  it('applies a percentage promo capped by maxDiscount', () => {
    const p = computeBookingPrice({
      ...base,
      promo: { discountType: 'percentage', discountValue: 20, maxDiscount: 5 },
    });
    expect(p.discountAmount).toBe(5);
    expect(p.finalPrice).toBe(45);
  });

  it('applies a fixed promo', () => {
    const p = computeBookingPrice({
      ...base,
      promo: { discountType: 'fixed_amount', discountValue: 15 },
    });
    expect(p.finalPrice).toBe(35);
  });

  it('uses only as many points as the discounted price needs', () => {
    const p = computeBookingPrice({
      ...base,
      user: { pointsBalance: 10_000 },
      promo: { discountType: 'fixed_amount', discountValue: 10 },
      usePoints: true,
    });
    expect(p.pointsUsed).toBe(4000);
    expect(p.pointsValue).toBeCloseTo(40);
    expect(p.finalPrice).toBe(0);
  });

  it('uses the whole balance when it does not cover the price', () => {
    const p = computeBookingPrice({ ...base, user: { pointsBalance: 1250 }, usePoints: true });
    expect(p.pointsUsed).toBe(1250);
    expect(p.finalPrice).toBeCloseTo(37.5);
  });

  it('ignores points unless the client opted in', () => {
    const p = computeBookingPrice({ ...base, user: { pointsBalance: 1250 }, usePoints: false });
    expect(p.pointsUsed).toBe(0);
    expect(p.finalPrice).toBe(50);
  });

  it('never uses negative points when a fixed promo exceeds the price', () => {
    const p = computeBookingPrice({
      ...base,
      user: { pointsBalance: 500 },
      promo: { discountType: 'fixed_amount', discountValue: 80 },
      usePoints: true,
    });
    expect(p.pointsUsed).toBe(0);
    expect(p.finalPrice).toBe(0);
  });

  it('uses the VIP price for VIP clients', () => {
    const p = computeBookingPrice({
      ...base,
      service: { price: 50, vipPrice: 40 },
      user: { isVip: true },
    });
    expect(p.originalPrice).toBe(40);
    expect(p.finalPrice).toBe(40);
  });

  it('adds the home-service fee only for home sessions', () => {
    const service = { price: 50, isHomeService: true, homeServiceFee: 10 };
    expect(computeBookingPrice({ ...base, service }).finalPrice).toBe(50);
    expect(computeBookingPrice({ ...base, service, bookingType: 'home_service' }).finalPrice).toBe(60);
  });

  it('treats a missing user as no VIP and no points', () => {
    expect(computeBookingPrice({ ...base, user: null, usePoints: true }).finalPrice).toBe(50);
  });
});

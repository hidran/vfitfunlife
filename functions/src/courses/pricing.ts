import { HttpsError } from "firebase-functions/v2/https";
import { allocatePrice } from "./core";

// Stripe refuses charges below 50 cents (EUR). Free bookings never reach Stripe, so only 0 < total < 50 is an error.
export const STRIPE_MIN_CENTS = 50;
export function assertStripeAmount(totalCents: number): void {
  if (totalCents > 0 && totalCents < STRIPE_MIN_CENTS) {
    throw new HttpsError("failed-precondition", "checkout_amount_too_low", { minCents: STRIPE_MIN_CENTS });
  }
}

export type VenuePricing = { memberDiscountPercent?: number; partnerInstructorExtraPercent?: number };

// Venue documents are written by admins through forms: never trust the stored shape.
function percent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.trunc(value)));
}
export function discountPercents(venue: VenuePricing | null, instructorPartnerActive: boolean):
  { gymPercent: number; instructorPercent: number; percent: number } {
  if (!venue) return { gymPercent: 0, instructorPercent: 0, percent: 0 };
  const gymPercent = percent(venue.memberDiscountPercent);
  const instructorPercent = instructorPartnerActive ? percent(venue.partnerInstructorExtraPercent) : 0;
  return { gymPercent, instructorPercent, percent: Math.min(100, gymPercent + instructorPercent) };
}
export function applyDiscount(regularCents: number, discountPercent: number):
  { regularCents: number; discountCents: number; finalCents: number } {
  if (!Number.isInteger(regularCents) || regularCents < 0) throw new Error("invalid_price");
  const discountCents = Math.floor(regularCents * percent(discountPercent) / 100);
  return { regularCents, discountCents, finalCents: regularCents - discountCents };
}
// R2: the series price is allocated first, then each allocation takes its own lesson's discount (floored).
// `allocations` are the post-discount amounts, so they sum to finalCents and refunds can use them as they are.
export function quoteSeries(seriesCents: number, percents: number[]):
  { regularCents: number; discountCents: number; finalCents: number; allocations: number[]; discounts: number[] } {
  const regular = allocatePrice(seriesCents, percents.length);
  const lines = regular.map((cents, i) => applyDiscount(cents, percents[i]));
  const discounts = lines.map((line) => line.discountCents);
  const allocations = lines.map((line) => line.finalCents);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  return { regularCents: seriesCents, discountCents: sum(discounts), finalCents: sum(allocations),
    allocations, discounts };
}

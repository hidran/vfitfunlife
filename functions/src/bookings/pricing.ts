/**
 * Booking price arithmetic — pure, so it can be tested and mirrored exactly.
 *
 * The checkout screen shows the same numbers via src/lib/bookingPrice.ts (functions can't
 * import from src/). Keep the two in sync; both test files use the same cases.
 */

/** 1 loyalty point = €0.01. */
export const POINTS_RATE = 0.01;

export interface PromoTerms {
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  maxDiscount?: number | null;
}

export interface PricingInput {
  service: {
    price: number;
    vipPrice?: number | null;
    isHomeService?: boolean;
    homeServiceFee?: number | null;
    requiresDeposit?: boolean;
    depositAmount?: number | null;
  };
  user: { isVip?: boolean; pointsBalance?: number };
  bookingType: string;
  /** An already-validated, currently-usable promotion, or null. */
  promo: PromoTerms | null;
  usePoints?: boolean;
}

export interface BookingPricing {
  originalPrice: number;
  discountAmount: number;
  homeServiceFee: number;
  finalPrice: number;
  depositAmount: number;
  pointsUsed: number;
  pointsValue: number;
  pointsEarned: number;
}

export function computeBookingPricing(input: PricingInput): BookingPricing {
  const { service, user, bookingType, promo, usePoints } = input;

  let originalPrice = service.price;
  if (user.isVip && service.vipPrice) originalPrice = service.vipPrice;

  const homeServiceFee = bookingType === "home_service" && service.isHomeService ?
    service.homeServiceFee || 0 :
    0;

  let discountAmount = 0;
  if (promo) {
    if (promo.discountType === "percentage") {
      discountAmount = (originalPrice * promo.discountValue) / 100;
      if (promo.maxDiscount) discountAmount = Math.min(discountAmount, promo.maxDiscount);
    } else if (promo.discountType === "fixed_amount") {
      discountAmount = promo.discountValue;
    }
  }

  // "Use my points" is all-or-nothing: as many points as cover the discounted price.
  let pointsUsed = 0;
  let pointsValue = 0;
  const pointsBalance = user.pointsBalance ?? 0;
  if (usePoints && pointsBalance > 0) {
    const maxPointsToUse = Math.floor((originalPrice - discountAmount) / POINTS_RATE);
    pointsUsed = Math.max(0, Math.min(pointsBalance, maxPointsToUse));
    pointsValue = pointsUsed * POINTS_RATE;
  }

  const finalPrice = Math.max(0, originalPrice - discountAmount - pointsValue + homeServiceFee);
  const depositAmount = service.requiresDeposit ? (service.depositAmount || finalPrice * 0.3) : 0;
  const pointsEarned = Math.floor(finalPrice);

  return {
    originalPrice,
    discountAmount,
    homeServiceFee,
    finalPrice,
    depositAmount,
    pointsUsed,
    pointsValue,
    pointsEarned,
  };
}

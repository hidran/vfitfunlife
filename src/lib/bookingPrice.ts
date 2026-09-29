/**
 * What a booking will cost, computed exactly as the server's `createBooking` does.
 *
 * Mirror of functions/src/bookings/pricing.ts (functions can't share code with src/); the
 * two test files use the same cases. There is no platform fee: payment happens off-platform,
 * directly to the trainer, and the total shown at checkout is the booking's `finalPrice`.
 */

/** 1 loyalty point = €0.01. */
export const POINTS_RATE = 0.01;

export interface PromoTerms {
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  maxDiscount?: number | null;
}

export interface BookingPriceInput {
  service: {
    price: number;
    vipPrice?: number | null;
    isHomeService?: boolean;
    homeServiceFee?: number | null;
  };
  user: { isVip?: boolean; pointsBalance?: number } | null | undefined;
  bookingType: string;
  promo: PromoTerms | null;
  usePoints: boolean;
}

export interface BookingPrice {
  originalPrice: number;
  discountAmount: number;
  homeServiceFee: number;
  pointsUsed: number;
  pointsValue: number;
  finalPrice: number;
}

export function computeBookingPrice(input: BookingPriceInput): BookingPrice {
  const { service, bookingType, promo, usePoints } = input;
  const user = input.user ?? {};

  let originalPrice = service.price;
  if (user.isVip && service.vipPrice) originalPrice = service.vipPrice;

  const homeServiceFee =
    bookingType === 'home_service' && service.isHomeService ? service.homeServiceFee || 0 : 0;

  let discountAmount = 0;
  if (promo) {
    if (promo.discountType === 'percentage') {
      discountAmount = (originalPrice * promo.discountValue) / 100;
      if (promo.maxDiscount) discountAmount = Math.min(discountAmount, promo.maxDiscount);
    } else if (promo.discountType === 'fixed_amount') {
      discountAmount = promo.discountValue;
    }
  }

  // "Use my points" is all-or-nothing on the server: as many as cover the discounted price.
  let pointsUsed = 0;
  let pointsValue = 0;
  const pointsBalance = user.pointsBalance ?? 0;
  if (usePoints && pointsBalance > 0) {
    const maxPointsToUse = Math.floor((originalPrice - discountAmount) / POINTS_RATE);
    pointsUsed = Math.max(0, Math.min(pointsBalance, maxPointsToUse));
    pointsValue = pointsUsed * POINTS_RATE;
  }

  const finalPrice = Math.max(0, originalPrice - discountAmount - pointsValue + homeServiceFee);

  return { originalPrice, discountAmount, homeServiceFee, pointsUsed, pointsValue, finalPrice };
}

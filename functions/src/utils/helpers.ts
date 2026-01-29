import * as ngeohash from "ngeohash";

/**
 * Generate a unique referral code for a user
 */
export function generateReferralCode(userId: string): string {
  const prefix = "VFIT";
  const suffix = userId.substring(0, 6).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}${suffix}${random}`;
}

/**
 * Calculate geohash from coordinates
 */
export function calculateGeohash(latitude: number, longitude: number, precision = 9): string {
  return ngeohash.encode(latitude, longitude, precision);
}

/**
 * Get geohash bounds for a radius search
 */
export function getGeohashesForRadius(
  latitude: number,
  longitude: number,
  radiusKm: number
): string[] {
  // Approximate geohash precision based on radius
  let precision: number;
  if (radiusKm <= 0.5) precision = 7;
  else if (radiusKm <= 2) precision = 6;
  else if (radiusKm <= 10) precision = 5;
  else if (radiusKm <= 50) precision = 4;
  else precision = 3;

  const centerHash = ngeohash.encode(latitude, longitude, precision);
  const neighbors = ngeohash.neighbors(centerHash);

  return [centerHash, ...Object.values(neighbors)];
}

/**
 * Calculate distance between two points in km (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Format currency in EUR
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/**
 * Sanitize user input
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/<[^>]*>/g, "");
}

/**
 * Generate a random booking confirmation code
 */
export function generateBookingCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Validate Italian phone number
 */
export function isValidItalianPhone(phone: string): boolean {
  // Remove spaces and dashes
  const cleaned = phone.replace(/[\s-]/g, "");
  // Italian mobile: starts with 3, 10 digits total
  // Italian landline: starts with 0, 9-10 digits total
  const mobileRegex = /^(\+39)?3\d{9}$/;
  const landlineRegex = /^(\+39)?0\d{8,9}$/;
  return mobileRegex.test(cleaned) || landlineRegex.test(cleaned);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Calculate points value in EUR
 */
export function pointsToEur(points: number): number {
  const pointsRate = 0.01; // 1 point = €0.01
  return points * pointsRate;
}

/**
 * Calculate points from EUR amount
 */
export function eurToPoints(eur: number): number {
  return Math.floor(eur); // 1 EUR = 1 point earned
}

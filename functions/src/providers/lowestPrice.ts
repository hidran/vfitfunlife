/**
 * Pure price selection for the instructor `lowestPrice` denormalization.
 *
 * Split out from the trigger so it can be tested without firebase-admin or an emulator —
 * the trigger itself is then only Firestore plumbing.
 */
export interface ServiceLike {
  price?: unknown;
  isActive?: unknown;
}

/**
 * Cheapest ACTIVE service price, or null when there is nothing sellable.
 *
 * Only active services count: a deactivated service cannot be booked, so advertising its
 * price sends clients to a provider they cannot buy from at that price.
 *
 * `isActive !== false` rather than `=== true`: legacy documents predate the field, and
 * flattenProvider already treats a missing isActive as active. Requiring `true` would
 * silently drop those providers' prices.
 */
export function lowestActivePrice(services: ServiceLike[]): number | null {
  const prices = services
    .filter((s) => s.isActive !== false)
    .map((s) => s.price)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p >= 0);

  return prices.length ? Math.min(...prices) : null;
}

import { withAncestors } from "../categories/tree";
import type { ServiceLike } from "./lowestPrice";

/**
 * The distinct categories of a provider's ACTIVE services, expanded to include ancestors.
 *
 * Pure, so it can be tested without firebase-admin or an emulator.
 *
 * Only active services count, for the same reason `lowestPrice` ignores them: a
 * deactivated service cannot be booked, so surfacing the provider under its category
 * sends clients to something they cannot buy.
 *
 * Ancestors are included so a single `array-contains` filters at any depth — a boxing
 * trainer is found by both `boxing` and `combat`.
 */
export function activeCategoryIds(services: ServiceLike[]): string[] {
  const out = new Set<string>();
  for (const s of services) {
    // `!== false`, matching lowestActivePrice: documents predating the field count as
    // active, and flattenProvider already treats a missing isActive that way.
    if (s.isActive === false) continue;
    const categoryId = (s as { categoryId?: unknown }).categoryId;
    if (typeof categoryId !== "string" || !categoryId) continue;
    for (const id of withAncestors(categoryId)) out.add(id);
  }
  // Sorted so the stored array is stable: an unordered rewrite would churn the document
  // and re-trigger downstream watchers on every unrelated service edit.
  return [...out].sort();
}

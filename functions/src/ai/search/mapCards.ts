import { ResultCard } from "../types";

/**
 * Map an instructors/{id} doc to a public-safe ResultCard. Never include
 * phone/email. Reads are dual-shape aware (mirror flattenProvider): flat fields
 * first, then nested `providerProfile`, so both the canonical seeded shape and
 * legacy nested-only docs produce correct cards.
 */
export function instructorDocToCard(
  id: string,
  data: Record<string, unknown>,
  matchingSlots?: string[],
): ResultCard {
  const pp = (data.providerProfile ?? {}) as Record<string, unknown>;
  const card: ResultCard = {
    kind: "instructor",
    id,
    title: (typeof data.fullName === "string" ? data.fullName : undefined) ?? "Provider",
    bookingHref: `/book?providerId=${id}`,
  };

  const specialties: unknown = Array.isArray(data.specialties) ? data.specialties :
    Array.isArray(pp.specialties) ? pp.specialties :
      undefined;
  if (Array.isArray(specialties) && specialties.length) card.subtitle = specialties.join(", ");

  if (typeof data.avatarUrl === "string") card.imageUrl = data.avatarUrl;

  const rating = typeof data.ratingAvg === "number" ? data.ratingAvg :
    typeof pp.rating === "number" ? pp.rating :
      undefined;
  if (typeof rating === "number") card.rating = rating;

  const reviewCount = typeof data.reviewCount === "number" ? data.reviewCount :
    typeof pp.reviewCount === "number" ? pp.reviewCount :
      undefined;
  if (typeof reviewCount === "number") card.reviewCount = reviewCount;

  // Price: prefer flat lowestPrice ("Da €N"), else hourlyRate ("€N/h"). Omit
  // when falsy/0.
  if (typeof data.lowestPrice === "number" && data.lowestPrice > 0) {
    card.priceLabel = `Da €${data.lowestPrice}`;
  } else if (typeof data.hourlyRate === "number" && data.hourlyRate > 0) {
    card.priceLabel = `€${data.hourlyRate}/h`;
  }

  if (matchingSlots && matchingSlots.length) card.matchingSlots = matchingSlots;
  return card;
}

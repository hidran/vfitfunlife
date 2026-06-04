import { ResultCard } from "../types";

/** Map a /users provider doc to a public-safe ResultCard. Never include PII (phone/email). */
export function providerDocToCard(id: string, data: Record<string, any>, matchingSlots?: string[]): ResultCard {
  const pp = data.providerProfile ?? {};
  const card: ResultCard = {
    kind: "provider",
    id,
    title: data.fullName ?? "Provider",
    bookingHref: `/book?providerId=${id}`,
  };
  if (Array.isArray(pp.specialties) && pp.specialties.length) card.subtitle = pp.specialties.join(", ");
  if (data.avatarUrl) card.imageUrl = data.avatarUrl;
  if (typeof pp.rating === "number") card.rating = pp.rating;
  if (typeof pp.reviewCount === "number") card.reviewCount = pp.reviewCount;
  if (typeof pp.hourlyRate === "number") card.priceLabel = `€${pp.hourlyRate}/h`;
  if (matchingSlots && matchingSlots.length) card.matchingSlots = matchingSlots;
  return card;
}

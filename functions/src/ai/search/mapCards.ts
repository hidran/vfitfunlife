import { ResultCard } from "../types";

/** Map an instructors/{id} doc (canonical flat shape) to a public-safe ResultCard. Never include phone/email. */
export function instructorDocToCard(id: string, data: Record<string, any>, matchingSlots?: string[]): ResultCard {
  const card: ResultCard = {
    kind: "instructor",
    id,
    title: data.fullName ?? "Provider",
    bookingHref: `/book?providerId=${id}`,
  };
  if (Array.isArray(data.specialties) && data.specialties.length) card.subtitle = data.specialties.join(", ");
  if (data.avatarUrl) card.imageUrl = data.avatarUrl;
  if (typeof data.ratingAvg === "number") card.rating = data.ratingAvg;
  if (typeof data.reviewCount === "number") card.reviewCount = data.reviewCount;
  if (typeof data.hourlyRate === "number" && data.hourlyRate > 0) card.priceLabel = `€${data.hourlyRate}/h`;
  if (matchingSlots && matchingSlots.length) card.matchingSlots = matchingSlots;
  return card;
}

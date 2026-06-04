import { describe, it, expect } from "vitest";
import { providerDocToCard } from "./mapCards";

describe("providerDocToCard", () => {
  it("maps a provider user doc to a public-safe ResultCard", () => {
    const card = providerDocToCard("u1", {
      fullName: "Mario Rossi",
      avatarUrl: "https://x/a.jpg",
      phone: "+39123",          // must NOT leak
      email: "m@x.it",          // must NOT leak
      providerProfile: {
        specialties: ["Personal Training"],
        rating: 4.8,
        reviewCount: 22,
        hourlyRate: 40,
      },
    }, ["Mon 15:00–17:00"]);

    expect(card).toEqual({
      kind: "provider",
      id: "u1",
      title: "Mario Rossi",
      subtitle: "Personal Training",
      imageUrl: "https://x/a.jpg",
      rating: 4.8,
      reviewCount: 22,
      priceLabel: "€40/h",
      matchingSlots: ["Mon 15:00–17:00"],
      bookingHref: "/book?providerId=u1",
    });
    expect(JSON.stringify(card)).not.toContain("+39123");
    expect(JSON.stringify(card)).not.toContain("m@x.it");
  });
});

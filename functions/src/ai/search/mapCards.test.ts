import { describe, it, expect } from "vitest";
import { instructorDocToCard } from "./mapCards";

describe("instructorDocToCard", () => {
  it("maps an instructors/{id} doc (flat shape) to a public-safe ResultCard", () => {
    const card = instructorDocToCard("i1", {
      fullName: "Mario Rossi",
      avatarUrl: "https://x/a.jpg",
      phone: "+39123",          // must NOT leak
      email: "m@x.it",          // must NOT leak
      userType: "personal_trainer",
      city: "Torino",
      specialties: ["Personal Training"],
      languages: ["it", "en"],
      ratingAvg: 4.8,
      reviewCount: 22,
      hourlyRate: 40,
      isVerified: true,
      isActive: true,
    }, ["Mon 15:00–17:00"]);

    expect(card).toEqual({
      kind: "instructor",
      id: "i1",
      title: "Mario Rossi",
      subtitle: "Personal Training",
      imageUrl: "https://x/a.jpg",
      rating: 4.8,
      reviewCount: 22,
      priceLabel: "€40/h",
      matchingSlots: ["Mon 15:00–17:00"],
      bookingHref: "/book?providerId=i1",
    });
    expect(JSON.stringify(card)).not.toContain("+39123");
    expect(JSON.stringify(card)).not.toContain("m@x.it");
  });

  it("omits optional fields and price when hourlyRate is 0 / missing", () => {
    const card = instructorDocToCard("i2", {
      fullName: "Lucia Bianchi",
      hourlyRate: 0,
    });
    expect(card).toEqual({
      kind: "instructor",
      id: "i2",
      title: "Lucia Bianchi",
      bookingHref: "/book?providerId=i2",
    });
  });

  it("falls back to a default title when fullName missing", () => {
    const card = instructorDocToCard("i3", {});
    expect(card.title).toBe("Provider");
  });
});

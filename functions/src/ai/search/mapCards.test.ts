import { describe, it, expect } from "vitest";
import { instructorDocToCard } from "./mapCards";

describe("instructorDocToCard", () => {
  it("maps a flat-shape instructors/{id} doc to a public-safe ResultCard", () => {
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
      isActive: true,
      providerProfile: { isVerified: true },
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

  it("maps a NESTED-only doc (specialties/rating/reviewCount under providerProfile)", () => {
    const card = instructorDocToCard("iN", {
      fullName: "Lucia Bianchi",
      avatarUrl: "https://x/b.jpg",
      providerProfile: {
        isVerified: true,
        specialties: ["Yoga", "Pilates"],
        rating: 4.5,
        reviewCount: 10,
      },
      hourlyRate: 30,
    });
    expect(card).toEqual({
      kind: "instructor",
      id: "iN",
      title: "Lucia Bianchi",
      subtitle: "Yoga, Pilates",
      imageUrl: "https://x/b.jpg",
      rating: 4.5,
      reviewCount: 10,
      priceLabel: "€30/h",
      bookingHref: "/book?providerId=iN",
    });
  });

  it("prefers lowestPrice ('Da €N') over hourlyRate when present", () => {
    const card = instructorDocToCard("iP", {
      fullName: "Marco Verdi",
      lowestPrice: 25,
      hourlyRate: 40,
    });
    expect(card.priceLabel).toBe("Da €25");
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

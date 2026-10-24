import { describe, it, expect } from "vitest";
import { VENUE_TYPES, venueDocSchema } from "./venueSchema";
import { BUSINESS_VENUE_TYPES } from "../types";
import { planBusinessVenue } from "../providers/businessVenue";

const canonical = {
  name: "Karate Club Milano",
  slug: "karate-club-milano",
  type: "gym",
  city: "Milano",
  address: "Via Po 2",
  zipCode: "20100",
  country: "IT",
  lat: 45.46,
  lng: 9.19,
  rating: 0,
  reviewCount: 0,
  isPartner: false,
  partnerStatus: "pending",
  isActive: true,
  description: "",
  heroGradients: ["from-vfit-primary/35 via-vfit-accent/25 to-transparent"],
  amenities: [{ kind: "weights" }],
  hours: [{ day: "Lun - Ven", time: "07:00 - 22:00" }],
  photoUrls: [],
  createdAt: "NOW",
  updatedAt: "NOW",
};

describe("venueDocSchema", () => {
  it("accepts the canonical document", () => {
    expect(venueDocSchema.safeParse(canonical).success).toBe(true);
  });

  it("lists every platform venue type and nothing else", () => {
    // BUSINESS_VENUE_TYPES is VenueType plus "none".
    expect([...VENUE_TYPES].sort()).toEqual(BUSINESS_VENUE_TYPES.filter((t) => t !== "none").sort());
  });

  it("refuses the legacy shapes the seeders and the old admin form wrote", () => {
    const legacyAddress = {
      ...canonical,
      address: { street: "Via Po 2", city: "Milano", zipCode: "20100", country: "IT", latitude: 45.46, longitude: 9.19 },
    };
    expect(venueDocSchema.safeParse(legacyAddress).success).toBe(false);
    expect(venueDocSchema.safeParse({ ...canonical, type: "fitness" }).success).toBe(false);
    expect(venueDocSchema.safeParse({ ...canonical, type: "wellness" }).success).toBe(false);
    // Unknown keys are legacy fields creeping back, not extensions.
    expect(venueDocSchema.safeParse({ ...canonical, openingHours: {} }).success).toBe(false);
    expect(venueDocSchema.safeParse({ ...canonical, images: [] }).success).toBe(false);
    expect(venueDocSchema.safeParse({ ...canonical, neighborhood: "Brera" }).success).toBe(false);
    // Coordinates are the flat pair, not nested — and required.
    const { lat: _lat, lng: _lng, ...noCoords } = canonical;
    expect(venueDocSchema.safeParse(noCoords).success).toBe(false);
    expect(venueDocSchema.safeParse({ ...canonical, zipCode: 20100 }).success).toBe(false);
  });

  it("the venue a company approval creates is canonical too", () => {
    const plan = planBusinessVenue({
      providerId: "biz-owner",
      decision: "verified",
      instructor: {
        city: "Milano",
        lat: 45.46,
        lng: 9.19,
        business: { displayName: "Karate Club Milano", legalName: "Karate Club S.r.l.", venueType: "gym", address: "Via Po 2" },
      },
      existing: { exists: false },
      now: "NOW",
    });
    expect(plan?.kind).toBe("create");
    if (plan?.kind !== "create") throw new Error("expected a create plan");
    const result = venueDocSchema.safeParse(plan.venue);
    expect(result.success, result.success ? "" : result.error.message).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  DEMO_CITIES,
  DEMO_VENUE_SLOTS,
  SAMPLE_VENUES,
  demoVenueDoc,
  demoVenueId,
  demoVenueServices,
  randomVenueDoc,
  sampleVenueDoc,
} from "./seedVenues";
import { venueDocSchema, venueServiceDocSchema } from "../venues/venueSchema";

const NOW = { seconds: 1_760_000_000, nanoseconds: 0 };

/** Fails with zod's own message, naming the venue, instead of a bare "expected true". */
function expectCanonical(venue: unknown, label: string) {
  const result = venueDocSchema.safeParse(venue);
  expect(result.success, `${label}: ${result.success ? "" : result.error.message}`).toBe(true);
}

describe("every seeded venue is canonical (venues/venueSchema.ts)", () => {
  it("seedVenues(count): the generic random venues", () => {
    for (let i = 0; i < 60; i++) {
      const venue = randomVenueDoc(`venue_test_${i}`, NOW);
      expectCanonical(venue, venue.name);
      // The legacy shape this seeder used to write, pinned individually so a regression names itself.
      expect(typeof venue.address).toBe("string");
      expect(["gym", "wellness_center"]).toContain(venue.type);
      expect(venue).not.toHaveProperty("openingHours");
      expect(venue).not.toHaveProperty("images");
      expect(venue).not.toHaveProperty("neighborhood");
      expect(typeof venue.zipCode).toBe("string");
    }
  });

  it("seedSampleVenues: the deterministic sample venues, and their services", () => {
    expect(SAMPLE_VENUES.length).toBeGreaterThan(0);
    for (const v of SAMPLE_VENUES) {
      const venue = sampleVenueDoc(v, NOW);
      expectCanonical(venue, v.id);
      expect(venue).not.toHaveProperty("services");
      // Street line only: the city is its own field, never repeated in the address.
      expect(venue.address.endsWith(`, ${venue.city}`)).toBe(false);
      for (const svc of v.services) {
        expect(venueServiceDocSchema.safeParse(svc).success, `${v.id}/${svc.id}`).toBe(true);
      }
    }
    expect(new Set(SAMPLE_VENUES.map((v) => v.id)).size).toBe(SAMPLE_VENUES.length);
  });

  it("generateDemoData: ten venues per demo city, every one canonical", () => {
    expect(DEMO_VENUE_SLOTS).toHaveLength(10);
    const ids = new Set<string>();
    for (const [cityIndex, city] of DEMO_CITIES.entries()) {
      for (const slot of DEMO_VENUE_SLOTS) {
        const id = demoVenueId(city, slot);
        ids.add(id);
        const venue = demoVenueDoc(city, cityIndex, slot, NOW);
        expectCanonical(venue, id);
        expect(venue.type).toBe(slot.type);
        expect(venue.city).toBe(city.name);
        expect(venue.address.endsWith(`, ${city.name}`)).toBe(false);
        // Within ~2 km of the city centre.
        expect(Math.abs(venue.lat - city.lat)).toBeLessThanOrEqual(0.02);
        expect(Math.abs(venue.lng - city.lng)).toBeLessThanOrEqual(0.02);
      }
    }
    expect(ids.size).toBe(DEMO_CITIES.length * DEMO_VENUE_SLOTS.length);
    expect(demoVenueId(DEMO_CITIES[0], { type: "wellness_center", index: 2 }))
      .toBe("demo-venue-milano-wellness-center-2");
  });

  it("generateDemoData: 2–5 services per venue, each canonical", () => {
    for (const type of ["gym", "wellness_center", "spa", "beauty_salon"] as const) {
      for (let i = 0; i < 10; i++) {
        const services = demoVenueServices(type);
        expect(services.length).toBeGreaterThanOrEqual(2);
        expect(services.length).toBeLessThanOrEqual(5);
        for (const svc of services) {
          expect(venueServiceDocSchema.safeParse(svc.data).success, `${type}/${svc.id}`).toBe(true);
        }
      }
    }
  });
});

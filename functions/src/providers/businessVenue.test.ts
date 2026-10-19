import { describe, it, expect } from "vitest";
import {
  buildBusinessVenue,
  businessVenueType,
  venueLocationPatch,
  venueSlug,
} from "./businessVenue";

const NOW = { __sentinel: "serverTimestamp" };

const business = {
  legalName: "Palestra Rossi S.r.l.",
  vatNumber: "01234567897",
  displayName: "Palestra Rossi",
  description: "Functional training",
  city: "Torino",
  address: "Via Po 2",
};

const build = (instructor: Record<string, unknown>) =>
  buildBusinessVenue({ providerId: "biz1", instructor, now: NOW });

describe("businessVenueType", () => {
  it("defaults to gym when absent", () => {
    expect(businessVenueType({})).toBe("gym");
    expect(businessVenueType({ venueType: null })).toBe("gym");
  });
  it("passes the three hosting types and none through", () => {
    for (const t of ["gym", "school", "studio", "none"]) expect(businessVenueType({ venueType: t })).toBe(t);
  });
  it("treats anything else as none rather than inventing a venue type", () => {
    expect(businessVenueType({ venueType: "spa" })).toBe("none");
    expect(businessVenueType({ venueType: 3 })).toBe("none");
  });
});

describe("venueSlug", () => {
  it("is ASCII kebab-case of name and city", () => {
    expect(venueSlug("Scuola di Danza Città", "Reggio Emilia")).toBe("scuola-di-danza-citta-reggio-emilia");
  });
  it("omits an empty city and falls back when nothing is left", () => {
    expect(venueSlug("Palestra Rossi", "")).toBe("palestra-rossi");
    expect(venueSlug("!!!", "")).toBe("venue");
  });
});

describe("buildBusinessVenue", () => {
  it("builds the pending, owned venue from the business map", () => {
    expect(build({ business })).toEqual({
      name: "Palestra Rossi",
      slug: "palestra-rossi-torino",
      type: "gym",
      city: "Torino",
      address: "Via Po 2",
      ownerId: "biz1",
      partnerStatus: "pending",
      isPartner: false,
      isActive: true,
      memberDiscountPercent: 0,
      partnerInstructorExtraPercent: 0,
      rating: 0,
      reviewCount: 0,
      description: "Functional training",
      heroGradients: [expect.any(String)],
      amenities: [],
      hours: [],
      photoUrls: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("uses the venue type chosen on the application", () => {
    expect(build({ business: { ...business, venueType: "school" } })?.type).toBe("school");
    expect(build({ business: { ...business, venueType: "studio" } })?.type).toBe("studio");
  });

  it("prefers the instructor's city and copies valid coordinates", () => {
    const venue = build({ business, city: "Milano", lat: 45.46, lng: 9.19 });
    expect(venue).toMatchObject({ city: "Milano", lat: 45.46, lng: 9.19 });
  });

  it("omits the geo fields when the coordinates are missing, invalid or (0,0)", () => {
    for (const geo of [{}, { lat: 0, lng: 0 }, { lat: "45", lng: 9 }, { lat: NaN, lng: 9 }, { lat: 95, lng: 9 }]) {
      const venue = build({ business, ...geo }) as Record<string, unknown>;
      expect(venue).not.toHaveProperty("lat");
      expect(venue).not.toHaveProperty("lng");
    }
  });

  it("falls back to business.city, then to empty strings", () => {
    expect(build({ business })?.city).toBe("Torino");
    const bare = build({ business: { displayName: "Solo Nome" } });
    expect(bare).toMatchObject({ city: "", address: "", description: "", slug: "solo-nome" });
  });

  it("creates nothing for venueType none, an existing venueId, no business map or no name", () => {
    expect(build({ business: { ...business, venueType: "none" } })).toBeNull();
    expect(build({ business: { ...business, venueId: "v1" } })).toBeNull();
    expect(build({})).toBeNull();
    expect(build({ business: { ...business, displayName: "  ", legalName: "" } })).toBeNull();
  });

  it("names the venue after the legal name when the display name is blank", () => {
    expect(build({ business: { ...business, displayName: "" } })?.name).toBe("Palestra Rossi S.r.l.");
  });

  it("writes no dotted keys", () => {
    expect(Object.keys(build({ business, lat: 45.1, lng: 7.6 }) ?? {}).filter((k) => k.includes("."))).toEqual([]);
  });
});

describe("venueLocationPatch", () => {
  const loc = { lat: 45.07, lng: 7.69, city: "Torino" };

  it("mirrors coordinates and city when they change", () => {
    expect(venueLocationPatch({ lat: 1, lng: 2, city: "Roma" }, loc)).toEqual(loc);
  });
  it("mirrors the first location a provider ever saves", () => {
    expect(venueLocationPatch({}, loc)).toEqual(loc);
    expect(venueLocationPatch(undefined, loc)).toEqual(loc);
  });
  it("is null when nothing location-related changed", () => {
    expect(venueLocationPatch(loc, { ...loc, bio: "changed" })).toBeNull();
  });
  it("patches only the part that changed", () => {
    expect(venueLocationPatch(loc, { ...loc, city: "Moncalieri" })).toEqual({ city: "Moncalieri" });
    expect(venueLocationPatch(loc, { ...loc, lat: 45.0, lng: 7.6 })).toEqual({ lat: 45.0, lng: 7.6 });
  });
  it("never mirrors invalid coordinates or an empty city (no wiping the venue)", () => {
    expect(venueLocationPatch(loc, { ...loc, lat: 0, lng: 0 })).toBeNull();
    expect(venueLocationPatch(loc, { ...loc, lat: NaN })).toBeNull();
    expect(venueLocationPatch(loc, { ...loc, city: "" })).toBeNull();
    expect(venueLocationPatch(loc, { lat: undefined, lng: undefined, city: undefined })).toBeNull();
  });
  it("is null when the document was deleted", () => {
    expect(venueLocationPatch(loc, undefined)).toBeNull();
  });
});

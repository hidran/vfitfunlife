import { describe, it, expect } from "vitest";
import {
  buildBusinessVenue,
  businessVenueId,
  businessVenueType,
  planBusinessVenue,
  venueDeactivationPatch,
  venueLocationPatch,
  venueNamePatch,
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
  venueType: "gym",
};

const build = (instructor: Record<string, unknown>) =>
  buildBusinessVenue({ providerId: "biz1", instructor, now: NOW });

describe("businessVenueType", () => {
  it("treats an absent venue type as none: a legacy company never asked for premises", () => {
    expect(businessVenueType({})).toBe("none");
    expect(businessVenueType({ venueType: null })).toBe("none");
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
  it("transliterates letters NFD does not decompose", () => {
    expect(venueSlug("Straße Æsir Øst Œuvre", "Łódź")).toBe("strasse-aesir-ost-oeuvre-lodz");
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
    const bare = build({ business: { displayName: "Solo Nome", venueType: "gym" } });
    expect(bare).toMatchObject({ city: "", address: "", description: "", slug: "solo-nome" });
  });

  it("builds nothing for venueType none or absent, no business map or no name", () => {
    expect(build({ business: { ...business, venueType: "none" } })).toBeNull();
    const { venueType: _omit, ...legacy } = business;
    expect(build({ business: legacy })).toBeNull();
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

describe("venueNamePatch", () => {
  const biz = (displayName: unknown) => ({ business: { displayName } });

  it("mirrors a changed public name", () => {
    expect(venueNamePatch(biz("Old"), biz("New"))).toEqual({ name: "New" });
  });
  it("trims it, like the name the venue was created with", () => {
    expect(venueNamePatch(biz("Old"), biz("  New  "))).toEqual({ name: "New" });
  });
  it("is null when the name is unchanged or the edit is unrelated", () => {
    expect(venueNamePatch(biz("Same"), { ...biz("Same"), bio: "x" })).toBeNull();
    expect(venueNamePatch(biz("Same"), biz(" Same "))).toBeNull();
  });
  it("mirrors the first name when there is no earlier one (the re-read of the current document)", () => {
    expect(venueNamePatch(undefined, biz("New"))).toEqual({ name: "New" });
    expect(venueNamePatch({}, biz("New"))).toEqual({ name: "New" });
  });
  it("never blanks the venue: an empty, missing or non-string name is ignored", () => {
    expect(venueNamePatch(biz("Old"), biz(""))).toBeNull();
    expect(venueNamePatch(biz("Old"), biz("   "))).toBeNull();
    expect(venueNamePatch(biz("Old"), biz(7))).toBeNull();
    expect(venueNamePatch(biz("Old"), { business: {} })).toBeNull();
    expect(venueNamePatch(biz("Old"), {})).toBeNull();
  });
  it("is null when the document was deleted, and never touches the slug", () => {
    expect(venueNamePatch(biz("Old"), undefined)).toBeNull();
    expect(Object.keys(venueNamePatch(biz("Old"), biz("New")) ?? {})).toEqual(["name"]);
  });
});

describe("planBusinessVenue", () => {
  const input = { providerId: "biz1", instructor: { business }, now: NOW, decision: "verified" as const, existing: undefined };
  const own = (extra: Record<string, unknown> = {}) => ({ exists: true, data: { ownerId: "biz1", isActive: true, ...extra } });
  const linked = { business: { ...business, venueId: "biz_biz1" } };

  it("creates the venue under a deterministic id with a nested link back when nothing exists", () => {
    const plan = planBusinessVenue(input);
    expect(businessVenueId("biz1")).toBe("biz_biz1");
    expect(plan).toMatchObject({ kind: "create", venueId: "biz_biz1", instructorPatch: { business: { venueId: "biz_biz1" } } });
    expect(plan && plan.kind === "create" && plan.venue).toEqual(buildBusinessVenue(input));
    expect(Object.keys(plan && plan.kind === "create" ? plan.instructorPatch : {}).filter((k) => k.includes("."))).toEqual([]);
  });

  it("plans nothing for no business map, venueType none or absent", () => {
    expect(planBusinessVenue({ ...input, instructor: {} })).toBeNull();
    expect(planBusinessVenue({ ...input, instructor: { business: { ...business, venueType: "none" } } })).toBeNull();
    const { venueType: _omit, ...legacy } = business;
    expect(planBusinessVenue({ ...input, instructor: { business: legacy } })).toBeNull();
    // ...even over a venue of its own that an earlier approval left inactive.
    expect(planBusinessVenue({ ...input, instructor: { business: legacy }, existing: own({ isActive: false }) })).toBeNull();
  });

  it("an already linked company with an active venue plans nothing (a re-run); a deleted linked venue is not recreated", () => {
    expect(planBusinessVenue({ ...input, instructor: linked, existing: own() })).toBeNull();
    expect(planBusinessVenue({ ...input, instructor: linked, existing: own({ isActive: undefined }) })).toBeNull();
    expect(planBusinessVenue({ ...input, instructor: linked, existing: { exists: false } })).toBeNull();
    expect(planBusinessVenue({ ...input, instructor: { business: { ...business, venueId: "elsewhere" } } })).toBeNull();
  });

  it("reactivates the company's own inactive venue with isActive/updatedAt only, relinking when needed", () => {
    expect(planBusinessVenue({ ...input, instructor: linked, existing: own({ isActive: false }) })).toEqual({
      kind: "reactivate", venueId: "biz_biz1", venuePatch: { isActive: true, updatedAt: NOW }, instructorPatch: null,
    });
    // Converted to individual and back: the link is gone, the venue is still the company's.
    expect(planBusinessVenue({ ...input, existing: own({ isActive: false }) })).toEqual({
      kind: "reactivate", venueId: "biz_biz1", venuePatch: { isActive: true, updatedAt: NOW },
      instructorPatch: { business: { venueId: "biz_biz1" } },
    });
    // Active but unlinked: relink without touching the venue's state.
    expect(planBusinessVenue({ ...input, existing: own() })).toMatchObject({ kind: "reactivate", instructorPatch: { business: { venueId: "biz_biz1" } } });
  });

  it("a venue at the id owned by someone else is a genuine clash: venue_exists", () => {
    for (const data of [{ ownerId: "someone-else" }, {}, { ownerId: null }]) {
      expect(() => planBusinessVenue({ ...input, existing: { exists: true, data } })).toThrowError(
        expect.objectContaining({ code: "already-exists", message: "venue_exists" }),
      );
    }
  });

  it("a rejection deactivates the company's own active venue and leaves anything else alone", () => {
    const rejected = { ...input, decision: "rejected" as const, instructor: linked };
    expect(planBusinessVenue({ ...rejected, existing: own() })).toEqual({
      kind: "deactivate", venueId: "biz_biz1", venuePatch: { isActive: false, updatedAt: NOW },
    });
    expect(planBusinessVenue({ ...rejected, existing: own({ isActive: undefined }) })).toMatchObject({ kind: "deactivate" });
    expect(planBusinessVenue({ ...rejected, existing: own({ isActive: false }) })).toBeNull();
    expect(planBusinessVenue({ ...rejected, existing: { exists: false } })).toBeNull();
    expect(planBusinessVenue({ ...rejected, existing: own({ ownerId: "someone-else" }) })).toBeNull();
    expect(planBusinessVenue({ ...rejected, instructor: {}, existing: own() })).toBeNull();
  });
});

describe("venueDeactivationPatch", () => {
  const own = (extra: Record<string, unknown> = {}) => ({ exists: true, data: { ownerId: "biz1", ...extra } });
  it("deactivates only the owner's own venue that is not already inactive", () => {
    expect(venueDeactivationPatch("biz1", own(), NOW)).toEqual({ isActive: false, updatedAt: NOW });
    expect(venueDeactivationPatch("biz1", own({ isActive: false }), NOW)).toBeNull();
    expect(venueDeactivationPatch("biz1", own({ ownerId: "x" }), NOW)).toBeNull();
    expect(venueDeactivationPatch("biz1", { exists: false }, NOW)).toBeNull();
    expect(venueDeactivationPatch("biz1", undefined, NOW)).toBeNull();
  });
});

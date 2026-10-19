import { describe, it, expect } from "vitest";
import {
  BUSINESS_LIMITS,
  BusinessApplicationError,
  parseProviderType,
  validateBusinessApplication,
} from "./businessApplication";

const valid = {
  legalName: "  Palestra Rossi S.r.l. ",
  vatNumber: "IT 0123 4567 897",
  displayName: " Palestra Rossi ",
  description: " Functional training in Torino ",
  website: " https://palestrarossi.it ",
  city: " Torino ",
  venueType: "studio",
  address: " Via Roma 1 ",
};

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof BusinessApplicationError) return err.code;
    throw err;
  }
  return undefined;
}

describe("parseProviderType", () => {
  it("defaults to individual when absent, so existing callers are unchanged", () => {
    expect(parseProviderType(undefined)).toBe("individual");
    expect(parseProviderType(null)).toBe("individual");
  });

  it("accepts the two known values and refuses anything else with a stable code", () => {
    expect(parseProviderType("individual")).toBe("individual");
    expect(parseProviderType("business")).toBe("business");
    expect(code(() => parseProviderType("company"))).toBe("provider_type_invalid");
    expect(code(() => parseProviderType(1))).toBe("provider_type_invalid");
  });
});

describe("validateBusinessApplication", () => {
  it("trims, normalises the P.IVA to bare digits and nulls what is absent", () => {
    expect(validateBusinessApplication(valid)).toEqual({
      legalName: "Palestra Rossi S.r.l.",
      vatNumber: "01234567897",
      displayName: "Palestra Rossi",
      description: "Functional training in Torino",
      website: "https://palestrarossi.it",
      city: "Torino",
      venueType: "studio",
      address: "Via Roma 1",
    });
    expect(validateBusinessApplication({
      legalName: "Rossi", vatNumber: "01234567897", displayName: "Rossi",
    })).toEqual({
      legalName: "Rossi",
      vatNumber: "01234567897",
      displayName: "Rossi",
      description: "",
      website: null,
      city: "",
      venueType: "gym",
      address: null,
    });
  });

  it("refuses a missing or non-object payload", () => {
    expect(code(() => validateBusinessApplication(undefined))).toBe("business_required");
    expect(code(() => validateBusinessApplication("x"))).toBe("business_required");
    expect(code(() => validateBusinessApplication(["a"]))).toBe("business_required");
  });

  it("refuses an invalid or non-string P.IVA before touching the validator", () => {
    expect(code(() => validateBusinessApplication({ ...valid, vatNumber: "01234567898" }))).toBe("business_vat_invalid");
    expect(code(() => validateBusinessApplication({ ...valid, vatNumber: 1234567897 }))).toBe("business_vat_invalid");
    expect(code(() => validateBusinessApplication({ ...valid, vatNumber: undefined }))).toBe("business_vat_invalid");
    expect(code(() => validateBusinessApplication({ ...valid, vatNumber: "00000000000" }))).toBe("business_vat_invalid");
  });

  it("requires non-empty trimmed names of the right type", () => {
    expect(code(() => validateBusinessApplication({ ...valid, legalName: "   " }))).toBe("business_legal_name_required");
    expect(code(() => validateBusinessApplication({ ...valid, legalName: 42 }))).toBe("business_legal_name_required");
    expect(code(() => validateBusinessApplication({ ...valid, displayName: "" }))).toBe("business_display_name_required");
    expect(code(() => validateBusinessApplication({ ...valid, displayName: {} }))).toBe("business_display_name_required");
  });

  it("caps every free-text field", () => {
    const over = (n: number) => "x".repeat(n + 1);
    expect(code(() => validateBusinessApplication({ ...valid, legalName: over(BUSINESS_LIMITS.legalName) }))).toBe("business_legal_name_too_long");
    expect(code(() => validateBusinessApplication({ ...valid, displayName: over(BUSINESS_LIMITS.displayName) }))).toBe("business_display_name_too_long");
    expect(code(() => validateBusinessApplication({ ...valid, description: over(BUSINESS_LIMITS.description) }))).toBe("business_description_too_long");
    expect(code(() => validateBusinessApplication({ ...valid, website: `https://a.it/${over(BUSINESS_LIMITS.website)}` }))).toBe("business_website_too_long");
    expect(code(() => validateBusinessApplication({ ...valid, city: over(BUSINESS_LIMITS.city) }))).toBe("business_city_too_long");
    expect(code(() => validateBusinessApplication({ ...valid, address: over(BUSINESS_LIMITS.address) }))).toBe("business_address_too_long");
    // Exactly at the cap is fine.
    expect(validateBusinessApplication({ ...valid, legalName: "x".repeat(BUSINESS_LIMITS.legalName) }).legalName)
      .toHaveLength(BUSINESS_LIMITS.legalName);
  });

  it("refuses optional text fields of the wrong type rather than coercing them", () => {
    expect(code(() => validateBusinessApplication({ ...valid, description: 5 }))).toBe("business_description_invalid");
    expect(code(() => validateBusinessApplication({ ...valid, city: [] }))).toBe("business_city_invalid");
    expect(code(() => validateBusinessApplication({ ...valid, address: {} }))).toBe("business_address_invalid");
    expect(code(() => validateBusinessApplication({ ...valid, website: 5 }))).toBe("business_website_invalid");
  });

  it("accepts only an http(s) website, treating blank as none", () => {
    expect(validateBusinessApplication({ ...valid, website: "" }).website).toBeNull();
    expect(validateBusinessApplication({ ...valid, website: "   " }).website).toBeNull();
    expect(validateBusinessApplication({ ...valid, website: null }).website).toBeNull();
    expect(validateBusinessApplication({ ...valid, website: "http://a.it" }).website).toBe("http://a.it");
    for (const bad of ["palestrarossi.it", "ftp://a.it", "javascript:alert(1)", "https://", "https://a b"]) {
      expect(code(() => validateBusinessApplication({ ...valid, website: bad }))).toBe("business_website_invalid");
    }
  });

  it("accepts the four venue types, defaults to gym and refuses anything else", () => {
    for (const vt of ["gym", "school", "studio", "none"]) {
      expect(validateBusinessApplication({ ...valid, venueType: vt }).venueType).toBe(vt);
    }
    expect(validateBusinessApplication({ ...valid, venueType: undefined }).venueType).toBe("gym");
    expect(code(() => validateBusinessApplication({ ...valid, venueType: "pool" }))).toBe("business_venue_type_invalid");
    expect(code(() => validateBusinessApplication({ ...valid, venueType: 1 }))).toBe("business_venue_type_invalid");
  });
});

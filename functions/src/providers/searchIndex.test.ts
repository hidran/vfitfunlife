import { describe, it, expect } from "vitest";
import {
  computeProviderSearchTerms,
  normalizeSearchText,
  providerSearchPatch,
  PROVIDER_SEARCH_TERMS_CAP,
  SEARCH_TOKEN_MAX_LENGTH,
} from "./searchIndex";
import * as users from "../users/adminIndex";

describe("the copy of the users' normalizer", () => {
  it("matches ../users/adminIndex.ts, which the client's query key uses", () => {
    expect(SEARCH_TOKEN_MAX_LENGTH).toBe(users.SEARCH_TOKEN_MAX_LENGTH);
    for (const s of ["Luca Bianchì", "  ÉLODIE  d'Arco ", "personal_training", "Ñandú-42", ""]) {
      expect(normalizeSearchText(s)).toBe(users.normalizeSearchText(s));
    }
  });
});

describe("computeProviderSearchTerms", () => {
  it("indexes the whole name and each word by prefix, lowercased and accent-free", () => {
    const terms = computeProviderSearchTerms({ fullName: "Luca Bianchì" });
    expect(terms).toEqual(expect.arrayContaining(["l", "luca", "luca bianchi", "b", "bianchi"]));
    expect(terms).not.toContain("luca ");
  });

  it("indexes specialties and category ids read as words", () => {
    const terms = computeProviderSearchTerms({
      fullName: "Anna",
      providerProfile: { specialties: ["Yoga"] },
      categoryIds: ["personal_training", "strength_conditioning"],
    });
    expect(terms).toEqual(expect.arrayContaining(["yoga", "personal training", "training", "strength"]));
  });

  it("never indexes anything but name, specialties and categories", () => {
    const terms = computeProviderSearchTerms({ fullName: "Anna", email: "anna@x.it", phone: "+39333" } as never);
    expect(terms.some((t) => t.includes("@") || t.startsWith("3"))).toBe(false);
  });

  it("ignores malformed fields", () => {
    expect(computeProviderSearchTerms({ fullName: 42, providerProfile: null, categoryIds: "x" })).toEqual([]);
  });

  it("keeps the name's terms under the cap", () => {
    const many = Array.from({ length: 60 }, (_, i) => `w${i}abcdefghijklmnopq`);
    const terms = computeProviderSearchTerms({ fullName: "Zeno", categoryIds: many });
    expect(terms.length).toBe(PROVIDER_SEARCH_TERMS_CAP);
    expect(terms).toContain("zeno");
  });
});

describe("providerSearchPatch", () => {
  it("writes the terms when missing or stale, nothing once they match", () => {
    const patch = providerSearchPatch({ fullName: "Luca" });
    expect(patch?.searchTerms).toContain("luca");
    expect(providerSearchPatch({ fullName: "Luca", searchTerms: patch!.searchTerms })).toBeNull();
    expect(providerSearchPatch({ fullName: "Marco", searchTerms: patch!.searchTerms })).not.toBeNull();
  });
});

describe("company accounts", () => {
  const company = {
    fullName: "Palestra Roma",
    business: {
      legalName: "Rossi Sport S.r.l.",
      vatNumber: "12345678903",
      affiliationNumber: "CONI-998",
      displayName: "Palestra Roma",
      logoUrl: "https://x/a.png",
    },
  };

  it("indexes the legal name and the display name, not the tax id or registration number", () => {
    const terms = computeProviderSearchTerms(company);
    expect(terms).toEqual(expect.arrayContaining(["rossi", "rossi sport", "sport", "palestra", "roma"]));
    expect(terms.some((t) => t.startsWith("1234") || t.startsWith("coni"))).toBe(false);
  });

  it("ignores a malformed business map and leaves individuals unchanged", () => {
    const base = computeProviderSearchTerms({ fullName: "Anna" });
    expect(computeProviderSearchTerms({ fullName: "Anna", business: "x" as never })).toEqual(base);
    expect(computeProviderSearchTerms({ fullName: "Anna", business: [] as never })).toEqual(base);
    expect(computeProviderSearchTerms({ fullName: "Anna", business: { legalName: 5 } })).toEqual(base);
  });

  it("is idempotent: a logo-only or description edit produces no write", () => {
    const patch = providerSearchPatch(company)!;
    expect(patch.searchTerms).toContain("rossi");
    const stored = { ...company, searchTerms: patch.searchTerms };
    expect(providerSearchPatch(stored)).toBeNull();
    const logoEdit = { ...stored, business: { ...company.business, logoUrl: "https://x/b.png", description: "new" } };
    expect(providerSearchPatch(logoEdit)).toBeNull();
    const renamed = { ...stored, business: { ...company.business, legalName: "Bianchi Srl" } };
    expect(providerSearchPatch(renamed)).not.toBeNull();
  });
});

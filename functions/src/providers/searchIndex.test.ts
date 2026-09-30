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

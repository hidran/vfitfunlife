import { describe, it, expect } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import {
  assertApprovalHoldsClaim,
  assertClaimReleasable,
  assertNoOtherCarrier,
  checkBusinessReview,
  claimHolderUid,
  convertToIndividualPatches,
  parseAdminReason,
  parseProviderId,
  parseTaxIdUpdate,
  reviewedFieldsOf,
  taxIdUpdatePatch,
} from "./businessAdminRules";

/** The error a synchronous call throws, so its code and stable message can be asserted. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected the call to throw");
}

function expectHttpsError(fn: () => unknown, code: string, message: string): void {
  const err = thrownBy(fn);
  expect(err).toBeInstanceOf(HttpsError);
  expect(err).toMatchObject({ code, message });
}

/** Every key, at any depth, whose name contains a dot. */
function dottedKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => dottedKeys(v, `${path}${i}/`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(k.includes(".") ? [`${path}${k}`] : []),
    ...dottedKeys(v, `${path}${k}/`),
  ]);
}

const VAT = "12345678903";
const OTHER_VAT = "00743110157";
const LEGAL_NAME = "Karate Club Milano S.r.l.";
const BUSINESS = { legalName: LEGAL_NAME, vatNumber: VAT, displayName: "Karate Club Milano" };
const PENDING_BUSINESS = { applicationStatus: "pending", business: BUSINESS };

describe("checkBusinessReview — approve what the admin actually saw", () => {
  const review = (instructor: Record<string, unknown> | undefined, decision: "verified" | "rejected", expectedReview: unknown, user?: Record<string, unknown>) =>
    checkBusinessReview({ user, instructor, decision, expectedReview });

  it("a matching business approval passes and names the tax id whose claim the approval must hold", () => {
    expect(review(PENDING_BUSINESS, "verified", { vatNumber: VAT, legalName: LEGAL_NAME })).toBe(VAT);
  });

  it("compares the tax id normalised and the legal name trimmed — formatting is not a different company", () => {
    expect(review(PENDING_BUSINESS, "verified", { vatNumber: " IT 123 456 789 03 ", legalName: `  ${LEGAL_NAME} ` })).toBe(VAT);
    // A stored number with an IT prefix still names its normalised claim.
    expect(
      review({ business: { ...BUSINESS, vatNumber: `IT${VAT}` } }, "verified", { vatNumber: VAT, legalName: LEGAL_NAME }),
    ).toBe(VAT);
  });

  it("refuses with stale_review when the stored tax id or legal name is not what was reviewed", () => {
    for (const expected of [
      { vatNumber: OTHER_VAT, legalName: LEGAL_NAME },
      { vatNumber: VAT, legalName: "Karate Club Roma S.r.l." },
      // Case is a different name: the admin compares what is on the registry, letter for letter.
      { vatNumber: VAT, legalName: LEGAL_NAME.toUpperCase() },
    ]) {
      expectHttpsError(() => review(PENDING_BUSINESS, "verified", expected), "failed-precondition", "stale_review");
    }
  });

  it("refuses with stale_review when the stored values are unusable — nothing to confirm against", () => {
    for (const business of [
      { ...BUSINESS, vatNumber: undefined },
      { ...BUSINESS, vatNumber: 12345678903 },
      { ...BUSINESS, legalName: null },
      [],
    ]) {
      expectHttpsError(
        () => review({ business }, "verified", { vatNumber: VAT, legalName: LEGAL_NAME }),
        "failed-precondition",
        "stale_review",
      );
    }
  });

  it("a matching review of a stored number that is no valid tax id cannot hold a claim ⇒ claim_missing", () => {
    for (const vatNumber of ["a/b", "12345678904"]) {
      expectHttpsError(
        () => review({ business: { ...BUSINESS, vatNumber } }, "verified", { vatNumber, legalName: LEGAL_NAME }),
        "failed-precondition",
        "claim_missing",
      );
    }
  });

  it("requires a review to approve a business: missing or malformed ⇒ review_required", () => {
    for (const expected of [undefined, null, "12345678903", {}, { vatNumber: VAT }, { vatNumber: VAT, legalName: 1 }]) {
      expectHttpsError(() => review(PENDING_BUSINESS, "verified", expected), "failed-precondition", "review_required");
    }
  });

  it("users.providerType 'business' alone makes it a business (same test as isExistingBusiness) — never approvable unseen", () => {
    const user = { providerType: "business" };
    for (const instructor of [undefined, {}, { applicationStatus: "pending" }]) {
      expectHttpsError(() => review(instructor, "verified", undefined, user), "failed-precondition", "review_required");
      // There is no business map to match whatever was "reviewed".
      expectHttpsError(
        () => review(instructor, "verified", { vatNumber: VAT, legalName: LEGAL_NAME }, user),
        "failed-precondition",
        "stale_review",
      );
    }
  });

  it("a rejection needs no review and names no claim; a review sent with it must still describe the doc", () => {
    expect(review(PENDING_BUSINESS, "rejected", undefined)).toBeNull();
    expect(review(PENDING_BUSINESS, "rejected", { vatNumber: VAT, legalName: LEGAL_NAME })).toBeNull();
    expectHttpsError(
      () => review(PENDING_BUSINESS, "rejected", { vatNumber: OTHER_VAT, legalName: LEGAL_NAME }),
      "failed-precondition",
      "stale_review",
    );
  });

  it("an individual needs no review — but a review sent for one is stale: the company it described is gone", () => {
    for (const instructor of [undefined, {}, { applicationStatus: "pending" }, { business: null }]) {
      expect(review(instructor, "verified", undefined)).toBeNull();
      expect(review(instructor, "rejected", undefined, { providerType: "individual" })).toBeNull();
      for (const decision of ["verified", "rejected"] as const) {
        expectHttpsError(
          () => review(instructor, decision, { vatNumber: VAT, legalName: LEGAL_NAME }),
          "failed-precondition",
          "stale_review",
        );
      }
    }
  });
});

describe("assertApprovalHoldsClaim", () => {
  it("passes when the company being approved holds the claim on its tax id", () => {
    expect(() => assertApprovalHoldsClaim({ uid: "u1", createdAt: "T0" }, "u1")).not.toThrow();
  });

  it("no claim ⇒ claim_missing (released or never taken): approving would let a second company take the number", () => {
    expectHttpsError(() => assertApprovalHoldsClaim(undefined, "u1"), "failed-precondition", "claim_missing");
  });

  it("another account holds it ⇒ vat_already_registered: two approved companies must never share a tax id", () => {
    for (const claim of [{ uid: "someone-else" }, { uid: undefined }, {}]) {
      expectHttpsError(() => assertApprovalHoldsClaim(claim, "u1"), "already-exists", "vat_already_registered");
    }
  });
});

describe("assertNoOtherCarrier", () => {
  it("passes when no doc, or only the provider's own doc, carries the number", () => {
    expect(() => assertNoOtherCarrier([], "u1")).not.toThrow();
    expect(() => assertNoOtherCarrier(["u1"], "u1")).not.toThrow();
  });

  it("refuses with vat_already_registered when another doc (even a rejected one) still carries it", () => {
    expectHttpsError(() => assertNoOtherCarrier(["u1", "a"], "u1"), "already-exists", "vat_already_registered");
  });
});

describe("claimHolderUid", () => {
  it("is the claim's uid when it can name a document, else null", () => {
    expect(claimHolderUid({ uid: "u1" })).toBe("u1");
    for (const data of [undefined, {}, { uid: "" }, { uid: 7 }, { uid: "a/b" }, { uid: "." }, { uid: ".." }]) {
      expect(claimHolderUid(data)).toBeNull();
    }
  });
});

describe("assertClaimReleasable", () => {
  it("refuses with claim_in_use while the holder's pending or approved company still carries that number", () => {
    for (const status of ["pending", "verified", undefined]) {
      expectHttpsError(
        () => assertClaimReleasable(VAT, { applicationStatus: status, business: BUSINESS }),
        "failed-precondition",
        "claim_in_use",
      );
    }
    // A legacy approval by the flag alone is still in use.
    expectHttpsError(
      () => assertClaimReleasable(VAT, { providerProfile: { isVerified: true }, business: { ...BUSINESS, vatNumber: `IT${VAT}` } }),
      "failed-precondition",
      "claim_in_use",
    );
  });

  it("a listed company is in use even if its applicationStatus says rejected (the isApproved definition)", () => {
    expectHttpsError(
      () => assertClaimReleasable(VAT, { applicationStatus: "rejected", providerProfile: { isVerified: true }, business: BUSINESS }),
      "failed-precondition",
      "claim_in_use",
    );
  });

  it("allows the release of an abandoned claim: rejected, moved to another number, converted, or no doc at all", () => {
    for (const holder of [
      { applicationStatus: "rejected", business: BUSINESS },
      { applicationStatus: "rejected", providerProfile: { isVerified: false }, business: BUSINESS },
      { applicationStatus: "verified", business: { ...BUSINESS, vatNumber: OTHER_VAT } },
      { applicationStatus: "verified", name: "Mario Rossi" },
      { applicationStatus: "verified", business: null },
      undefined,
    ]) {
      expect(() => assertClaimReleasable(VAT, holder)).not.toThrow();
    }
  });
});

describe("parseProviderId and parseAdminReason", () => {
  it("parseProviderId accepts a uid and refuses what cannot name a document", () => {
    expect(parseProviderId("u1")).toBe("u1");
    for (const bad of [undefined, null, 1, "", "a/b", ".", "..", "x".repeat(129)]) {
      expectHttpsError(() => parseProviderId(bad), "invalid-argument", "invalid_provider_id");
    }
  });

  it("parseAdminReason is optional, trimmed, and capped", () => {
    expect(parseAdminReason(undefined)).toBeUndefined();
    expect(parseAdminReason(null)).toBeUndefined();
    expect(parseAdminReason("   ")).toBeUndefined();
    expect(parseAdminReason("  wrong tax id  ")).toBe("wrong tax id");
    for (const bad of [1, {}, "x".repeat(1001)]) {
      expectHttpsError(() => parseAdminReason(bad), "invalid-argument", "invalid_reason");
    }
  });
});

describe("convertToIndividualPatches", () => {
  const NOW = { sentinel: "serverTimestamp" };
  const REMOVE = { sentinel: "delete" };

  it("deletes users.providerType and instructors.business with the delete sentinel (never null) and renames to the person", () => {
    const patches = convertToIndividualPatches({
      user: { fullName: "  Mario Rossi ", providerType: "business" },
      instructor: { name: "Karate Club Milano", fullName: "Karate Club Milano", business: BUSINESS, applicationStatus: "verified" },
      now: NOW,
      remove: REMOVE,
    });
    expect(patches.user).toEqual({ providerType: REMOVE, updatedAt: NOW });
    expect(patches.instructor).toEqual({ business: REMOVE, name: "Mario Rossi", fullName: "Mario Rossi", updatedAt: NOW });
    expect(patches.publicName).toBe("Mario Rossi");
    expect(dottedKeys(patches)).toEqual([]);
  });

  it("never touches the verification state — an approved company stays listed", () => {
    const patches = convertToIndividualPatches({
      user: { fullName: "Mario Rossi", providerType: "business", providerStatus: "verified", isVerified: true },
      instructor: { business: BUSINESS, applicationStatus: "verified", providerProfile: { isVerified: true } },
      now: NOW,
      remove: REMOVE,
    });
    for (const patch of [patches.user, patches.instructor]) {
      for (const key of ["applicationStatus", "providerProfile", "providerStatus", "isVerified"]) {
        expect(patch).not.toHaveProperty(key);
      }
    }
  });

  it("keeps the current public name when the user has no personal name", () => {
    for (const fullName of [undefined, null, "", "   ", 3]) {
      const patches = convertToIndividualPatches({
        user: { fullName, providerType: "business" },
        instructor: { name: "Karate Club Milano", business: BUSINESS },
        now: NOW,
        remove: REMOVE,
      });
      expect(patches.instructor).toEqual({ business: REMOVE, updatedAt: NOW });
      expect(patches.publicName).toBeNull();
    }
  });

  it("also drops a denormalised instructors.providerType, and writes no instructors patch when there is no doc", () => {
    const withType = convertToIndividualPatches({
      user: { fullName: "Mario Rossi", providerType: "business" },
      instructor: { providerType: "business", business: BUSINESS },
      now: NOW,
      remove: REMOVE,
    });
    expect(withType.instructor).toMatchObject({ providerType: REMOVE, business: REMOVE });

    const noDoc = convertToIndividualPatches({
      user: { fullName: "Mario Rossi", providerType: "business" },
      instructor: undefined,
      now: NOW,
      remove: REMOVE,
    });
    expect(noDoc.instructor).toBeNull();
    expect(noDoc.user).toEqual({ providerType: REMOVE, updatedAt: NOW });
  });
});

describe("parseTaxIdUpdate", () => {
  it("requires a valid tax id and keeps only the fields that were sent, validated like signup", () => {
    expect(parseTaxIdUpdate({ vatNumber: "IT 007 431 101 57" })).toEqual({ vatNumber: OTHER_VAT });
    expect(
      parseTaxIdUpdate({
        vatNumber: OTHER_VAT,
        legalName: "  Karate Club Roma S.r.l. ",
        legalForm: "association",
        affiliationNumber: " CONI 9 ",
        providerId: "ignored here",
      }),
    ).toEqual({
      vatNumber: OTHER_VAT,
      legalName: "Karate Club Roma S.r.l.",
      legalForm: "association",
      affiliationNumber: "CONI 9",
    });
  });

  it("null clears an optional field the same way signup stores an absent one", () => {
    expect(parseTaxIdUpdate({ vatNumber: VAT, legalForm: null, affiliationNumber: null })).toEqual({
      vatNumber: VAT,
      legalForm: "company",
      affiliationNumber: "",
    });
  });

  it("refuses with the signup codes", () => {
    expectHttpsError(() => parseTaxIdUpdate(undefined), "invalid-argument", "invalid_vat");
    expectHttpsError(() => parseTaxIdUpdate({}), "invalid-argument", "invalid_vat");
    expectHttpsError(() => parseTaxIdUpdate({ vatNumber: "12345678904" }), "invalid-argument", "invalid_vat");
    expectHttpsError(() => parseTaxIdUpdate({ vatNumber: VAT, legalName: " " }), "invalid-argument", "invalid_business_name");
    expectHttpsError(() => parseTaxIdUpdate({ vatNumber: VAT, legalName: null }), "invalid-argument", "invalid_business_name");
    expectHttpsError(() => parseTaxIdUpdate({ vatNumber: VAT, legalForm: "srl" }), "invalid-argument", "invalid_legal_form");
    expectHttpsError(
      () => parseTaxIdUpdate({ vatNumber: VAT, affiliationNumber: "9".repeat(41) }),
      "invalid-argument",
      "invalid_affiliation_number",
    );
  });
});

describe("taxIdUpdatePatch", () => {
  it("is a nested business map holding only the sent fields — never a dotted key (it is applied with set(merge))", () => {
    const NOW = { sentinel: "serverTimestamp" };
    expect(taxIdUpdatePatch({ vatNumber: OTHER_VAT }, NOW)).toEqual({ business: { vatNumber: OTHER_VAT }, updatedAt: NOW });
    const full = taxIdUpdatePatch(
      { vatNumber: OTHER_VAT, legalName: "Karate Club Roma S.r.l.", legalForm: "association", affiliationNumber: "" },
      NOW,
    );
    expect(full).toEqual({
      business: { vatNumber: OTHER_VAT, legalName: "Karate Club Roma S.r.l.", legalForm: "association", affiliationNumber: "" },
      updatedAt: NOW,
    });
    expect(dottedKeys(full)).toEqual([]);
  });
});

describe("reviewedFieldsOf", () => {
  it("picks the admin-owned fields for the audit entry, null where absent", () => {
    expect(reviewedFieldsOf({ ...BUSINESS, legalForm: "company", website: "https://x.it" })).toEqual({
      vatNumber: VAT,
      legalName: LEGAL_NAME,
      legalForm: "company",
      affiliationNumber: null,
    });
    expect(reviewedFieldsOf(undefined)).toEqual({ vatNumber: null, legalName: null, legalForm: null, affiliationNumber: null });
  });
});

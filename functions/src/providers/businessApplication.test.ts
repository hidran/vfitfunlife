import { describe, it, expect } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import {
  BUSINESS_FIELD_LIMITS,
  BUSINESS_LEGAL_FORMS,
  assertNotApprovedBusiness,
  assertNotExistingBusiness,
  buildBusinessInstructorPatch,
  claimBusinessVat,
  isExistingBusiness,
  parseAffiliationNumber,
  parseLegalForm,
  parseLegalName,
  parseProviderType,
  parseVatNumber,
  validateBusinessInput,
} from "./businessApplication";

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

const VALID = {
  legalName: "Karate Club Milano S.r.l.",
  vatNumber: "12345678903",
  displayName: "Karate Club Milano",
};

/**
 * Check digit of an Italian 11-digit tax id — the same rule for a P.IVA and for the numeric
 * codice fiscale of an association (odd positions as-is, even ones doubled with digit sum).
 * Re-derived here rather than trusted from memory or from the code under test.
 */
function taxIdCheckDigit(first10: string): number {
  const sum = first10.split("").map(Number).reduce((acc, d, i) => {
    if (i % 2 === 0) return acc + d;
    const doubled = d * 2;
    return acc + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * An association's (ASD/SSD) numeric codice fiscale, accepted in place of a P.IVA (D3). It starts
 * with 9 like the codici fiscali of non-commercial bodies, and its digits 8–10 — a P.IVA's
 * provincial-office code — are not an office code, so it is no well-formed company P.IVA: only
 * the shared checksum makes it valid.
 */
const ASSOCIATION_CF = "9712345678" + taxIdCheckDigit("9712345678");

/** A P.IVA's digits 8–10 name the issuing office: 001–100, 120, 121, 888 or 999. */
function isPivaOfficeCode(code: number): boolean {
  return (code >= 1 && code <= 100) || [120, 121, 888, 999].includes(code);
}

/** The same number with a wrong check digit. */
function withBadCheckDigit(taxId: string): string {
  return taxId.slice(0, 10) + ((Number(taxId[10]) + 1) % 10);
}

describe("validateBusinessInput", () => {
  it("trims every field and returns the normalised business details", () => {
    expect(
      validateBusinessInput({
        legalName: "  Karate Club Milano S.r.l. ",
        vatNumber: "12345678903",
        legalForm: "sole_trader",
        affiliationNumber: "  CONI 12345 ",
        displayName: " Karate Club Milano ",
        description: " Karate, animazione e sport per bambini ",
        website: " https://karateclub.example.it ",
        city: " Milano ",
      }),
    ).toEqual({
      legalName: "Karate Club Milano S.r.l.",
      vatNumber: "12345678903",
      legalForm: "sole_trader",
      affiliationNumber: "CONI 12345",
      displayName: "Karate Club Milano",
      description: "Karate, animazione e sport per bambini",
      website: "https://karateclub.example.it",
      city: "Milano",
    });
  });

  it("stores the optional fields deterministically, so a re-apply replaces rather than keeps stale ones", () => {
    expect(validateBusinessInput(VALID)).toEqual({
      ...VALID,
      legalForm: "company",
      affiliationNumber: "",
      description: "",
      website: null,
      city: "",
    });
  });

  it("rejects a P.IVA that fails the B1 validator", () => {
    for (const vatNumber of ["12345678904", "1234567890", "1234567890A", "00000000000", "", "   "]) {
      expectHttpsError(
        () => validateBusinessInput({ ...VALID, vatNumber }),
        "invalid-argument",
        "invalid_vat",
      );
    }
  });

  it("rejects a missing or non-string P.IVA", () => {
    for (const vatNumber of [undefined, null, 12345678903, {}]) {
      expectHttpsError(
        () => validateBusinessInput({ ...VALID, vatNumber }),
        "invalid-argument",
        "invalid_vat",
      );
    }
  });

  it("stores the P.IVA as bare 11 digits, dropping spaces and an IT prefix", () => {
    expect(validateBusinessInput({ ...VALID, vatNumber: "IT 123 456 789 03" }).vatNumber).toBe("12345678903");
    expect(validateBusinessInput({ ...VALID, vatNumber: "it12345678903" }).vatNumber).toBe("12345678903");
    expect(validateBusinessInput({ ...VALID, vatNumber: " 00743110157 " }).vatNumber).toBe("00743110157");
  });

  it("requires a legal name", () => {
    for (const legalName of [undefined, null, "", "   ", 42]) {
      expectHttpsError(
        () => validateBusinessInput({ ...VALID, legalName }),
        "invalid-argument",
        "invalid_business_name",
      );
    }
  });

  it("defaults the public name to the legal name when it is omitted or blank", () => {
    for (const displayName of [undefined, null, "", "   "]) {
      expect(validateBusinessInput({ ...VALID, displayName }).displayName).toBe("Karate Club Milano S.r.l.");
    }
  });

  it("rejects a public name that is not a string", () => {
    expectHttpsError(
      () => validateBusinessInput({ ...VALID, displayName: 7 }),
      "invalid-argument",
      "invalid_business_name",
    );
  });

  it("caps every free-text field, measured after trimming", () => {
    const { legalName, displayName, description, city, website } = BUSINESS_FIELD_LIMITS;
    expect([legalName, displayName, description, city, website]).toEqual([120, 120, 1000, 80, 200]);

    // Exactly at the cap is fine, and surrounding spaces do not count.
    expect(() => validateBusinessInput({
      ...VALID,
      legalName: ` ${"a".repeat(120)} `,
      displayName: "b".repeat(120),
      description: "c".repeat(1000),
      city: "d".repeat(80),
      website: `https://${"e".repeat(200 - "https://.it".length)}.it`,
    })).not.toThrow();

    expectHttpsError(
      () => validateBusinessInput({ ...VALID, legalName: "a".repeat(121) }),
      "invalid-argument",
      "invalid_business_name",
    );
    expectHttpsError(
      () => validateBusinessInput({ ...VALID, displayName: "b".repeat(121) }),
      "invalid-argument",
      "invalid_business_name",
    );
    expectHttpsError(
      () => validateBusinessInput({ ...VALID, description: "c".repeat(1001) }),
      "invalid-argument",
      "invalid_business_description",
    );
    expectHttpsError(
      () => validateBusinessInput({ ...VALID, city: "d".repeat(81) }),
      "invalid-argument",
      "invalid_business_city",
    );
    expectHttpsError(
      () => validateBusinessInput({ ...VALID, website: `https://${"e".repeat(200)}.it` }),
      "invalid-argument",
      "invalid_website",
    );
  });

  it("rejects a description or city that is not a string", () => {
    expectHttpsError(
      () => validateBusinessInput({ ...VALID, description: ["x"] }),
      "invalid-argument",
      "invalid_business_description",
    );
    expectHttpsError(
      () => validateBusinessInput({ ...VALID, city: 3 }),
      "invalid-argument",
      "invalid_business_city",
    );
  });

  it("accepts http and https websites", () => {
    expect(validateBusinessInput({ ...VALID, website: "https://karateclub.example.it/corsi?x=1" }).website)
      .toBe("https://karateclub.example.it/corsi?x=1");
    expect(validateBusinessInput({ ...VALID, website: "http://karateclub.example.it" }).website)
      .toBe("http://karateclub.example.it");
  });

  it("rejects any website that is not an http(s) URL — it is rendered as a public link", () => {
    for (const website of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://karateclub.example.it",
      "www.karateclub.example.it",
      "not a url",
      "https://",
      42,
    ]) {
      expectHttpsError(
        () => validateBusinessInput({ ...VALID, website }),
        "invalid-argument",
        "invalid_website",
      );
    }
  });

  it("treats an empty or absent website as none", () => {
    for (const website of [undefined, null, "", "   "]) {
      expect(validateBusinessInput({ ...VALID, website }).website).toBeNull();
    }
  });

  it("rejects a payload that is not an object", () => {
    for (const raw of [undefined, null, "Karate Club", 1, ["x"]]) {
      expectHttpsError(() => validateBusinessInput(raw), "invalid-argument", "invalid_business");
    }
  });
});

describe("validateBusinessInput — legal form", () => {
  it("knows exactly the four legal forms of the plan", () => {
    expect(BUSINESS_LEGAL_FORMS).toEqual(["company", "sole_trader", "association", "other"]);
  });

  it.each(["company", "sole_trader", "association", "other"])("stores %s as given", (legalForm) => {
    expect(validateBusinessInput({ ...VALID, legalForm }).legalForm).toBe(legalForm);
  });

  it("defaults to company when absent, so a form that predates the field still works", () => {
    for (const legalForm of [undefined, null]) {
      expect(validateBusinessInput({ ...VALID, legalForm }).legalForm).toBe("company");
    }
  });

  it("rejects any other value rather than guessing", () => {
    for (const legalForm of ["", "Company", "srl", "asd", " association", 1, {}, ["company"]]) {
      expectHttpsError(
        () => validateBusinessInput({ ...VALID, legalForm }),
        "invalid-argument",
        "invalid_legal_form",
      );
    }
  });
});

describe("validateBusinessInput — affiliation number", () => {
  it("is optional and stored as \"\" when absent or blank, so a re-apply replaces a stale one", () => {
    for (const affiliationNumber of [undefined, null, "", "   "]) {
      expect(validateBusinessInput({ ...VALID, affiliationNumber }).affiliationNumber).toBe("");
    }
  });

  it("is trimmed and capped at 40 characters, measured after trimming", () => {
    expect(BUSINESS_FIELD_LIMITS.affiliationNumber).toBe(40);
    expect(validateBusinessInput({ ...VALID, affiliationNumber: ` ${"7".repeat(40)} ` }).affiliationNumber)
      .toBe("7".repeat(40));
    expectHttpsError(
      () => validateBusinessInput({ ...VALID, affiliationNumber: "7".repeat(41) }),
      "invalid-argument",
      "invalid_affiliation_number",
    );
  });

  it("rejects a value that is not a string", () => {
    for (const affiliationNumber of [12345, {}, ["RASD 1"]]) {
      expectHttpsError(
        () => validateBusinessInput({ ...VALID, affiliationNumber }),
        "invalid-argument",
        "invalid_affiliation_number",
      );
    }
  });
});

describe("an association's codice fiscale as the tax id (D3)", () => {
  it("is a checksum-valid 11-digit number that is not a company P.IVA", () => {
    expect(ASSOCIATION_CF).toMatch(/^9\d{10}$/);
    expect(isPivaOfficeCode(Number(ASSOCIATION_CF.slice(7, 10)))).toBe(false);
    // A company P.IVA (Milan office, 015) does carry one; the check above is not vacuous.
    expect(isPivaOfficeCode(Number("00743110157".slice(7, 10)))).toBe(true);
  });

  it("goes through the same tax-id checks as a P.IVA", () => {
    for (const taxId of [VALID.vatNumber, ASSOCIATION_CF]) {
      const spaced = `${taxId.slice(0, 3)} ${taxId.slice(3, 7)} ${taxId.slice(7)}`;
      expect(validateBusinessInput({ ...VALID, vatNumber: ` ${spaced} ` }).vatNumber).toBe(taxId);
      expectHttpsError(
        () => validateBusinessInput({ ...VALID, vatNumber: withBadCheckDigit(taxId) }),
        "invalid-argument",
        "invalid_vat",
      );
      expectHttpsError(
        () => validateBusinessInput({ ...VALID, vatNumber: taxId.slice(0, 10) }),
        "invalid-argument",
        "invalid_vat",
      );
    }
  });

  it("registers an association with its codice fiscale, legal form and affiliation number", () => {
    expect(
      validateBusinessInput({
        legalName: "ASD Sport e Salute",
        vatNumber: ASSOCIATION_CF,
        legalForm: "association",
        affiliationNumber: "RASD 12345",
      }),
    ).toEqual({
      legalName: "ASD Sport e Salute",
      vatNumber: ASSOCIATION_CF,
      legalForm: "association",
      affiliationNumber: "RASD 12345",
      displayName: "ASD Sport e Salute",
      description: "",
      website: null,
      city: "",
    });
  });
});

describe("parseProviderType", () => {
  it("is 'individual' when absent, so existing callers are unchanged", () => {
    expect(parseProviderType(undefined)).toBe("individual");
    expect(parseProviderType(null)).toBe("individual");
  });

  it("passes the two known types through", () => {
    expect(parseProviderType("individual")).toBe("individual");
    expect(parseProviderType("business")).toBe("business");
  });

  it("rejects anything else rather than guessing", () => {
    for (const raw of ["company", "Business", 1, {}]) {
      expectHttpsError(() => parseProviderType(raw), "invalid-argument", "invalid_provider_type");
    }
  });
});

describe("buildBusinessInstructorPatch", () => {
  const business = validateBusinessInput({ ...VALID, city: "Milano" });

  it("shows the company's public name as the instructor's name and nests the details", () => {
    expect(buildBusinessInstructorPatch(business)).toEqual({
      name: "Karate Club Milano",
      fullName: "Karate Club Milano",
      business: {
        legalName: "Karate Club Milano S.r.l.",
        vatNumber: "12345678903",
        legalForm: "company",
        affiliationNumber: "",
        displayName: "Karate Club Milano",
        description: "",
        website: null,
        city: "Milano",
      },
    });
  });

  it("uses no dotted key at any depth — it is applied with set(merge), which would take one literally", () => {
    expect(dottedKeys(buildBusinessInstructorPatch(business))).toEqual([]);
    // Every legal form, with and without an affiliation number, lands inside the nested map.
    for (const legalForm of BUSINESS_LEGAL_FORMS) {
      for (const affiliationNumber of [undefined, "CONI n. 1.234"]) {
        const patch = buildBusinessInstructorPatch(
          validateBusinessInput({ ...VALID, vatNumber: ASSOCIATION_CF, legalForm, affiliationNumber }),
        );
        expect(dottedKeys(patch)).toEqual([]);
        expect(patch.business).toMatchObject({ legalForm, affiliationNumber: affiliationNumber ?? "" });
        expect(Object.keys(patch).sort()).toEqual(["business", "fullName", "name"]);
      }
    }
  });

  it("copies the details rather than sharing the caller's object", () => {
    const patch = buildBusinessInstructorPatch(business);
    expect(patch.business).not.toBe(business);
  });
});

describe("isExistingBusiness", () => {
  it("is true when either the user or the instructors doc already says business", () => {
    // users/{uid}.providerType is the reliable signal: it is in neither isValidUserCreate nor
    // isValidUserUpdate in firestore.rules, so only this callable can set or clear it.
    expect(isExistingBusiness({ providerType: "business" }, {})).toBe(true);
    // The instructors map counts too, but until B4 locks it the owner can still create, edit
    // or remove instructors.business from the client — it is a secondary signal only.
    expect(isExistingBusiness({}, { business: { displayName: "Karate Club Milano" } })).toBe(true);
  });

  it("is false for an individual or a brand-new applicant", () => {
    expect(isExistingBusiness(undefined, undefined)).toBe(false);
    expect(isExistingBusiness({ providerType: "individual" }, { name: "Mario Rossi" })).toBe(false);
    expect(isExistingBusiness({}, { business: null })).toBe(false);
  });
});

describe("assertNotExistingBusiness", () => {
  it("refuses an individual (re-)application on an account that is already a business", () => {
    // Used by applyAsProvider and, against its own reads, by commitProviderDecision's
    // self-apply path — the second check is what closes the concurrent individual/business race.
    expectHttpsError(
      () => assertNotExistingBusiness({ providerType: "business" }, {}),
      "failed-precondition",
      "business_account_exists",
    );
    expectHttpsError(
      () => assertNotExistingBusiness({}, { business: { vatNumber: "12345678903" } }),
      "failed-precondition",
      "business_account_exists",
    );
  });

  it("lets everyone else through", () => {
    expect(() => assertNotExistingBusiness(undefined, undefined)).not.toThrow();
    expect(() => assertNotExistingBusiness({ providerType: "individual" }, { name: "Mario Rossi" })).not.toThrow();
  });
});

describe("assertNotApprovedBusiness", () => {
  const company = { legalName: "Karate Club Milano S.r.l.", vatNumber: "12345678903" };

  it("refuses a business application from an account that is already an approved business", () => {
    // A re-apply would drop the approved company to pending (de-listing it), and the next one
    // could change its tax id. Changes go through B6 (display fields) or an admin (B8).
    for (const [user, instructor] of [
      [{}, { applicationStatus: "verified", providerProfile: { isVerified: true }, business: company }],
      // A legacy doc without applicationStatus is approved by its flag alone.
      [{}, { providerProfile: { isVerified: true }, business: company }],
      // users.providerType is owner-proof, so it counts even if the client removed the map.
      [{ providerType: "business" }, { applicationStatus: "verified", providerProfile: { isVerified: true } }],
    ] as const) {
      expectHttpsError(
        () => assertNotApprovedBusiness(user, instructor),
        "failed-precondition",
        "business_already_approved",
      );
    }
  });

  it("lets first-time applicants and pending or rejected businesses through", () => {
    expect(() => assertNotApprovedBusiness(undefined, undefined)).not.toThrow();
    expect(() => assertNotApprovedBusiness({}, {})).not.toThrow();
    for (const applicationStatus of ["pending", "rejected"]) {
      expect(() =>
        assertNotApprovedBusiness(
          { providerType: "business" },
          { applicationStatus, providerProfile: { isVerified: false }, business: company },
        ),
      ).not.toThrow();
    }
  });

  it("lets a verified individual apply as a business (plan §5: allowed, drops to pending)", () => {
    expect(() =>
      assertNotApprovedBusiness(
        { providerStatus: "verified" },
        { applicationStatus: "verified", providerProfile: { isVerified: true }, name: "Mario Rossi" },
      ),
    ).not.toThrow();
  });
});

describe("claimBusinessVat", () => {
  const NOW = { sentinel: "serverTimestamp" };
  const OWNER = "owner-1";
  const NEW_VAT = "12345678903";
  const OLD_VAT = "00743110157";
  const STRAY_VAT = "01114601006";

  type Ref = { path: string };
  /**
   * Like Firestore's `collection.doc(id)`, but stricter: anything other than an 11-digit tax id
   * throws. A client-written `"a/b"` reaching it would surface as `internal` in production.
   */
  const claimRef = (vat: string): Ref => {
    if (!/^\d{11}$/.test(vat)) throw new Error(`claimRef called with an invalid document id: ${vat}`);
    return { path: `businessVat/${vat}` };
  };

  /**
   * A transaction over an in-memory set of claims, recording every operation in order. It
   * refuses a read after a write, like Firestore.
   */
  function fakeTransaction(claims: Record<string, Record<string, unknown>> = {}) {
    const ops: Array<[op: "get" | "create" | "delete", path: string, data?: Record<string, unknown>]> = [];
    const wrote = () => ops.some(([op]) => op !== "get");
    return {
      ops,
      writes: () => ops.filter(([op]) => op !== "get"),
      /** What the handler's `businessVat where uid == …` query returns: the ids of that uid's claims. */
      heldBy: (uid: string) =>
        Object.entries(claims)
          .filter(([, data]) => data.uid === uid)
          .map(([path]) => path.slice("businessVat/".length)),
      tx: {
        get: async (ref: Ref) => {
          if (wrote()) throw new Error("Firestore transactions require all reads to be executed before all writes.");
          ops.push(["get", ref.path]);
          const data = claims[ref.path];
          return { exists: data !== undefined, data: () => data };
        },
        create: (ref: Ref, data: Record<string, unknown>) => {
          ops.push(["create", ref.path, data]);
        },
        delete: (ref: Ref) => {
          ops.push(["delete", ref.path]);
        },
      },
    };
  }

  function instructorWith(vatNumber: unknown, extra: Record<string, unknown> = {}) {
    return {
      applicationStatus: "pending",
      providerProfile: { isVerified: false },
      business: { legalName: "Karate Club Milano S.r.l.", vatNumber, displayName: "Karate Club Milano" },
      ...extra,
    };
  }

  const APPROVED = { applicationStatus: "verified", providerProfile: { isVerified: true } };

  function claim(
    fake: ReturnType<typeof fakeTransaction>,
    instructor: Record<string, unknown> | undefined,
    vatNumber = NEW_VAT,
  ) {
    return claimBusinessVat(fake.tx, {
      uid: OWNER,
      vatNumber,
      instructor,
      heldVatNumbers: fake.heldBy(OWNER),
      claimRef,
      now: NOW,
    });
  }

  /** No read may follow a write: Firestore transactions need every read first. */
  function expectReadsBeforeWrites(ops: Array<[string, string, unknown?]>) {
    const firstWrite = ops.findIndex(([op]) => op !== "get");
    if (firstWrite === -1) return;
    expect(ops.slice(firstWrite).filter(([op]) => op === "get")).toEqual([]);
  }

  describe.each([
    ["a P.IVA", NEW_VAT],
    ["an association's codice fiscale", ASSOCIATION_CF],
  ])("with %s as the tax id", (_label, taxId) => {
    it("creates the claim when it is unclaimed", async () => {
      const fake = fakeTransaction();
      await expect(claim(fake, undefined, taxId)).resolves.toEqual({ claim: "claimed", released: [] });
      expect(fake.ops).toEqual([
        ["get", `businessVat/${taxId}`],
        ["create", `businessVat/${taxId}`, { uid: OWNER, createdAt: NOW }],
      ]);
    });

    it("refuses it when another account holds the claim", async () => {
      const fake = fakeTransaction({ [`businessVat/${taxId}`]: { uid: "someone-else" } });
      const result = claim(fake, undefined, taxId);
      await expect(result).rejects.toBeInstanceOf(HttpsError);
      await expect(result).rejects.toMatchObject({ code: "already-exists", message: "vat_already_registered" });
      expect(fake.writes()).toEqual([]);
    });

    it("lets the same account re-apply with it and leaves the claim as it is", async () => {
      const fake = fakeTransaction({ [`businessVat/${taxId}`]: { uid: OWNER } });
      await expect(claim(fake, instructorWith(taxId), taxId)).resolves.toEqual({ claim: "already-yours", released: [] });
      expect(fake.writes()).toEqual([]);
    });
  });

  it("an idempotent re-apply needs no instructors doc and does not care about approval", async () => {
    // The handler refuses an approved business before it gets here (assertNotApprovedBusiness);
    // keeping the same claim is harmless either way.
    for (const instructor of [undefined, instructorWith(NEW_VAT, APPROVED)]) {
      const fake = fakeTransaction({ [`businessVat/${NEW_VAT}`]: { uid: OWNER } });
      await expect(claim(fake, instructor)).resolves.toEqual({ claim: "already-yours", released: [] });
      expect(fake.writes()).toEqual([]);
    }
  });

  it("moves a pending business to its new tax id, releasing the old claim in the same transaction", async () => {
    const fake = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: OWNER } });
    await expect(claim(fake, instructorWith(OLD_VAT))).resolves.toEqual({ claim: "claimed", released: [OLD_VAT] });
    expect(fake.writes()).toEqual([
      ["delete", `businessVat/${OLD_VAT}`],
      ["create", `businessVat/${NEW_VAT}`, { uid: OWNER, createdAt: NOW }],
    ]);
    expectReadsBeforeWrites(fake.ops);
  });

  it("treats a rejected business like a pending one — nothing was ever verified", async () => {
    const fake = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: OWNER } });
    await expect(claim(fake, instructorWith(OLD_VAT, { applicationStatus: "rejected" })))
      .resolves.toEqual({ claim: "claimed", released: [OLD_VAT] });
    expect(fake.writes().map(([op, path]) => [op, path])).toEqual([
      ["delete", `businessVat/${OLD_VAT}`],
      ["create", `businessVat/${NEW_VAT}`],
    ]);
  });

  it("releases every other claim the account holds, not only the one its instructors doc names", async () => {
    // Until B4 the owner can rewrite instructors.business.vatNumber from the client, so the
    // stored number is no record of what the account holds; the uid query is.
    const fake = fakeTransaction({
      [`businessVat/${OLD_VAT}`]: { uid: OWNER },
      [`businessVat/${STRAY_VAT}`]: { uid: OWNER },
      [`businessVat/${ASSOCIATION_CF}`]: { uid: "someone-else" },
    });
    await expect(claim(fake, instructorWith(ASSOCIATION_CF))).resolves.toEqual({
      claim: "claimed",
      released: [OLD_VAT, STRAY_VAT],
    });
    expect(fake.writes()).toEqual([
      ["delete", `businessVat/${OLD_VAT}`],
      ["delete", `businessVat/${STRAY_VAT}`],
      ["create", `businessVat/${NEW_VAT}`, { uid: OWNER, createdAt: NOW }],
    ]);
    expectReadsBeforeWrites(fake.ops);
  });

  it("keeps the claim being taken when the account already holds it, and releases the rest", async () => {
    const fake = fakeTransaction({
      [`businessVat/${NEW_VAT}`]: { uid: OWNER },
      [`businessVat/${OLD_VAT}`]: { uid: OWNER },
    });
    await expect(claim(fake, instructorWith(OLD_VAT))).resolves.toEqual({
      claim: "already-yours",
      released: [OLD_VAT],
    });
    expect(fake.writes()).toEqual([["delete", `businessVat/${OLD_VAT}`]]);
  });

  it("never releases a claim that belongs to someone else, even when the instructors doc names it", async () => {
    const fake = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: "someone-else" } });
    await expect(claim(fake, instructorWith(OLD_VAT))).resolves.toEqual({ claim: "claimed", released: [] });
    expect(fake.writes()).toEqual([["create", `businessVat/${NEW_VAT}`, { uid: OWNER, createdAt: NOW }]]);
  });

  it("does not delete an old claim that no longer exists", async () => {
    const fake = fakeTransaction();
    await expect(claim(fake, instructorWith(OLD_VAT))).resolves.toEqual({ claim: "claimed", released: [] });
    expect(fake.writes()).toEqual([["create", `businessVat/${NEW_VAT}`, { uid: OWNER, createdAt: NOW }]]);
  });

  it("keeps every claim when the new tax id belongs to someone else", async () => {
    const fake = fakeTransaction({
      [`businessVat/${OLD_VAT}`]: { uid: OWNER },
      [`businessVat/${STRAY_VAT}`]: { uid: OWNER },
      [`businessVat/${NEW_VAT}`]: { uid: "someone-else" },
    });
    await expect(claim(fake, instructorWith(OLD_VAT))).rejects.toMatchObject({
      code: "already-exists",
      message: "vat_already_registered",
    });
    expect(fake.writes()).toEqual([]);
  });

  it("never uses the stored tax id as a document id — it is client-writable until B4", async () => {
    // "a/b" as a document id would make Firestore throw (→ `internal`), and "a/b/c" would even
    // address a nested document. What the account holds comes from the uid query instead.
    for (const stored of ["a/b", "a/b/c", "", "12345678904", 12345678903, { x: 1 }]) {
      const fake = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: OWNER } });
      await expect(claim(fake, instructorWith(stored))).resolves.toEqual({ claim: "claimed", released: [OLD_VAT] });
      expect(fake.writes().map(([op, path]) => [op, path])).toEqual([
        ["delete", `businessVat/${OLD_VAT}`],
        ["create", `businessVat/${NEW_VAT}`],
      ]);
    }
  });

  it("refuses to move an approved business to another tax id (D6: admin-owned after approval)", async () => {
    for (const instructor of [
      instructorWith(OLD_VAT, APPROVED),
      // A legacy doc without applicationStatus still counts as approved by its flag.
      instructorWith(OLD_VAT, { applicationStatus: undefined, providerProfile: { isVerified: true } }),
      // An unusable stored number does not hide the claim the account really holds.
      instructorWith("a/b", APPROVED),
    ]) {
      const fake = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: OWNER } });
      const result = claim(fake, instructor);
      await expect(result).rejects.toBeInstanceOf(HttpsError);
      await expect(result).rejects.toMatchObject({ code: "failed-precondition", message: "vat_change_not_allowed" });
      expect(fake.writes()).toEqual([]);
    }
  });

  describe("byAdmin (updateBusinessTaxId, B8)", () => {
    function claimByAdmin(fake: ReturnType<typeof fakeTransaction>, instructor: Record<string, unknown>) {
      return claimBusinessVat(fake.tx, {
        uid: OWNER,
        vatNumber: NEW_VAT,
        instructor,
        heldVatNumbers: fake.heldBy(OWNER),
        claimRef,
        now: NOW,
        byAdmin: true,
      });
    }

    it("moves an APPROVED business to another tax id — the admin is who D6 leaves it to", async () => {
      const fake = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: OWNER } });
      await expect(claimByAdmin(fake, instructorWith(OLD_VAT, APPROVED))).resolves.toEqual({
        claim: "claimed",
        released: [OLD_VAT],
      });
      expect(fake.writes()).toEqual([
        ["delete", `businessVat/${OLD_VAT}`],
        ["create", `businessVat/${NEW_VAT}`, { uid: OWNER, createdAt: NOW }],
      ]);
      expectReadsBeforeWrites(fake.ops);
    });

    it("still refuses a tax id another account holds, and writes nothing", async () => {
      const fake = fakeTransaction({
        [`businessVat/${OLD_VAT}`]: { uid: OWNER },
        [`businessVat/${NEW_VAT}`]: { uid: "someone-else" },
      });
      await expect(claimByAdmin(fake, instructorWith(OLD_VAT, APPROVED))).rejects.toMatchObject({
        code: "already-exists",
        message: "vat_already_registered",
      });
      expect(fake.writes()).toEqual([]);
    });
  });
});

describe("field validators shared with the admin route", () => {
  it("parseVatNumber normalises a valid tax id and refuses anything else with invalid_vat", () => {
    expect(parseVatNumber(" IT 123 456 789 03 ")).toBe("12345678903");
    expect(parseVatNumber(ASSOCIATION_CF)).toBe(ASSOCIATION_CF);
    for (const bad of [undefined, null, 12345678903, "", "12345678904", "a/b", "00000000000"]) {
      expectHttpsError(() => parseVatNumber(bad), "invalid-argument", "invalid_vat");
    }
  });

  it("parseLegalName trims and caps, like signup", () => {
    expect(parseLegalName("  ASD Sport  ")).toBe("ASD Sport");
    for (const bad of [undefined, null, 1, "", "   ", "x".repeat(BUSINESS_FIELD_LIMITS.legalName + 1)]) {
      expectHttpsError(() => parseLegalName(bad), "invalid-argument", "invalid_business_name");
    }
  });

  it("parseLegalForm and parseAffiliationNumber keep the signup defaults and limits", () => {
    expect(parseLegalForm(undefined)).toBe("company");
    expect(parseLegalForm("association")).toBe("association");
    expectHttpsError(() => parseLegalForm("srl"), "invalid-argument", "invalid_legal_form");
    expect(parseAffiliationNumber(null)).toBe("");
    expect(parseAffiliationNumber(" RASD 1 ")).toBe("RASD 1");
    expectHttpsError(
      () => parseAffiliationNumber("9".repeat(BUSINESS_FIELD_LIMITS.affiliationNumber + 1)),
      "invalid-argument",
      "invalid_affiliation_number",
    );
  });
});

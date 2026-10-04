import { describe, it, expect } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import {
  BUSINESS_FIELD_LIMITS,
  buildBusinessInstructorPatch,
  claimBusinessVat,
  isExistingBusiness,
  parseProviderType,
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

describe("validateBusinessInput", () => {
  it("trims every field and returns the normalised business details", () => {
    expect(
      validateBusinessInput({
        legalName: "  Karate Club Milano S.r.l. ",
        vatNumber: "12345678903",
        displayName: " Karate Club Milano ",
        description: " Karate, animazione e sport per bambini ",
        website: " https://karateclub.example.it ",
        city: " Milano ",
      }),
    ).toEqual({
      legalName: "Karate Club Milano S.r.l.",
      vatNumber: "12345678903",
      displayName: "Karate Club Milano",
      description: "Karate, animazione e sport per bambini",
      website: "https://karateclub.example.it",
      city: "Milano",
    });
  });

  it("stores the optional fields deterministically, so a re-apply replaces rather than keeps stale ones", () => {
    expect(validateBusinessInput(VALID)).toEqual({
      ...VALID,
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
        displayName: "Karate Club Milano",
        description: "",
        website: null,
        city: "Milano",
      },
    });
  });

  it("uses no dotted key at any depth — it is applied with set(merge), which would take one literally", () => {
    expect(dottedKeys(buildBusinessInstructorPatch(business))).toEqual([]);
  });

  it("copies the details rather than sharing the caller's object", () => {
    const patch = buildBusinessInstructorPatch(business);
    expect(patch.business).not.toBe(business);
  });
});

describe("isExistingBusiness", () => {
  it("is true when either the user or the instructors doc already says business", () => {
    expect(isExistingBusiness({ providerType: "business" }, {})).toBe(true);
    // users/{uid} is owner-writable, so the instructors doc's map is what cannot be faked away.
    expect(isExistingBusiness({}, { business: { displayName: "Karate Club Milano" } })).toBe(true);
  });

  it("is false for an individual or a brand-new applicant", () => {
    expect(isExistingBusiness(undefined, undefined)).toBe(false);
    expect(isExistingBusiness({ providerType: "individual" }, { name: "Mario Rossi" })).toBe(false);
    expect(isExistingBusiness({}, { business: null })).toBe(false);
  });
});

describe("claimBusinessVat", () => {
  const NOW = { sentinel: "serverTimestamp" };
  const REF = { path: "businessVat/12345678903" };

  function fakeTransaction(existing?: Record<string, unknown>) {
    const created: Array<{ ref: unknown; data: Record<string, unknown> }> = [];
    const reads: unknown[] = [];
    return {
      created,
      reads,
      tx: {
        get: async (ref: typeof REF) => {
          reads.push(ref);
          return { exists: existing !== undefined, data: () => existing };
        },
        create: (ref: typeof REF, data: Record<string, unknown>) => {
          created.push({ ref, data });
        },
      },
    };
  }

  it("creates the claim for an unclaimed P.IVA", async () => {
    const { tx, created, reads } = fakeTransaction();
    await expect(claimBusinessVat(tx, REF, "owner-1", NOW)).resolves.toBe("claimed");
    expect(reads).toEqual([REF]);
    expect(created).toEqual([{ ref: REF, data: { uid: "owner-1", createdAt: NOW } }]);
  });

  it("refuses a P.IVA already claimed by another account", async () => {
    const { tx, created } = fakeTransaction({ uid: "someone-else", createdAt: "earlier" });
    const result = claimBusinessVat(tx, REF, "owner-1", NOW);
    await expect(result).rejects.toBeInstanceOf(HttpsError);
    await expect(result).rejects.toMatchObject({ code: "already-exists", message: "vat_already_registered" });
    expect(created).toEqual([]);
  });

  it("lets the same account re-apply without error and leaves its claim as it is", async () => {
    const { tx, created } = fakeTransaction({ uid: "owner-1", createdAt: "earlier" });
    await expect(claimBusinessVat(tx, REF, "owner-1", NOW)).resolves.toBe("already-yours");
    expect(created).toEqual([]);
  });
});

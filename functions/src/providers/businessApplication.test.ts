import { describe, it, expect } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import {
  BUSINESS_FIELD_LIMITS,
  assertNotExistingBusiness,
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

describe("claimBusinessVat", () => {
  const NOW = { sentinel: "serverTimestamp" };
  const OWNER = "owner-1";
  const NEW_VAT = "12345678903";
  const OLD_VAT = "00743110157";

  type Ref = { path: string };
  const claimRef = (vat: string): Ref => ({ path: `businessVat/${vat}` });

  /** A transaction over an in-memory set of claims, recording every operation in order. */
  function fakeTransaction(claims: Record<string, Record<string, unknown>> = {}) {
    const ops: Array<[op: "get" | "create" | "delete", path: string, data?: Record<string, unknown>]> = [];
    return {
      ops,
      writes: () => ops.filter(([op]) => op !== "get"),
      tx: {
        get: async (ref: Ref) => {
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

  function instructorWith(vatNumber: string, extra: Record<string, unknown> = {}) {
    return {
      applicationStatus: "pending",
      providerProfile: { isVerified: false },
      business: { legalName: "Karate Club Milano S.r.l.", vatNumber, displayName: "Karate Club Milano" },
      ...extra,
    };
  }

  function claim(
    tx: ReturnType<typeof fakeTransaction>["tx"],
    instructor: Record<string, unknown> | undefined,
    vatNumber = NEW_VAT,
  ) {
    return claimBusinessVat(tx, { uid: OWNER, vatNumber, instructor, claimRef, now: NOW });
  }

  /** No read may follow a write: Firestore transactions need every read first. */
  function expectReadsBeforeWrites(ops: Array<[string, string, unknown?]>) {
    const firstWrite = ops.findIndex(([op]) => op !== "get");
    if (firstWrite === -1) return;
    expect(ops.slice(firstWrite).filter(([op]) => op === "get")).toEqual([]);
  }

  it("creates the claim for an unclaimed P.IVA", async () => {
    const { tx, ops } = fakeTransaction();
    await expect(claim(tx, undefined)).resolves.toEqual({ claim: "claimed", released: null });
    expect(ops).toEqual([
      ["get", `businessVat/${NEW_VAT}`],
      ["create", `businessVat/${NEW_VAT}`, { uid: OWNER, createdAt: NOW }],
    ]);
  });

  it("refuses a P.IVA already claimed by another account", async () => {
    const { tx, writes } = fakeTransaction({ [`businessVat/${NEW_VAT}`]: { uid: "someone-else" } });
    const result = claim(tx, undefined);
    await expect(result).rejects.toBeInstanceOf(HttpsError);
    await expect(result).rejects.toMatchObject({ code: "already-exists", message: "vat_already_registered" });
    expect(writes()).toEqual([]);
  });

  it("lets the same account re-apply with the same P.IVA and leaves its claim as it is", async () => {
    for (const instructor of [
      undefined,
      instructorWith(NEW_VAT),
      instructorWith(NEW_VAT, { applicationStatus: "verified", providerProfile: { isVerified: true } }),
    ]) {
      const { tx, writes } = fakeTransaction({ [`businessVat/${NEW_VAT}`]: { uid: OWNER } });
      await expect(claim(tx, instructor)).resolves.toEqual({ claim: "already-yours", released: null });
      expect(writes()).toEqual([]);
    }
  });

  it("moves a pending business to its new P.IVA, releasing the old claim in the same transaction", async () => {
    const { tx, ops, writes } = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: OWNER } });
    await expect(claim(tx, instructorWith(OLD_VAT))).resolves.toEqual({ claim: "claimed", released: OLD_VAT });
    expect(writes()).toEqual([
      ["delete", `businessVat/${OLD_VAT}`],
      ["create", `businessVat/${NEW_VAT}`, { uid: OWNER, createdAt: NOW }],
    ]);
    expectReadsBeforeWrites(ops);
  });

  it("treats a rejected business like a pending one — nothing was ever verified", async () => {
    const { tx, writes } = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: OWNER } });
    await expect(claim(tx, instructorWith(OLD_VAT, { applicationStatus: "rejected" })))
      .resolves.toEqual({ claim: "claimed", released: OLD_VAT });
    expect(writes().map(([op, path]) => [op, path])).toEqual([
      ["delete", `businessVat/${OLD_VAT}`],
      ["create", `businessVat/${NEW_VAT}`],
    ]);
  });

  it("never releases an old claim that belongs to someone else", async () => {
    // Until B4, the owner can edit instructors.business.vatNumber from the client; pointing it
    // at another company's P.IVA must not let a re-apply delete that company's claim.
    const { tx, writes } = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: "someone-else" } });
    await expect(claim(tx, instructorWith(OLD_VAT))).resolves.toEqual({ claim: "claimed", released: null });
    expect(writes()).toEqual([["create", `businessVat/${NEW_VAT}`, { uid: OWNER, createdAt: NOW }]]);
  });

  it("does not delete an old claim that no longer exists", async () => {
    const { tx, writes } = fakeTransaction();
    await expect(claim(tx, instructorWith(OLD_VAT))).resolves.toEqual({ claim: "claimed", released: null });
    expect(writes()).toEqual([["create", `businessVat/${NEW_VAT}`, { uid: OWNER, createdAt: NOW }]]);
  });

  it("keeps the old claim when the new P.IVA belongs to someone else", async () => {
    const { tx, writes } = fakeTransaction({
      [`businessVat/${OLD_VAT}`]: { uid: OWNER },
      [`businessVat/${NEW_VAT}`]: { uid: "someone-else" },
    });
    await expect(claim(tx, instructorWith(OLD_VAT))).rejects.toMatchObject({
      code: "already-exists",
      message: "vat_already_registered",
    });
    expect(writes()).toEqual([]);
  });

  it("refuses to change the P.IVA of an approved business (D6: admin-owned after approval)", async () => {
    for (const instructor of [
      instructorWith(OLD_VAT, { applicationStatus: "verified", providerProfile: { isVerified: true } }),
      // A legacy doc without applicationStatus still counts as approved by its flag.
      instructorWith(OLD_VAT, { applicationStatus: undefined, providerProfile: { isVerified: true } }),
    ]) {
      const { tx, writes } = fakeTransaction({ [`businessVat/${OLD_VAT}`]: { uid: OWNER } });
      const result = claim(tx, instructor);
      await expect(result).rejects.toBeInstanceOf(HttpsError);
      await expect(result).rejects.toMatchObject({ code: "failed-precondition", message: "vat_change_not_allowed" });
      expect(writes()).toEqual([]);
    }
  });
});

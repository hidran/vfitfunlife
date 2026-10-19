import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The admin callables on a business (B8) — releaseBusinessVat, convertBusinessToIndividual,
 * updateBusinessTaxId — and decideProviderApplication's `expectedReview`, run over the shared
 * stateful Firestore fake (test/fakes/fakeFirestore.ts). The rules themselves are unit-tested in
 * businessAdminRules.test.ts; this pins the wiring: who may call, what is read, and exactly what
 * one transaction writes. The fake applies committed writes to shared state, refuses a read
 * after a write, re-runs a transaction whose reads changed before its commit, and records the
 * `FieldValue.delete()` sentinel as `h.DELETE` so a deletion can be told from a null. Multi-call
 * sequences across these callables live in businessLifecycle.test.ts.
 */

type Ref = { path: string };

const h = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("../../test/fakes/fakeFirestore");
  const admins = new Set<string>();
  return {
    ...createFakeFirestore(),
    admins,
    requireAdmin: async (uid: string) => {
      if (!admins.has(uid)) throw new Error("Admin access required");
    },
  };
});

vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => h.db, FieldValue: h.FieldValue }));
// utils/roles opens admin.firestore() at module load: replace it with the admin check the
// callables use and the permission table commitProviderDecision reads.
vi.mock("../utils/roles", () => ({
  requireAdmin: (uid: string) => h.requireAdmin(uid),
  getDefaultPermissionsForRole: () => ["bookings:read", "services:read"],
}));

import { releaseBusinessVat, convertBusinessToIndividual, updateBusinessTaxId } from "./businessAdmin";
import { decideProviderApplication } from "./decideProviderApplication";
import { dottedKeys } from "../../test/fakes/fakeFirestore";

type Callable = { run: (r: unknown) => Promise<unknown> };

function callAs(uid: string | null, fn: unknown, data: Record<string, unknown>) {
  return (fn as Callable).run({
    auth: uid ? { uid, token: { email: `${uid}@token.example` } } : undefined,
    data,
  });
}
const asAdmin = (fn: unknown, data: Record<string, unknown>) => callAs("admin-1", fn, data);

const VAT = "12345678903";
const OTHER_VAT = "00743110157";
const STRAY_VAT = "01114601006";
const COMPANY = {
  legalName: "Karate Club Milano S.r.l.",
  vatNumber: VAT,
  legalForm: "company",
  affiliationNumber: "",
  displayName: "Karate Club Milano",
  description: "Karate per tutti",
  website: null,
  city: "Milano",
};
const USER = { fullName: "Mario Rossi", role: "provider", email: "mario@example.it", providerType: "business" };
const APPROVED_COMPANY = {
  uid: "u1",
  name: "Karate Club Milano",
  fullName: "Karate Club Milano",
  applicationStatus: "verified",
  providerProfile: { isVerified: true, bio: "", rating: 4.5, reviewCount: 3 },
  business: COMPANY,
};

const paths = () => h.ops.map(([op, path]) => [op, path]);
const auditEntries = () =>
  h.ops.filter(([op, path]) => op === "set" && path.startsWith("audit_logs/")).map(([, , data]) => data);

describe("admin callables on a business (handler)", () => {
  beforeEach(() => {
    h.reset();
    h.admins.clear();
    h.admins.add("admin-1");
    h.put("users/admin-1", { email: "admin@vfit.com", role: "admin" });
    h.put("users/customer-1", { email: "c@example.it", role: "customer" });
  });

  it("the fake transaction refuses a read after a write, so every test here proves reads come first", async () => {
    await expect(
      h.db.runTransaction(async (t) => {
        const tx = t as { get(r: Ref): Promise<unknown>; set(r: Ref, d: unknown): void };
        tx.set({ path: "users/u1" }, {});
        await tx.get({ path: "users/u1" });
      }),
    ).rejects.toThrow("all reads to be executed before all writes");
  });

  describe("permission", () => {
    const CALLS: Array<[string, unknown, Record<string, unknown>]> = [
      ["releaseBusinessVat", releaseBusinessVat, { vatNumber: VAT }],
      ["convertBusinessToIndividual", convertBusinessToIndividual, { providerId: "u1" }],
      ["updateBusinessTaxId", updateBusinessTaxId, { providerId: "u1", vatNumber: OTHER_VAT }],
    ];

    it.each(CALLS)("%s: a non-admin caller gets permission-denied and nothing is read or written", async (_name, fn, data) => {
      h.put("users/u1", USER);
      h.put("instructors/u1", APPROVED_COMPANY);
      h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
      await expect(callAs("customer-1", fn, data)).rejects.toMatchObject({ code: "permission-denied" });
      expect(h.state.transactions).toBe(0);
      expect(h.ops).toEqual([]);
    });

    it.each(CALLS)("%s: a signed-out caller gets unauthenticated", async (_name, fn, data) => {
      await expect(callAs(null, fn, data)).rejects.toMatchObject({ code: "unauthenticated" });
      expect(h.ops).toEqual([]);
    });

    it("a superadmin passes the same admin check (none of these is superadmin-only)", async () => {
      h.admins.add("super-1");
      h.put("users/super-1", { email: "super@vfit.com", role: "superadmin" });
      h.put(`businessVat/${VAT}`, { uid: "gone", createdAt: "T0" });
      await expect(callAs("super-1", releaseBusinessVat, { vatNumber: VAT })).resolves.toMatchObject({ success: true });
      expect(auditEntries()[0]).toMatchObject({ actorUid: "super-1", actorRole: "superadmin" });
    });
  });

  describe("decideProviderApplication: expectedReview", () => {
    beforeEach(() => {
      h.put("users/u1", { ...USER, role: "customer", providerStatus: "pending" });
      h.put("instructors/u1", { ...APPROVED_COMPANY, applicationStatus: "pending", providerProfile: { isVerified: false } });
      h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
    });

    it("passes the reviewed tax id and legal name through: a match approves", async () => {
      await expect(
        asAdmin(decideProviderApplication, {
          providerId: "u1",
          decision: "verified",
          expectedReview: { vatNumber: `IT ${VAT}`, legalName: COMPANY.legalName },
        }),
      ).resolves.toMatchObject({ success: true, decision: "verified" });
      expect(h.ops).toContainEqual(["set", "instructors/u1", expect.objectContaining({ applicationStatus: "verified" }), { merge: true }]);
    });

    it("a swapped tax id is refused with stale_review, a missing review with review_required", async () => {
      await expect(
        asAdmin(decideProviderApplication, {
          providerId: "u1",
          decision: "verified",
          expectedReview: { vatNumber: OTHER_VAT, legalName: COMPANY.legalName },
        }),
      ).rejects.toMatchObject({ code: "failed-precondition", message: "stale_review" });
      await expect(
        asAdmin(decideProviderApplication, { providerId: "u1", decision: "verified" }),
      ).rejects.toMatchObject({ code: "failed-precondition", message: "review_required" });
      expect(h.ops).toEqual([]);
    });

    it("a matching review of a company that no longer holds its claim is refused with claim_missing", async () => {
      h.remove(`businessVat/${VAT}`);
      await expect(
        asAdmin(decideProviderApplication, {
          providerId: "u1",
          decision: "verified",
          expectedReview: { vatNumber: VAT, legalName: COMPANY.legalName },
        }),
      ).rejects.toMatchObject({ code: "failed-precondition", message: "claim_missing" });
      expect(h.ops).toEqual([]);
    });

    it("a rejection needs no review", async () => {
      await expect(
        asAdmin(decideProviderApplication, { providerId: "u1", decision: "rejected", notes: "P.IVA cessata" }),
      ).resolves.toMatchObject({ success: true, decision: "rejected" });
    });

    it("still refuses a non-admin", async () => {
      await expect(
        callAs("customer-1", decideProviderApplication, { providerId: "u1", decision: "verified" }),
      ).rejects.toMatchObject({ code: "permission-denied" });
      expect(h.ops).toEqual([]);
    });

    it("an id that can't name a document is invalid_provider_id, not internal", async () => {
      for (const providerId of ["a/b", "", undefined]) {
        await expect(asAdmin(decideProviderApplication, { providerId, decision: "verified" })).rejects.toMatchObject({
          code: "invalid-argument",
          message: "invalid_provider_id",
        });
      }
      expect(h.ops).toEqual([]);
    });
  });

  describe("releaseBusinessVat", () => {
    it("refuses an invalid tax id with invalid_vat before reading anything", async () => {
      await expect(asAdmin(releaseBusinessVat, { vatNumber: "a/b" })).rejects.toMatchObject({
        code: "invalid-argument",
        message: "invalid_vat",
      });
      expect(h.state.transactions).toBe(0);
    });

    it("not-found when nobody holds a claim on that number", async () => {
      await expect(asAdmin(releaseBusinessVat, { vatNumber: VAT })).rejects.toMatchObject({
        code: "not-found",
        message: "claim_not_found",
      });
      expect(h.ops).toEqual([]);
    });

    it("refuses with claim_in_use while the holder's approved or pending company still carries the number", async () => {
      for (const status of ["verified", "pending"]) {
        h.put("instructors/u1", { ...APPROVED_COMPANY, applicationStatus: status });
        h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
        await expect(asAdmin(releaseBusinessVat, { vatNumber: VAT })).rejects.toMatchObject({
          code: "failed-precondition",
          message: "claim_in_use",
        });
      }
      expect(h.ops).toEqual([]);
    });

    it("releases a rejected company's claim and audits it in the same transaction", async () => {
      h.put("instructors/u1", { ...APPROVED_COMPANY, applicationStatus: "rejected", providerProfile: { isVerified: false } });
      h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
      await expect(
        asAdmin(releaseBusinessVat, { vatNumber: `IT ${VAT}`, reason: " real owner called " }),
      ).resolves.toEqual({ success: true, vatNumber: VAT, releasedFrom: "u1" });
      expect(paths()).toEqual([
        ["delete", `businessVat/${VAT}`],
        ["set", expect.stringMatching(/^audit_logs\//)],
      ]);
      expect(auditEntries()).toEqual([
        {
          actorUid: "admin-1",
          actorEmail: "admin@vfit.com",
          actorRole: "admin",
          action: "delete",
          entityType: "business_vat",
          entityId: VAT,
          before: { uid: "u1", createdAt: "T0" },
          after: null,
          reason: "real owner called",
          timestamp: "NOW",
        },
      ]);
    });

    it("refuses a company marked rejected that is still listed (isVerified) — the isApproved definition", async () => {
      h.put("instructors/u1", { ...APPROVED_COMPANY, applicationStatus: "rejected" });
      h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
      await expect(asAdmin(releaseBusinessVat, { vatNumber: VAT })).rejects.toMatchObject({
        code: "failed-precondition",
        message: "claim_in_use",
      });
      expect(h.ops).toEqual([]);
    });

    it("releases an abandoned claim: holder moved to another number, or has no instructors doc", async () => {
      for (const setup of [
        () => h.put("instructors/u1", { ...APPROVED_COMPANY, business: { ...COMPANY, vatNumber: OTHER_VAT } }),
        () => h.docs.delete("instructors/u1"),
      ]) {
        h.ops.length = 0;
        setup();
        h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
        await expect(asAdmin(releaseBusinessVat, { vatNumber: VAT })).resolves.toMatchObject({ success: true });
        expect(paths()[0]).toEqual(["delete", `businessVat/${VAT}`]);
        expect(auditEntries()).toHaveLength(1);
        expect(auditEntries()[0]).not.toHaveProperty("reason");
      }
    });

    it("a claim whose uid cannot name a document is treated as abandoned, not as an internal error", async () => {
      h.put(`businessVat/${VAT}`, { uid: "a/b", createdAt: "T0" });
      await expect(asAdmin(releaseBusinessVat, { vatNumber: VAT })).resolves.toEqual({
        success: true,
        vatNumber: VAT,
        releasedFrom: null,
      });
    });
  });

  describe("convertBusinessToIndividual", () => {
    beforeEach(() => {
      h.put("users/u1", { ...USER, providerStatus: "verified", isVerified: true });
      h.put("instructors/u1", APPROVED_COMPANY);
      h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
      h.put(`businessVat/${STRAY_VAT}`, { uid: "u1", createdAt: "T1" });
      h.put(`businessVat/${OTHER_VAT}`, { uid: "someone-else", createdAt: "T2" });
    });

    it("deletes providerType and the business map (delete sentinels, never null), every claim of the uid, and renames to the person", async () => {
      await expect(
        asAdmin(convertBusinessToIndividual, { providerId: "u1", reason: "sole trader picked Company by mistake" }),
      ).resolves.toEqual({ success: true, providerId: "u1", releasedClaims: [VAT, STRAY_VAT] });

      expect(paths()).toEqual([
        ["update", "users/u1"],
        ["update", "instructors/u1"],
        ["delete", `businessVat/${VAT}`],
        ["delete", `businessVat/${STRAY_VAT}`],
        ["set", expect.stringMatching(/^audit_logs\//)],
      ]);
      const [userWrite, instructorWrite] = h.ops;
      expect(userWrite[2]).toEqual({ providerType: h.DELETE, updatedAt: "NOW" });
      expect(instructorWrite[2]).toEqual({
        business: h.DELETE,
        name: "Mario Rossi",
        fullName: "Mario Rossi",
        updatedAt: "NOW",
      });
      expect((userWrite[2] as Record<string, unknown>).providerType).not.toBeNull();
      expect((instructorWrite[2] as Record<string, unknown>).business).not.toBeNull();
      expect(dottedKeys(h.ops)).toEqual([]);
    });

    it("keeps the verification state: an approved company stays listed, now under the personal name", async () => {
      await asAdmin(convertBusinessToIndividual, { providerId: "u1" });
      for (const [, , data] of h.ops.slice(0, 2)) {
        for (const key of ["applicationStatus", "providerProfile", "providerStatus", "isVerified", "role"]) {
          expect(data).not.toHaveProperty(key);
        }
      }
    });

    it("writes one audit entry with the business map and the claims it removed", async () => {
      await asAdmin(convertBusinessToIndividual, { providerId: "u1", reason: "wrong account type" });
      expect(auditEntries()).toEqual([
        {
          actorUid: "admin-1",
          actorEmail: "admin@vfit.com",
          actorRole: "admin",
          action: "update",
          entityType: "provider",
          entityId: "u1",
          before: { providerType: "business", business: COMPANY, claims: [VAT, STRAY_VAT], name: "Karate Club Milano" },
          after: { providerType: null, business: null, claims: [], name: "Mario Rossi" },
          reason: "wrong account type",
          timestamp: "NOW",
        },
      ]);
    });

    it("converts on either signal: only users.providerType (no instructors doc), or only the business map", async () => {
      h.docs.delete("instructors/u1");
      await expect(asAdmin(convertBusinessToIndividual, { providerId: "u1" })).resolves.toMatchObject({ success: true });
      expect(paths().slice(0, 1)).toEqual([["update", "users/u1"]]);
      expect(paths().some(([, path]) => path === "instructors/u1")).toBe(false);

      h.ops.length = 0;
      h.put("users/u1", { fullName: "Mario Rossi", role: "provider" });
      h.put("instructors/u1", APPROVED_COMPANY);
      await expect(asAdmin(convertBusinessToIndividual, { providerId: "u1" })).resolves.toMatchObject({ success: true });
      expect(paths().slice(0, 2)).toEqual([["update", "users/u1"], ["update", "instructors/u1"]]);
    });

    it("refuses an account that is not a business with not_a_business, writing nothing", async () => {
      h.put("users/u1", { fullName: "Mario Rossi", role: "provider" });
      h.put("instructors/u1", { name: "Mario Rossi", applicationStatus: "verified" });
      await expect(asAdmin(convertBusinessToIndividual, { providerId: "u1" })).rejects.toMatchObject({
        code: "failed-precondition",
        message: "not_a_business",
      });
      expect(h.ops).toEqual([]);
    });

    it("not-found for an unknown user, invalid_provider_id for an id that cannot name a document", async () => {
      await expect(asAdmin(convertBusinessToIndividual, { providerId: "nobody" })).rejects.toMatchObject({
        code: "not-found",
      });
      await expect(asAdmin(convertBusinessToIndividual, { providerId: "a/b" })).rejects.toMatchObject({
        code: "invalid-argument",
        message: "invalid_provider_id",
      });
      expect(h.ops).toEqual([]);
    });

    it("never touches a protected superadmin's doc", async () => {
      h.put("users/u1", { ...USER, role: "superadmin" });
      await expect(asAdmin(convertBusinessToIndividual, { providerId: "u1" })).rejects.toMatchObject({
        code: "permission-denied",
        message: "protected_account",
      });
      expect(h.ops).toEqual([]);
    });
  });

  describe("contention that outlasts Firestore's retries", () => {
    beforeEach(() => {
      h.state.maxAttempts = 1;
      h.put("users/u1", USER);
      h.put("instructors/u1", { ...APPROVED_COMPANY, applicationStatus: "rejected", providerProfile: { isVerified: false } });
      h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
      // Something keeps rewriting the company while each call is in flight.
      h.state.beforeCommit = () => h.put("instructors/u1", { ...APPROVED_COMPANY, applicationStatus: "rejected", providerProfile: { isVerified: false }, searchTerms: ["x"] });
    });

    it.each([
      ["releaseBusinessVat", releaseBusinessVat, { vatNumber: VAT }],
      ["convertBusinessToIndividual", convertBusinessToIndividual, { providerId: "u1" }],
      ["updateBusinessTaxId", updateBusinessTaxId, { providerId: "u1", vatNumber: VAT, legalName: "X S.r.l." }],
    ] as Array<[string, unknown, Record<string, unknown>]>)(
      "%s reports a retryable concurrent_update, never internal, and writes nothing",
      async (_name, fn, data) => {
        await expect(asAdmin(fn, data)).rejects.toMatchObject({ code: "aborted", message: "concurrent_update" });
        expect(h.ops).toEqual([]);
      },
    );
  });

  describe("updateBusinessTaxId", () => {
    beforeEach(() => {
      h.put("users/u1", USER);
      h.put("instructors/u1", APPROVED_COMPANY);
      h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
    });

    it("moves the claim to the new number and updates only the sent fields, as a nested map", async () => {
      h.put(`businessVat/${STRAY_VAT}`, { uid: "u1", createdAt: "T1" });
      await expect(
        asAdmin(updateBusinessTaxId, { providerId: "u1", vatNumber: `IT ${OTHER_VAT}`, legalForm: "association", reason: "typo" }),
      ).resolves.toEqual({ success: true, providerId: "u1", vatNumber: OTHER_VAT, releasedClaims: [VAT, STRAY_VAT] });

      expect(paths()).toEqual([
        ["delete", `businessVat/${VAT}`],
        ["delete", `businessVat/${STRAY_VAT}`],
        ["create", `businessVat/${OTHER_VAT}`],
        ["set", "instructors/u1"],
        ["set", expect.stringMatching(/^audit_logs\//)],
      ]);
      expect(h.ops[2][2]).toEqual({ uid: "u1", createdAt: "NOW" });
      expect(h.ops[3]).toEqual([
        "set",
        "instructors/u1",
        { business: { vatNumber: OTHER_VAT, legalForm: "association" }, updatedAt: "NOW" },
        { merge: true },
      ]);
      expect(dottedKeys(h.ops)).toEqual([]);
    });

    it("leaves the approval as it is — an admin changing a listed company's tax id does not de-list it", async () => {
      await asAdmin(updateBusinessTaxId, { providerId: "u1", vatNumber: OTHER_VAT });
      const instructorWrite = h.ops.find(([op, path]) => op === "set" && path === "instructors/u1");
      expect(Object.keys(instructorWrite?.[2] as object)).toEqual(["business", "updatedAt"]);
    });

    it("refuses a number another account holds with vat_already_registered, writing nothing", async () => {
      h.put(`businessVat/${OTHER_VAT}`, { uid: "someone-else", createdAt: "T2" });
      await expect(asAdmin(updateBusinessTaxId, { providerId: "u1", vatNumber: OTHER_VAT })).rejects.toMatchObject({
        code: "already-exists",
        message: "vat_already_registered",
      });
      expect(h.ops).toEqual([]);
    });

    it("refuses to MOVE onto a number no account claims but another doc still carries ⇒ vat_carried_by_other", async () => {
      h.put("instructors/squatter", { applicationStatus: "rejected", business: { ...COMPANY, vatNumber: OTHER_VAT } });
      await expect(asAdmin(updateBusinessTaxId, { providerId: "u1", vatNumber: OTHER_VAT })).rejects.toMatchObject({
        code: "already-exists",
        message: "vat_carried_by_other",
      });
      expect(h.ops).toEqual([]);
      expect(h.read(`businessVat/${VAT}`)).toEqual({ uid: "u1", createdAt: "T0" });
    });

    it("an unchanged number is a legal-data correction: another doc carrying it does not block it", async () => {
      // The S1 recovery state: the rejected squatter still carries VAT; u1 is the real owner.
      h.put("instructors/squatter", { applicationStatus: "rejected", business: { ...COMPANY, legalName: "Fake S.r.l." } });
      await expect(
        asAdmin(updateBusinessTaxId, { providerId: "u1", vatNumber: VAT, legalName: "Karate Club Milano A.S.D." }),
      ).resolves.toEqual({ success: true, providerId: "u1", vatNumber: VAT, releasedClaims: [] });
      expect(h.read("instructors/u1")).toMatchObject({ business: { vatNumber: VAT, legalName: "Karate Club Milano A.S.D." } });
      expect(h.read(`businessVat/${VAT}`)).toEqual({ uid: "u1", createdAt: "T0" });
    });

    it("an unchanged number whose claim another account holds is still refused (vat_already_registered)", async () => {
      h.put(`businessVat/${VAT}`, { uid: "someone-else", createdAt: "T9" });
      await expect(
        asAdmin(updateBusinessTaxId, { providerId: "u1", vatNumber: VAT, legalName: "Karate Club Milano A.S.D." }),
      ).rejects.toMatchObject({ code: "already-exists", message: "vat_already_registered" });
      expect(h.ops).toEqual([]);
    });

    it("same uid, same number: the claims are left alone and only the sent fields change", async () => {
      await expect(
        asAdmin(updateBusinessTaxId, { providerId: "u1", vatNumber: VAT, legalName: " Karate Club Milano A.S.D. " }),
      ).resolves.toEqual({ success: true, providerId: "u1", vatNumber: VAT, releasedClaims: [] });
      expect(paths()).toEqual([
        ["set", "instructors/u1"],
        ["set", expect.stringMatching(/^audit_logs\//)],
      ]);
      expect(h.ops[0][2]).toEqual({
        business: { vatNumber: VAT, legalName: "Karate Club Milano A.S.D." },
        updatedAt: "NOW",
      });
    });

    it("writes one audit entry with the reviewed fields and claims before and after", async () => {
      await asAdmin(updateBusinessTaxId, {
        providerId: "u1",
        vatNumber: OTHER_VAT,
        legalName: "Karate Club Roma S.r.l.",
        affiliationNumber: "CONI 7",
        reason: "registry shows another number",
      });
      expect(auditEntries()).toEqual([
        {
          actorUid: "admin-1",
          actorEmail: "admin@vfit.com",
          actorRole: "admin",
          action: "update",
          entityType: "provider",
          entityId: "u1",
          before: {
            vatNumber: VAT,
            legalName: COMPANY.legalName,
            legalForm: "company",
            affiliationNumber: "",
            claims: [VAT],
          },
          after: {
            vatNumber: OTHER_VAT,
            legalName: "Karate Club Roma S.r.l.",
            legalForm: "company",
            affiliationNumber: "CONI 7",
            claims: [OTHER_VAT],
          },
          reason: "registry shows another number",
          timestamp: "NOW",
        },
      ]);
    });

    it("requires the doc to be a business: not_a_business without a business map or without a doc", async () => {
      for (const setup of [
        () => h.put("instructors/u1", { name: "Mario Rossi", applicationStatus: "verified" }),
        () => h.docs.delete("instructors/u1"),
      ]) {
        setup();
        await expect(asAdmin(updateBusinessTaxId, { providerId: "u1", vatNumber: OTHER_VAT })).rejects.toMatchObject({
          code: "failed-precondition",
          message: "not_a_business",
        });
      }
      expect(h.ops).toEqual([]);
    });

    it("validates with the signup rules before reading anything", async () => {
      for (const [data, message] of [
        [{ providerId: "u1", vatNumber: "12345678904" }, "invalid_vat"],
        [{ providerId: "u1" }, "invalid_vat"],
        [{ providerId: "u1", vatNumber: OTHER_VAT, legalName: "" }, "invalid_business_name"],
        [{ providerId: "u1", vatNumber: OTHER_VAT, legalForm: "srl" }, "invalid_legal_form"],
        [{ providerId: "u1", vatNumber: OTHER_VAT, affiliationNumber: "9".repeat(41) }, "invalid_affiliation_number"],
        [{ providerId: "", vatNumber: OTHER_VAT }, "invalid_provider_id"],
        [{ providerId: "u1", vatNumber: OTHER_VAT, reason: 5 }, "invalid_reason"],
      ] as const) {
        await expect(asAdmin(updateBusinessTaxId, data)).rejects.toMatchObject({ code: "invalid-argument", message });
      }
      expect(h.state.transactions).toBe(0);
      expect(h.ops).toEqual([]);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * commitProviderDecision over the shared stateful Firestore fake (test/fakes/fakeFirestore.ts).
 * It is ONE transaction: every guard is computed from that transaction's reads and the writes
 * land only if nothing it read changed before the commit (otherwise Firestore — and the fake —
 * re-runs it with fresh reads). Pinned here:
 * - D2: the self-apply (auto-approval) path never verifies a business, even one landing between
 *   the reads and the commit;
 * - B8 / invariant I1: no company is listed with details nobody reviewed — approving a business
 *   needs a matching `expectedReview`, a review sent for a doc that is no longer that company is
 *   stale, and an individual turning into a company mid-approval is refused on the re-run;
 * - invariant I2: approving a company requires that it holds the `businessVat` claim on its tax
 *   id (`claim_missing` / `vat_already_registered`).
 */

const h = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("../../test/fakes/fakeFirestore");
  return createFakeFirestore();
});

vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => h.db, FieldValue: h.FieldValue }));
// utils/roles opens admin.firestore() at module load; only its permission table is used here.
vi.mock("../utils/roles", () => ({
  getDefaultPermissionsForRole: () => ["bookings:read", "services:read"],
}));

import { commitProviderDecision } from "./commitDecision";
import { dottedKeys } from "../../test/fakes/fakeFirestore";

const SELF = { uid: "u1", email: "mario@example.it", role: "customer" };
const ADMIN = { uid: "admin-1", email: "admin@example.it", role: "admin" };
const SELF_APPLY = { requestedCategoryIds: ["hiit"], fullName: "Mario Rossi" };
const VAT = "12345678903";
const OTHER_VAT = "00743110157";
const COMPANY = {
  legalName: "Karate Club Milano S.r.l.",
  vatNumber: VAT,
  displayName: "Karate Club Milano",
};
const REVIEWED = { vatNumber: VAT, legalName: COMPANY.legalName };
const USER = { fullName: "Mario Rossi", role: "customer", email: "mario@example.it" };
const PENDING_COMPANY = {
  uid: "u1",
  name: "Karate Club Milano",
  fullName: "Karate Club Milano",
  applicationStatus: "pending",
  providerProfile: { isVerified: false, bio: "Dal 1990", rating: 0, reviewCount: 0 },
  business: COMPANY,
};

const approve = (expectedReview?: unknown) =>
  commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN, expectedReview });

/** What makes a provider publicly listed: the nested flag the instructors read rule keys on. */
const listed = () => (h.read("instructors/u1")?.providerProfile as { isVerified?: boolean } | undefined)?.isVerified === true;

describe("commitProviderDecision (one transaction)", () => {
  beforeEach(() => {
    h.reset();
    h.put("users/u1", USER);
  });

  it("the fake refuses a read after a write, so every test here proves reads come first", async () => {
    await expect(
      h.db.runTransaction(async (t) => {
        const tx = t as { get(r: unknown): Promise<unknown>; set(r: unknown, d: unknown): void };
        tx.set(h.db.collection("users").doc("u1"), {});
        await tx.get(h.db.collection("users").doc("u1"));
      }),
    ).rejects.toThrow("all reads to be executed before all writes");
  });

  describe("self-apply (auto-approval at signup)", () => {
    it("verifies an individual: role, status, catalogue entry, default hours, draft service and audit — one commit", async () => {
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: SELF, application: SELF_APPLY }),
      ).resolves.toEqual({ draftServicesSeeded: 1 });
      expect(h.state.commits).toBe(1);
      expect(h.read("users/u1")).toMatchObject({
        role: "provider",
        providerStatus: "verified",
        isVerified: true,
        providerProfile: { isVerified: true },
      });
      expect(h.read("instructors/u1")).toMatchObject({
        uid: "u1",
        name: "Mario Rossi",
        applicationStatus: "verified",
        providerProfile: { isVerified: true },
      });
      expect(h.read("instructors/u1/services/requested-hiit")).toMatchObject({ categoryId: "hiit", isActive: false });
      const instructorWrite = h.ops.find(([op, path]) => op === "set" && path === "instructors/u1");
      expect(dottedKeys(instructorWrite?.[2])).toEqual([]);
      expect(h.ops.filter(([, path]) => path.startsWith("audit_logs/"))).toHaveLength(1);
    });

    it("refuses when its own reads show a business (either signal), writing nothing", async () => {
      for (const setup of [
        () => h.put("users/u1", { ...USER, providerType: "business" }),
        () => h.put("instructors/u1", { applicationStatus: "pending", business: COMPANY }),
      ]) {
        h.reset();
        h.put("users/u1", USER);
        setup();
        await expect(
          commitProviderDecision({ providerId: "u1", decision: "verified", actor: SELF, application: SELF_APPLY }),
        ).rejects.toMatchObject({ code: "failed-precondition", message: "business_account_exists" });
        expect(h.ops).toEqual([]);
      }
    });

    it("a business application landing between its reads and its commit: Firestore re-runs it and the re-run refuses", async () => {
      h.state.beforeCommit = () => {
        h.put("users/u1", { ...USER, providerStatus: "pending", providerType: "business" });
        h.put("instructors/u1", PENDING_COMPANY);
      };
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: SELF, application: SELF_APPLY }),
      ).rejects.toMatchObject({ code: "failed-precondition", message: "business_account_exists" });
      expect(h.state.attempts).toBe(2);
      expect(h.ops).toEqual([]);
      expect(listed()).toBe(false);
    });

    it("a benign concurrent write (the admin-index trigger on users/{uid}) just re-runs it — no retry code needed", async () => {
      h.state.beforeCommit = () => h.put("users/u1", { ...USER, searchTokens: ["mario"] });
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: SELF, application: SELF_APPLY }),
      ).resolves.toEqual({ draftServicesSeeded: 1 });
      expect(h.state.attempts).toBe(2);
      expect(h.read("users/u1")).toMatchObject({ providerStatus: "verified", searchTokens: ["mario"] });
    });

    it("contention that outlasts Firestore's retries surfaces as a retryable concurrent_update, not internal", async () => {
      h.state.maxAttempts = 1;
      h.state.beforeCommit = () => h.put("users/u1", { ...USER, searchTokens: ["mario"] });
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: SELF, application: SELF_APPLY }),
      ).rejects.toMatchObject({ code: "aborted", message: "concurrent_update" });
      expect(h.ops).toEqual([]);
    });
  });

  describe("admin approving a company (B8, invariants I1 and I2)", () => {
    beforeEach(() => {
      h.put("users/u1", { ...USER, providerType: "business", providerStatus: "pending" });
      h.put("instructors/u1", PENDING_COMPANY);
      h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
    });

    it("a matching review of a company that holds its claim is approved; name, profile and business map are kept", async () => {
      await expect(approve(REVIEWED)).resolves.toEqual({ draftServicesSeeded: 0 });
      expect(h.read("instructors/u1")).toMatchObject({
        name: "Karate Club Milano",
        fullName: "Karate Club Milano",
        applicationStatus: "verified",
        providerProfile: { isVerified: true, bio: "Dal 1990" },
        business: COMPANY,
      });
      expect(h.read("users/u1")).toMatchObject({ providerStatus: "verified", role: "provider" });
      expect(h.read(`businessVat/${VAT}`)).toEqual({ uid: "u1", createdAt: "T0" });
    });

    it("a swapped tax id or legal name is refused with stale_review and nothing is written", async () => {
      for (const expectedReview of [
        { ...REVIEWED, vatNumber: OTHER_VAT },
        { ...REVIEWED, legalName: "Karate Club Roma S.r.l." },
      ]) {
        await expect(approve(expectedReview)).rejects.toMatchObject({ code: "failed-precondition", message: "stale_review" });
      }
      expect(h.ops).toEqual([]);
      expect(listed()).toBe(false);
    });

    it("approving a company without a review is refused with review_required", async () => {
      await expect(approve()).rejects.toMatchObject({ code: "failed-precondition", message: "review_required" });
      expect(h.ops).toEqual([]);
    });

    it("a company marked only by users.providerType can't be approved unseen either (no map to match)", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { business: _business, ...withoutMap } = PENDING_COMPANY;
      h.put("instructors/u1", withoutMap);
      await expect(approve()).rejects.toMatchObject({ message: "review_required" });
      await expect(approve(REVIEWED)).rejects.toMatchObject({ message: "stale_review" });
      expect(listed()).toBe(false);
    });

    it("no claim on its tax id (released after a rejection) ⇒ claim_missing, nothing written", async () => {
      h.remove(`businessVat/${VAT}`);
      await expect(approve(REVIEWED)).rejects.toMatchObject({ code: "failed-precondition", message: "claim_missing" });
      expect(h.ops).toEqual([]);
      expect(listed()).toBe(false);
    });

    it("another account holds the claim ⇒ vat_already_registered, nothing written", async () => {
      h.put(`businessVat/${VAT}`, { uid: "real-owner", createdAt: "T1" });
      await expect(approve(REVIEWED)).rejects.toMatchObject({ code: "already-exists", message: "vat_already_registered" });
      expect(h.ops).toEqual([]);
    });

    it("the claim moving to someone else between the reads and the commit is caught by the re-run", async () => {
      h.state.beforeCommit = () => h.put(`businessVat/${VAT}`, { uid: "real-owner", createdAt: "T1" });
      await expect(approve(REVIEWED)).rejects.toMatchObject({ message: "vat_already_registered" });
      expect(h.state.attempts).toBe(2);
      expect(h.ops).toEqual([]);
    });

    it("the company re-applying with another tax id between the reads and the commit ⇒ stale_review on the re-run", async () => {
      h.state.beforeCommit = () => {
        h.put("instructors/u1", { ...PENDING_COMPANY, business: { ...COMPANY, vatNumber: OTHER_VAT } });
        h.remove(`businessVat/${VAT}`);
        h.put(`businessVat/${OTHER_VAT}`, { uid: "u1", createdAt: "T2" });
      };
      await expect(approve(REVIEWED)).rejects.toMatchObject({ message: "stale_review" });
      expect(h.ops).toEqual([]);
      expect(listed()).toBe(false);
    });

    it("an unrelated concurrent write (the search-index trigger rewriting searchTerms) re-runs it — no spurious stale_review", async () => {
      h.state.beforeCommit = () => h.put("instructors/u1", { ...PENDING_COMPANY, searchTerms: ["karate"] });
      await expect(approve(REVIEWED)).resolves.toEqual({ draftServicesSeeded: 0 });
      expect(h.state.attempts).toBe(2);
      expect(h.read("instructors/u1")).toMatchObject({ applicationStatus: "verified", searchTerms: ["karate"] });
    });

    it("rejecting a company needs neither a review nor the claim", async () => {
      h.remove(`businessVat/${VAT}`);
      await commitProviderDecision({ providerId: "u1", decision: "rejected", actor: ADMIN, notes: "P.IVA cessata" });
      expect(h.read("instructors/u1")).toMatchObject({ applicationStatus: "rejected", business: COMPANY });
      expect(h.read("users/u1")).toMatchObject({ providerStatus: "rejected" });
    });
  });

  describe("admin approving someone who is not (or no longer) a company", () => {
    beforeEach(() => {
      h.put("instructors/u1", { uid: "u1", name: "Mario Rossi", applicationStatus: "pending", providerProfile: { isVerified: false } });
    });

    it("an individual's approval is unchanged: no review, no claim", async () => {
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN }),
      ).resolves.toEqual({ draftServicesSeeded: 0 });
      expect(listed()).toBe(true);
    });

    it("I1: the individual applies as a company between the admin's reads and the commit ⇒ review_required, nothing listed", async () => {
      h.state.beforeCommit = () => {
        h.put("users/u1", { ...USER, providerStatus: "pending", providerType: "business" });
        h.put("instructors/u1", PENDING_COMPANY);
        h.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "T0" });
      };
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN }),
      ).rejects.toMatchObject({ code: "failed-precondition", message: "review_required" });
      expect(h.ops).toEqual([]);
      expect(listed()).toBe(false);
      expect(h.read("instructors/u1")).toMatchObject({ applicationStatus: "pending", business: COMPANY });
    });

    it("a review sent for a doc that is now an individual is stale (the reviewed company is gone)", async () => {
      await expect(approve(REVIEWED)).rejects.toMatchObject({ code: "failed-precondition", message: "stale_review" });
      expect(h.ops).toEqual([]);
      expect(listed()).toBe(false);
    });

    it("a provider deleted mid-flight ends in a clean not-found, never internal", async () => {
      h.state.beforeCommit = () => h.remove("users/u1");
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN }),
      ).rejects.toMatchObject({ code: "not-found", message: "provider_not_found" });
      expect(h.ops).toEqual([]);
    });

    it("a protected superadmin's docs are never written", async () => {
      h.put("users/u1", { ...USER, role: "superadmin" });
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN }),
      ).rejects.toMatchObject({ code: "permission-denied", message: "protected_account" });
      expect(h.ops).toEqual([]);
    });

    it("never seeds drafts on top of existing services", async () => {
      h.put("instructors/u1", { uid: "u1", applicationStatus: "rejected", requestedCategoryIds: ["hiit"], providerProfile: { isVerified: false } });
      h.put("instructors/u1/services/mine", { name: "Mio HIIT", isActive: true });
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN }),
      ).resolves.toEqual({ draftServicesSeeded: 0 });
      expect(h.read("instructors/u1/services/requested-hiit")).toBeUndefined();
    });
  });
});

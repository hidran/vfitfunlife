import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Handler-level wiring of applyAsProvider over the shared stateful Firestore fake
 * (test/fakes/fakeFirestore.ts). The decisions themselves are unit-tested beside their pure
 * modules; this pins how the callable strings them together — above all that a business never
 * reaches commitProviderDecision (D2).
 *
 * The fake is deliberately strict where Firestore is: a plain `ref.get()` can be served a STALE
 * snapshot (`h.stale`) while a transaction reads the current one; a transaction refuses a read
 * after a write, applies its writes only when it commits, and is re-run when something it read
 * changed before its commit (`fake.state.beforeCommit` lets a test land a write there);
 * `collection().doc(id)` throws for an id that does not name a document ("a/b").
 */

const h = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("../../test/fakes/fakeFirestore");
  return {
    fake: createFakeFirestore(),
    settings: { autoApprove: true },
    commitProviderDecision: vi.fn(),
    /** Run the real commitProviderDecision instead of the mock. */
    realCommit: { on: false },
  };
});
const { fake } = h;

vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => h.fake.db, FieldValue: h.fake.FieldValue }));
vi.mock("../lib/cachedDoc", () => ({ cachedDocRead: async () => h.settings }));
// The real commitProviderDecision when a test asks for it, the mock otherwise.
vi.mock("./commitDecision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commitDecision")>();
  return {
    ...actual,
    commitProviderDecision: (opts: Parameters<typeof actual.commitProviderDecision>[0]) =>
      h.realCommit.on ? actual.commitProviderDecision(opts) : h.commitProviderDecision(opts),
  };
});
// utils/roles opens admin.firestore() at module load; only its permission table is used here.
vi.mock("../utils/roles", () => ({
  getDefaultPermissionsForRole: () => ["bookings:read", "services:read"],
}));

import { applyAsProvider } from "./applyAsProvider";
import { dottedKeys } from "../../test/fakes/fakeFirestore";

type Ref = { path: string };

function call(data: Record<string, unknown>) {
  return (applyAsProvider as unknown as { run: (r: unknown) => Promise<unknown> }).run({
    auth: { uid: "u1", token: { email: "mario@example.it" } },
    data,
  });
}

const COMPANY = {
  legalName: "Karate Club Milano S.r.l.",
  vatNumber: "IT 123 456 789 03",
  displayName: "Karate Club Milano",
};
const VAT = "12345678903";
const OLD_VAT = "00743110157";
const STRAY_VAT = "01114601006";
const USER = { fullName: "Mario Rossi", role: "customer", email: "mario@example.it" };

const PENDING = { applicationStatus: "pending", providerProfile: { isVerified: false, bio: "Dal 1990", rating: 0, reviewCount: 0 } };
const APPROVED = { applicationStatus: "verified", providerProfile: { isVerified: true } };

const paths = () => fake.ops.map(([op, path]) => [op, path]);

describe("applyAsProvider (handler)", () => {
  beforeEach(() => {
    fake.reset();
    h.settings.autoApprove = true;
    h.realCommit.on = false;
    h.commitProviderDecision.mockReset();
    h.commitProviderDecision.mockResolvedValue({ draftServicesSeeded: 1 });
    fake.put("users/u1", USER);
  });

  it("the fake transaction refuses a read after a write, so every business test proves reads come first", async () => {
    await expect(
      fake.db.runTransaction(async (t) => {
        const tx = t as { get(r: Ref): Promise<unknown>; set(r: Ref, d: unknown): void };
        tx.set({ path: "users/u1" }, {});
        await tx.get({ path: "users/u1" });
      }),
    ).rejects.toThrow("all reads to be executed before all writes");
  });

  it("queues a business for review even with auto-approval ON — commitProviderDecision is never called", async () => {
    await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).resolves.toEqual({
      success: true,
      providerId: "u1",
      autoApproved: false,
      draftServicesSeeded: 0,
    });
    expect(h.commitProviderDecision).not.toHaveBeenCalled();

    expect(fake.ops).toEqual([
      ["create", `businessVat/${VAT}`, { uid: "u1", createdAt: "NOW" }],
      ["set", "instructors/u1", expect.objectContaining({
        name: "Karate Club Milano",
        applicationStatus: "pending",
        providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
        business: expect.objectContaining({ vatNumber: VAT, legalForm: "company", affiliationNumber: "" }),
      }), { merge: true }],
      ["update", "users/u1", { providerStatus: "pending", providerType: "business", updatedAt: "NOW" }],
    ]);
    expect(dottedKeys(fake.ops)).toEqual([]);
    // Applied, not just recorded: the account is now a pending company holding its claim.
    expect(fake.read("users/u1")).toMatchObject({ providerStatus: "pending", providerType: "business" });
    expect(fake.read(`businessVat/${VAT}`)).toEqual({ uid: "u1", createdAt: "NOW" });
  });

  it("registers an association under its codice fiscale, with legal form and affiliation number nested", async () => {
    const cf = "97123456788"; // an association's numeric codice fiscale (checksum-valid, no P.IVA office code)
    await call({
      categoryIds: ["hiit"],
      providerType: "business",
      business: { legalName: "ASD Sport e Salute", vatNumber: cf, legalForm: "association", affiliationNumber: " RASD 12345 " },
    });
    expect(paths()).toEqual([["create", `businessVat/${cf}`], ["set", "instructors/u1"], ["update", "users/u1"]]);
    expect((fake.ops[1][2] as Record<string, unknown>).business).toMatchObject({
      vatNumber: cf,
      legalForm: "association",
      affiliationNumber: "RASD 12345",
    });
    expect(dottedKeys(fake.ops)).toEqual([]);
  });

  it("refuses an unknown legal form or an over-long affiliation number before touching anything", async () => {
    await expect(
      call({ categoryIds: ["hiit"], providerType: "business", business: { ...COMPANY, legalForm: "srl" } }),
    ).rejects.toMatchObject({ code: "invalid-argument", message: "invalid_legal_form" });
    await expect(
      call({ categoryIds: ["hiit"], providerType: "business", business: { ...COMPANY, affiliationNumber: "9".repeat(41) } }),
    ).rejects.toMatchObject({ code: "invalid-argument", message: "invalid_affiliation_number" });
    expect(fake.ops).toEqual([]);
  });

  it("still auto-approves an individual through commitProviderDecision, as before", async () => {
    await expect(call({ categoryIds: ["hiit"], fullName: "Mario Rossi" })).resolves.toMatchObject({
      autoApproved: true,
      draftServicesSeeded: 1,
    });
    expect(h.commitProviderDecision).toHaveBeenCalledTimes(1);
    expect(h.commitProviderDecision).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "u1",
      decision: "verified",
      application: { requestedCategoryIds: ["hiit"], fullName: "Mario Rossi" },
    }));
    expect(fake.ops).toEqual([]);
  });

  it("does not retry a lost race itself — commitProviderDecision's transaction already did — and reports it", async () => {
    h.commitProviderDecision.mockRejectedValueOnce(new HttpsError("aborted", "concurrent_update"));
    await expect(call({ categoryIds: ["hiit"] })).rejects.toMatchObject({ code: "aborted", message: "concurrent_update" });
    expect(h.commitProviderDecision).toHaveBeenCalledTimes(1);
  });

  it("with the real commitProviderDecision: a business landing between its reads and its commit is refused on Firestore's re-run", async () => {
    h.realCommit.on = true;
    // The business transaction commits after commitProviderDecision read users/{uid} and
    // instructors/{uid} but before it commits: the fake (like Firestore) sees the read docs
    // changed, re-runs the transaction, and the re-run's own reads now show a business.
    fake.state.beforeCommit = () => {
      fake.put("users/u1", { ...USER, providerStatus: "pending", providerType: "business" });
      fake.put("instructors/u1", { ...PENDING, business: { legalName: COMPANY.legalName, vatNumber: VAT } });
    };
    await expect(call({ categoryIds: ["hiit"], fullName: "Mario Rossi" })).rejects.toMatchObject({
      code: "failed-precondition",
      message: "business_account_exists",
    });
    expect(fake.state.attempts).toBe(2); // the first attempt was aborted, the re-run refused
    expect(fake.ops).toEqual([]); // and nothing was written
    expect(fake.read("users/u1")).toMatchObject({ providerStatus: "pending", providerType: "business" });
  });

  it("with the real commitProviderDecision: an individual is verified in one commit", async () => {
    h.realCommit.on = true;
    await expect(call({ categoryIds: ["hiit"], fullName: "Mario Rossi" })).resolves.toMatchObject({
      autoApproved: true,
      draftServicesSeeded: 1,
    });
    expect(fake.state.commits).toBe(1);
    expect(fake.read("instructors/u1")).toMatchObject({ applicationStatus: "verified", providerProfile: { isVerified: true } });
  });

  it("refuses an individual application from an account that is already a business", async () => {
    fake.put("users/u1", { ...USER, providerType: "business" });
    await expect(call({ categoryIds: ["hiit"] })).rejects.toMatchObject({
      code: "failed-precondition",
      message: "business_account_exists",
    });
    expect(h.commitProviderDecision).not.toHaveBeenCalled();
    expect(fake.ops).toEqual([]);
  });

  it("refuses ANY business re-apply from an approved business, judged on the in-transaction reads", async () => {
    for (const [user, instructor] of [
      // Same tax id: this used to drop the approved company back to pending and de-list it.
      [USER, { ...APPROVED, business: { ...COMPANY, vatNumber: VAT } }],
      // Another tax id.
      [USER, { ...APPROVED, business: { ...COMPANY, vatNumber: OLD_VAT } }],
      // A legacy doc, approved by its flag alone.
      [USER, { providerProfile: { isVerified: true }, business: { ...COMPANY, vatNumber: VAT } }],
      // The client removed instructors.business, but users.providerType cannot be removed.
      [{ ...USER, providerType: "business" }, { ...APPROVED }],
    ] as const) {
      fake.ops.length = 0;
      fake.put("users/u1", user);
      fake.put("instructors/u1", instructor);
      fake.put(`businessVat/${VAT}`, { uid: "u1" });
      fake.put(`businessVat/${OLD_VAT}`, { uid: "u1" });
      // Outside the transaction the handler would still see a plain customer with no
      // instructors doc: only the transaction's reads show the approved business.
      fake.stale.set("users/u1", USER);
      fake.stale.set("instructors/u1", null);
      await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).rejects.toMatchObject({
        code: "failed-precondition",
        message: "business_already_approved",
      });
      expect(fake.ops).toEqual([]);
    }
  });

  it("a rejected business may re-apply with the same tax id", async () => {
    fake.put("instructors/u1", { ...PENDING, applicationStatus: "rejected", business: { ...COMPANY, vatNumber: VAT } });
    fake.put(`businessVat/${VAT}`, { uid: "u1" });
    await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).resolves.toMatchObject({
      autoApproved: false,
    });
    expect(paths()).toEqual([["set", "instructors/u1"], ["update", "users/u1"]]);
  });

  it("a verified individual may still apply as a business (plan §5 default) and is queued", async () => {
    fake.put("users/u1", { ...USER, role: "provider", providerStatus: "verified", isVerified: true });
    fake.put("instructors/u1", { ...APPROVED, name: "Mario Rossi" });
    await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).resolves.toMatchObject({
      autoApproved: false,
    });
    expect(paths()).toEqual([["create", `businessVat/${VAT}`], ["set", "instructors/u1"], ["update", "users/u1"]]);
  });

  it("a pending business moving to a new tax id releases the old claim and keeps its profile", async () => {
    fake.put("instructors/u1", { ...PENDING, business: { ...COMPANY, vatNumber: OLD_VAT } });
    fake.put(`businessVat/${OLD_VAT}`, { uid: "u1" });
    // A stale outer read that has no instructors doc yet: the write must still follow the
    // transaction's read (doc exists ⇒ no createdAt, no profile defaults).
    fake.stale.set("instructors/u1", null);
    await call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY });
    expect(paths()).toEqual([
      ["delete", `businessVat/${OLD_VAT}`],
      ["create", `businessVat/${VAT}`],
      ["set", "instructors/u1"],
      ["update", "users/u1"],
    ]);
    const instructorWrite = fake.ops[2][2] as Record<string, unknown>;
    expect(instructorWrite.providerProfile).toEqual({ isVerified: false });
    expect(instructorWrite).not.toHaveProperty("createdAt");
  });

  it("releases every claim the account holds besides the one it takes, whatever its instructors doc says", async () => {
    // The stored number was edited from the client between applications (possible until B4), so
    // claims piled up under this account; another account's claim is left alone.
    fake.put("instructors/u1", { ...PENDING, business: { ...COMPANY, vatNumber: VAT } });
    fake.put(`businessVat/${OLD_VAT}`, { uid: "u1" });
    fake.put(`businessVat/${STRAY_VAT}`, { uid: "u1" });
    fake.put("businessVat/97123456788", { uid: "someone-else" });
    await call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY });
    expect(paths()).toEqual([
      ["delete", `businessVat/${OLD_VAT}`],
      ["delete", `businessVat/${STRAY_VAT}`],
      ["create", `businessVat/${VAT}`],
      ["set", "instructors/u1"],
      ["update", "users/u1"],
    ]);
  });

  it("a client-written stored tax id like \"a/b\" is never used as a document id (no `internal`)", async () => {
    for (const stored of ["a/b", "a/b/c"]) {
      fake.ops.length = 0;
      fake.remove(`businessVat/${VAT}`);
      fake.put("instructors/u1", { ...PENDING, business: { ...COMPANY, vatNumber: stored } });
      fake.put(`businessVat/${OLD_VAT}`, { uid: "u1" });
      await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).resolves.toMatchObject({
        autoApproved: false,
      });
      expect(paths()).toEqual([
        ["delete", `businessVat/${OLD_VAT}`],
        ["create", `businessVat/${VAT}`],
        ["set", "instructors/u1"],
        ["update", "users/u1"],
      ]);
    }
  });

  describe("pending individual (auto-approval OFF): one transaction like the company branch", () => {
    beforeEach(() => {
      h.settings.autoApprove = false;
    });

    it("queues an individual with the profile defaults when there is no instructors doc", async () => {
      await expect(call({ categoryIds: ["hiit"], fullName: "Mario Rossi" })).resolves.toMatchObject({ autoApproved: false });
      expect(h.commitProviderDecision).not.toHaveBeenCalled();
      expect(fake.read("instructors/u1")).toMatchObject({
        name: "Mario Rossi",
        applicationStatus: "pending",
        providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
        createdAt: "NOW",
      });
      expect(fake.read("users/u1")).toMatchObject({ providerStatus: "pending" });
      expect(fake.read("users/u1")).not.toHaveProperty("providerType");
    });

    it("a company application landing between its reads and its commit: the re-run refuses and the company keeps its data", async () => {
      const company = {
        ...PENDING,
        name: "Karate Club Milano",
        fullName: "Karate Club Milano",
        business: { legalName: COMPANY.legalName, vatNumber: VAT, displayName: "Karate Club Milano" },
      };
      fake.state.beforeCommit = () => {
        fake.put("users/u1", { ...USER, providerStatus: "pending", providerType: "business" });
        fake.put("instructors/u1", company);
        fake.put(`businessVat/${VAT}`, { uid: "u1", createdAt: "NOW" });
      };
      await expect(call({ categoryIds: ["hiit"], fullName: "Mario Rossi" })).rejects.toMatchObject({
        code: "failed-precondition",
        message: "business_account_exists",
      });
      expect(fake.state.attempts).toBe(2);
      expect(fake.ops).toEqual([]);
      expect(fake.read("instructors/u1")).toEqual(company);
    });

    it("judges 'doc exists' on the transaction's read: a stale outer read never resets bio, rating or createdAt", async () => {
      fake.put("instructors/u1", { ...PENDING, applicationStatus: "rejected", createdAt: "T0", name: "Mario" });
      fake.stale.set("instructors/u1", null);
      await call({ categoryIds: ["hiit"], fullName: "Mario Rossi" });
      expect(fake.read("instructors/u1")).toMatchObject({
        applicationStatus: "pending",
        createdAt: "T0",
        providerProfile: { isVerified: false, bio: "Dal 1990", rating: 0, reviewCount: 0 },
      });
    });
  });

  it("company transaction: contention outlasting Firestore's retries is a retryable concurrent_update, not internal", async () => {
    fake.state.maxAttempts = 1;
    fake.state.beforeCommit = () => fake.put("users/u1", { ...USER, searchTokens: ["mario"] });
    await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).rejects.toMatchObject({
      code: "aborted",
      message: "concurrent_update",
    });
    expect(fake.ops).toEqual([]);
  });
});

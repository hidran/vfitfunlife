import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Stateful multi-call sequences across the business callables — applyAsProvider,
 * decideProviderApplication, releaseBusinessVat, convertBusinessToIndividual,
 * updateBusinessTaxId — over ONE shared Firestore fake that applies every commit and re-runs a
 * transaction whose reads changed before it committed (test/fakes/fakeFirestore.ts). The
 * single-call tests could not see the B8a review findings; these replay them end to end and
 * check the two invariants after every step:
 * - I1: no company is listed with details nobody reviewed;
 * - I2: one tax id, one holder — at most one listed company per tax id, and every listed
 *   company holds the `businessVat` claim on its own number.
 */

const h = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("../../test/fakes/fakeFirestore");
  return { fake: createFakeFirestore(), settings: { autoApprove: true } };
});
const { fake } = h;

vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => h.fake.db, FieldValue: h.fake.FieldValue }));
vi.mock("../lib/cachedDoc", () => ({ cachedDocRead: async () => h.settings }));
vi.mock("../utils/roles", () => ({
  requireAdmin: async (uid: string) => {
    if (uid !== "admin-1") throw new Error("Admin access required");
  },
  getDefaultPermissionsForRole: () => ["bookings:read", "services:read"],
}));

import { applyAsProvider } from "./applyAsProvider";
import { decideProviderApplication } from "./decideProviderApplication";
import { convertBusinessToIndividual, releaseBusinessVat, updateBusinessTaxId } from "./businessAdmin";

type Callable = { run: (r: unknown) => Promise<unknown> };
type Data = Record<string, unknown>;

const as = (uid: string, fn: unknown, data: Data) =>
  (fn as Callable).run({ auth: { uid, token: { email: `${uid}@example.it` } }, data });
const admin = (fn: unknown, data: Data) => as("admin-1", fn, data);

/** X: the real owner's tax id. */
const X = "12345678903";
const Y = "00743110157";
const SQUATTER = { legalName: "Fake Karate S.r.l.", vatNumber: X, displayName: "Fake Karate" };
const OWNER = { legalName: "Karate Club Milano S.r.l.", vatNumber: X, displayName: "Karate Club Milano" };

const applyAsCompany = (uid: string, business: Data) =>
  as(uid, applyAsProvider, { categoryIds: ["hiit"], providerType: "business", business });
const approve = (providerId: string, business?: { vatNumber: string; legalName: string }) =>
  admin(decideProviderApplication, {
    providerId,
    decision: "verified",
    ...(business ? { expectedReview: { vatNumber: business.vatNumber, legalName: business.legalName } } : {}),
  });
const reject = (providerId: string) =>
  admin(decideProviderApplication, { providerId, decision: "rejected", notes: "not the owner" });

const instructor = (uid: string) => fake.read(`instructors/${uid}`) as Data | undefined;
const isListed = (uid: string) =>
  (instructor(uid)?.providerProfile as { isVerified?: boolean } | undefined)?.isVerified === true;
const claimHolder = (vat: string) => (fake.read(`businessVat/${vat}`) as { uid?: string } | undefined)?.uid;

/** I2 over the whole store: one listed company per tax id, each holding its own claim. */
function expectOneHolderPerTaxId(): void {
  const listedByVat = new Map<string, string[]>();
  for (const [path, data] of fake.docs) {
    const [collection, uid, ...rest] = path.split("/");
    if (collection !== "instructors" || rest.length) continue;
    const business = data.business as { vatNumber?: string } | undefined;
    if (!business?.vatNumber || (data.providerProfile as { isVerified?: boolean })?.isVerified !== true) continue;
    listedByVat.set(business.vatNumber, [...(listedByVat.get(business.vatNumber) ?? []), uid]);
  }
  for (const [vat, holders] of listedByVat) {
    expect(holders, `listed companies with ${vat}`).toHaveLength(1);
    expect(claimHolder(vat), `claim on ${vat}`).toBe(holders[0]);
  }
}

describe("business lifecycle (multi-call sequences)", () => {
  beforeEach(() => {
    fake.reset();
    h.settings.autoApprove = true;
    fake.put("users/admin-1", { email: "admin@vfit.com", role: "admin" });
    fake.put("users/a", { fullName: "Anna Abusiva", role: "customer", email: "a@example.it" });
    fake.put("users/b", { fullName: "Bruno Titolare", role: "customer", email: "b@example.it" });
  });

  it("S1: squatter rejected → claim released → real owner applies → the squatter can no longer be approved", async () => {
    await applyAsCompany("a", SQUATTER);
    expect(claimHolder(X)).toBe("a");

    await reject("a");
    expect(instructor("a")).toMatchObject({ applicationStatus: "rejected", business: { vatNumber: X } });

    // Allowed: A is rejected and not listed. A still carries X in its doc.
    await expect(admin(releaseBusinessVat, { vatNumber: X })).resolves.toMatchObject({ releasedFrom: "a" });
    expect(claimHolder(X)).toBeUndefined();

    // With no claim, an approval of A (even of exactly what is on screen) is refused.
    await expect(approve("a", SQUATTER)).rejects.toMatchObject({ code: "failed-precondition", message: "claim_missing" });

    await applyAsCompany("b", OWNER);
    expect(claimHolder(X)).toBe("b");

    // The admin UI may still offer Approve on A's page: refused, the number is B's now.
    await expect(approve("a", SQUATTER)).rejects.toMatchObject({ code: "already-exists", message: "vat_already_registered" });
    expect(isListed("a")).toBe(false);

    await expect(approve("b", OWNER)).resolves.toMatchObject({ success: true });
    expect(isListed("b")).toBe(true);
    expect(isListed("a")).toBe(false);
    expectOneHolderPerTaxId();
  });

  it("S1 variant: the released number can't be moved onto another company while the rejected doc still carries it", async () => {
    await applyAsCompany("a", SQUATTER);
    await reject("a");
    await admin(releaseBusinessVat, { vatNumber: X });
    await applyAsCompany("b", { ...OWNER, vatNumber: Y });

    await expect(admin(updateBusinessTaxId, { providerId: "b", vatNumber: X })).rejects.toMatchObject({
      code: "already-exists",
      message: "vat_already_registered",
    });
    expect(claimHolder(Y)).toBe("b");
    expect(instructor("b")).toMatchObject({ business: { vatNumber: Y } });
  });

  it("release → the old holder re-applies with the same number → it holds the claim again and is approvable once reviewed", async () => {
    await applyAsCompany("a", OWNER);
    await reject("a");
    await admin(releaseBusinessVat, { vatNumber: X });
    await expect(approve("a", OWNER)).rejects.toMatchObject({ message: "claim_missing" });

    await applyAsCompany("a", OWNER);
    expect(claimHolder(X)).toBe("a");
    expect(instructor("a")).toMatchObject({ applicationStatus: "pending" });

    await expect(approve("a", OWNER)).resolves.toMatchObject({ success: true });
    expect(isListed("a")).toBe(true);
    // And the number can no longer be freed: A is live.
    await expect(admin(releaseBusinessVat, { vatNumber: X })).rejects.toMatchObject({ message: "claim_in_use" });
    expectOneHolderPerTaxId();
  });

  it("release → an admin sets the company's own number again → the claim is re-created and it is approvable", async () => {
    await applyAsCompany("a", OWNER);
    await reject("a");
    await admin(releaseBusinessVat, { vatNumber: X });
    await expect(approve("a", OWNER)).rejects.toMatchObject({ message: "claim_missing" });

    await expect(admin(updateBusinessTaxId, { providerId: "a", vatNumber: X, reason: "verified with the registry" }))
      .resolves.toMatchObject({ vatNumber: X, releasedClaims: [] });
    expect(claimHolder(X)).toBe("a");
    await expect(approve("a", OWNER)).resolves.toMatchObject({ success: true });
    expectOneHolderPerTaxId();
  });

  it("S2: an individual applies as a company between the admin's reads and commit → review_required, nothing listed", async () => {
    h.settings.autoApprove = false;
    await as("b", applyAsProvider, { categoryIds: ["hiit"], fullName: "Bruno Titolare" });
    expect(instructor("b")).toMatchObject({ applicationStatus: "pending" });

    // The admin approves the individual (no review needed). While that approval is between
    // its reads and its commit, B submits a company application — a whole other transaction.
    let companyApplied: Promise<unknown> = Promise.resolve();
    fake.state.beforeCommit = async () => {
      companyApplied = applyAsCompany("b", OWNER);
      await companyApplied;
    };
    await expect(approve("b")).rejects.toMatchObject({ code: "failed-precondition", message: "review_required" });
    await expect(companyApplied).resolves.toMatchObject({ autoApproved: false });

    expect(isListed("b")).toBe(false);
    expect(instructor("b")).toMatchObject({ applicationStatus: "pending", business: { vatNumber: X } });
    expect(fake.read("users/b")).toMatchObject({ providerStatus: "pending", providerType: "business" });

    // Once someone has actually reviewed the company, it can be approved.
    await expect(approve("b", OWNER)).resolves.toMatchObject({ success: true });
    expect(isListed("b")).toBe(true);
    expectOneHolderPerTaxId();
  });

  it("S2 (b): a review loaded for a company that was converted to an individual meanwhile is stale", async () => {
    await applyAsCompany("b", OWNER);
    await admin(convertBusinessToIndividual, { providerId: "b", reason: "picked Company by mistake" });
    expect(claimHolder(X)).toBeUndefined();

    await expect(approve("b", OWNER)).rejects.toMatchObject({ code: "failed-precondition", message: "stale_review" });
    expect(isListed("b")).toBe(false);
    // Without the stale review it is an ordinary individual's approval.
    await expect(approve("b")).resolves.toMatchObject({ success: true });
    expect(instructor("b")).toMatchObject({ name: "Bruno Titolare" });
    expect(instructor("b")).not.toHaveProperty("business");
  });

  it("an approved company converted to an individual frees its number for the real owner", async () => {
    await applyAsCompany("a", SQUATTER);
    await approve("a", SQUATTER);
    expect(isListed("a")).toBe(true);
    await expect(applyAsCompany("b", OWNER)).rejects.toMatchObject({ message: "vat_already_registered" });

    await admin(convertBusinessToIndividual, { providerId: "a" });
    expect(isListed("a")).toBe(true); // still listed, now as the person
    expect(instructor("a")).toMatchObject({ name: "Anna Abusiva" });

    await applyAsCompany("b", OWNER);
    await expect(approve("b", OWNER)).resolves.toMatchObject({ success: true });
    expectOneHolderPerTaxId();
  });

  it("a company re-applying with another tax id after the admin loaded it is stale; the new one is approvable", async () => {
    await applyAsCompany("a", { ...OWNER, vatNumber: Y });
    const onScreen = { vatNumber: Y, legalName: OWNER.legalName };
    await applyAsCompany("a", OWNER); // moves to X, releasing Y
    expect(claimHolder(Y)).toBeUndefined();

    await expect(approve("a", onScreen)).rejects.toMatchObject({ message: "stale_review" });
    expect(isListed("a")).toBe(false);
    await expect(approve("a", OWNER)).resolves.toMatchObject({ success: true });
    expectOneHolderPerTaxId();
  });
});

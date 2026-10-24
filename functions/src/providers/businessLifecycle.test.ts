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
const user = (uid: string) => fake.read(`users/${uid}`) as Data | undefined;
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
      message: "vat_carried_by_other",
    });
    expect(claimHolder(Y)).toBe("b");
    expect(instructor("b")).toMatchObject({ business: { vatNumber: Y } });
  });

  it("after the S1 recovery the real owner's legal data stays correctable with its number unchanged", async () => {
    await applyAsCompany("a", SQUATTER);
    await reject("a");
    await admin(releaseBusinessVat, { vatNumber: X });
    await applyAsCompany("b", OWNER);
    await approve("b", OWNER);
    // The rejected squatter still carries X: carriers = [a, b]. Not a move, so not blocked.
    await expect(
      admin(updateBusinessTaxId, { providerId: "b", vatNumber: X, legalName: "Karate Club Milano A.S.D." }),
    ).resolves.toMatchObject({ success: true, vatNumber: X, releasedClaims: [] });
    expect(instructor("b")).toMatchObject({ business: { vatNumber: X, legalName: "Karate Club Milano A.S.D." } });
    expect(isListed("b")).toBe(true);
    expect(claimHolder(X)).toBe("b");
    // A genuine move of another company onto X is still refused (claim held by b).
    fake.put("users/c-co", { fullName: "Carla", role: "customer", email: "c@example.it" });
    await applyAsCompany("c-co", { ...OWNER, legalName: "Altro S.r.l.", vatNumber: Y });
    await expect(admin(updateBusinessTaxId, { providerId: "c-co", vatNumber: X })).rejects.toMatchObject({
      message: "vat_already_registered",
    });
    expectOneHolderPerTaxId();
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

  describe("B12 / S-4: the venue follows the decisions (through the callables)", () => {
    const GYM = { ...OWNER, venueType: "gym", city: "Torino", address: "Via Po 2" };
    const venueDocs = () => [...fake.docs.keys()].filter((path) => /^venues\/[^/]+$/.test(path));
    const auditCount = () => [...fake.docs.keys()].filter((path) => path.startsWith("audit_logs/")).length;
    const reviewOf = (b: Data) => ({
      vatNumber: b.vatNumber, legalName: b.legalName, ...(b.venueType ? { venueType: b.venueType } : {}), address: b.address ?? null,
    });
    const approveVenue = (uid: string, b: Data = GYM) =>
      admin(decideProviderApplication, { providerId: uid, decision: "verified", expectedReview: reviewOf(b) });
    const venue = (uid: string) => fake.read(`venues/biz_${uid}`) as Data | undefined;

    it("approving a company returns its venue id and creates exactly one venue; individuals and `none` create none", async () => {
      await applyAsCompany("b", GYM);
      await expect(approveVenue("b")).resolves.toMatchObject({ success: true, venueId: "biz_b" });
      expect(venueDocs()).toEqual(["venues/biz_b"]);
      expect(venue("b")).toMatchObject({ ownerId: "b", type: "gym", partnerStatus: "pending", name: OWNER.displayName, isActive: true });
      expect(instructor("b")).toMatchObject({ business: { ...GYM, vatNumber: X, venueId: "biz_b" } });

      h.settings.autoApprove = false;
      await as("a", applyAsProvider, { categoryIds: ["hiit"], fullName: "Anna Abusiva" });
      await expect(approve("a")).resolves.toMatchObject({ success: true, venueId: null });

      fake.put("users/c", { fullName: "Carla", role: "customer", email: "c@example.it" });
      const none = { ...OWNER, vatNumber: Y, venueType: "none" };
      await applyAsCompany("c", none);
      await expect(approve("c", { vatNumber: Y, legalName: OWNER.legalName })).resolves.toMatchObject({ success: true, venueId: null });
      expect(venueDocs()).toEqual(["venues/biz_b"]);
    });

    it("a company that never declared premises (venueType omitted by an old client) gets no venue", async () => {
      await applyAsCompany("b", OWNER);
      expect((instructor("b")?.business as Data).venueType).toBe("none");
      await expect(approve("b", OWNER)).resolves.toMatchObject({ success: true, venueId: null });
      expect(venueDocs()).toEqual([]);
    });

    it("a refused approval (stale_review, claim_missing, review_required) creates no venue", async () => {
      await applyAsCompany("a", { ...SQUATTER, venueType: "gym", city: "Torino", address: "Via Po 2" });
      await expect(approve("a", OWNER)).rejects.toMatchObject({ message: "stale_review" });
      await expect(admin(decideProviderApplication, { providerId: "a", decision: "verified" }))
        .rejects.toMatchObject({ message: "review_required" });
      await reject("a");
      await admin(releaseBusinessVat, { vatNumber: X });
      await expect(approveVenue("a", { ...SQUATTER, venueType: "gym", address: "Via Po 2" })).rejects.toMatchObject({ message: "claim_missing" });
      expect(venueDocs()).toEqual([]);
      expect(isListed("a")).toBe(false);
    });

    it("reject-after-approve deactivates the venue; the later approval reactivates the same one, keeping the admin's edits", async () => {
      await applyAsCompany("b", GYM);
      await approveVenue("b");
      fake.put("venues/biz_b", { ...venue("b"), partnerStatus: "active", isPartner: true, photoUrls: ["https://example.com/p.jpg"] });

      await reject("b");
      expect(venue("b")).toMatchObject({ isActive: false, ownerId: "b", partnerStatus: "active" });
      expect(venueDocs()).toEqual(["venues/biz_b"]);

      await applyAsCompany("b", GYM); // re-applying takes the released claim back
      await expect(approveVenue("b")).resolves.toMatchObject({ success: true, venueId: "biz_b" });
      expect(venueDocs()).toEqual(["venues/biz_b"]);
      expect(venue("b")).toMatchObject({
        isActive: true, partnerStatus: "active", isPartner: true, photoUrls: ["https://example.com/p.jpg"],
      });
      expect(instructor("b")).toMatchObject({ business: { venueId: "biz_b" } });
    });

    it("convert → re-apply as a company (no admin reject needed) → pending → approve reactivates the same venue and clears the marker", async () => {
      await applyAsCompany("b", GYM);
      await approveVenue("b");
      fake.put("venues/biz_b", { ...venue("b"), name: "Palestra Rossi Centro", amenities: ["Sauna"] });

      await admin(convertBusinessToIndividual, { providerId: "b" });
      expect(instructor("b")).not.toHaveProperty("business");
      expect(venue("b")).toMatchObject({ isActive: false, ownerId: "b", name: "Palestra Rossi Centro" });
      const audit = [...fake.docs.entries()].filter(([path]) => path.startsWith("audit_logs/")).map(([, d]) => d).at(-1) as { after: Data };
      expect(audit.after).toMatchObject({ venueId: "biz_b", venueDeactivated: true });
      // The conversion leaves a verified individual carrying the marker that reopens the company path.
      expect(user("b")).toMatchObject({ providerStatus: "verified", businessConvertedAt: "NOW" });
      expect(user("b")).not.toHaveProperty("providerType");
      expect(claimHolder(X)).toBeUndefined();

      // S-1 relaxed for a converted account: it may apply as a company again, and goes PENDING
      // like every company (never auto-approved), re-claiming its tax id.
      await expect(applyAsCompany("b", GYM)).resolves.toMatchObject({ success: true, autoApproved: false });
      expect(user("b")).toMatchObject({ providerStatus: "pending", providerType: "business", businessConvertedAt: "NOW" });
      expect(instructor("b")).toMatchObject({ applicationStatus: "pending", business: { vatNumber: X } });
      expect(isListed("b")).toBe(false);
      expect(claimHolder(X)).toBe("b");

      await expect(approveVenue("b")).resolves.toMatchObject({ success: true, venueId: "biz_b" });
      expect(venueDocs()).toEqual(["venues/biz_b"]);
      expect(venue("b")).toMatchObject({ isActive: true, name: "Palestra Rossi Centro", amenities: ["Sauna"], ownerId: "b" });
      expect(instructor("b")).toMatchObject({ business: { venueId: "biz_b" } });
      expect(isListed("b")).toBe(true);
      // Approval of the new company application consumes the marker (same transaction).
      expect(user("b")).not.toHaveProperty("businessConvertedAt");
      expectOneHolderPerTaxId();
    });

    it("the conversion marker is single-use: approved as a company, converted again, it is set again; a never-converted verified individual stays locked", async () => {
      await applyAsCompany("b", GYM);
      await approveVenue("b");
      await admin(convertBusinessToIndividual, { providerId: "b" });
      await applyAsCompany("b", GYM);
      await approveVenue("b");
      expect(user("b")).not.toHaveProperty("businessConvertedAt");
      // A second conversion writes the marker afresh; without it the account would be locked again.
      await admin(convertBusinessToIndividual, { providerId: "b" });
      expect(user("b")).toMatchObject({ businessConvertedAt: "NOW" });
      expect(venue("b")).toMatchObject({ isActive: false });

      // S-1 still holds for an individual who was never a company (auto-approved individual).
      await as("a", applyAsProvider, { categoryIds: ["hiit"] });
      expect(isListed("a")).toBe(true);
      await expect(applyAsCompany("a", { ...GYM, vatNumber: Y })).rejects.toMatchObject({
        code: "failed-precondition", message: "provider_type_locked",
      });
      expect(user("a")).not.toHaveProperty("providerType");
      expect(claimHolder(Y)).toBeUndefined();
    });

    it("a rejected re-application keeps the marker, so the account can apply as a company once more", async () => {
      await applyAsCompany("b", GYM);
      await approveVenue("b");
      await admin(convertBusinessToIndividual, { providerId: "b" });
      await applyAsCompany("b", GYM);
      await reject("b");
      expect(user("b")).toMatchObject({ providerStatus: "rejected", businessConvertedAt: "NOW" });
      await expect(applyAsCompany("b", GYM)).resolves.toMatchObject({ success: true, autoApproved: false });
      await expect(approveVenue("b")).resolves.toMatchObject({ success: true, venueId: "biz_b" });
      expect(user("b")).not.toHaveProperty("businessConvertedAt");
    });

    it("converting a company with no venue, or whose venue belongs to someone else, writes nothing to venues", async () => {
      await applyAsCompany("b", { ...OWNER, venueType: "none" });
      fake.put("venues/biz_b", { name: "Not b's", ownerId: "other", isActive: true });
      await admin(convertBusinessToIndividual, { providerId: "b" });
      expect(fake.read("venues/biz_b")).toEqual({ name: "Not b's", ownerId: "other", isActive: true });
    });

    it("an approval racing another approval of the same company: one venue, both succeed, the loser creates none", async () => {
      await applyAsCompany("b", GYM);
      let second: Promise<unknown> = Promise.resolve();
      fake.state.beforeCommit = async () => {
        second = approveVenue("b");
        await second;
      };
      // The inner approval commits first and creates the venue; the outer one re-runs, sees it linked and active, and creates nothing.
      await expect(approveVenue("b")).resolves.toMatchObject({ success: true, venueId: null });
      await expect(second).resolves.toMatchObject({ success: true, venueId: "biz_b" });
      expect(venueDocs()).toEqual(["venues/biz_b"]);
      expect(instructor("b")).toMatchObject({ business: { venueId: "biz_b" } });
      expectOneHolderPerTaxId();
    });

    it("a venue at biz_<uid> owned by someone else fails the approval with venue_exists and leaves the company pending, un-audited", async () => {
      await applyAsCompany("b", GYM);
      const audited = auditCount();
      fake.put("venues/biz_b", { name: "Promoted", partnerStatus: "active", isPartner: true, ownerId: "other" });
      await expect(approveVenue("b")).rejects.toMatchObject({ code: "already-exists", message: "venue_exists" });
      expect(fake.read("venues/biz_b")).toEqual({ name: "Promoted", partnerStatus: "active", isPartner: true, ownerId: "other" });
      expect(isListed("b")).toBe(false);
      expect(fake.read("users/b")).toMatchObject({ providerStatus: "pending" });
      expect(auditCount()).toBe(audited);
      expectOneHolderPerTaxId();
    });
  });

  describe("an approval racing another write (the competing write commits inside the approval's commit)", () => {
    const auditEntries = () => [...fake.docs.keys()].filter((path) => path.startsWith("audit_logs/"));
    const draftWrites = (uid: string) =>
      fake.ops.filter(([op, path]) => op === "set" && path.startsWith(`instructors/${uid}/services/`));

    it("a second approval of the same provider: both pass, one audit entry each, drafts seeded once", async () => {
      h.settings.autoApprove = false;
      await as("b", applyAsProvider, { categoryIds: ["hiit"], fullName: "Bruno Titolare" });
      let second: Promise<unknown> = Promise.resolve();
      fake.state.beforeCommit = async () => {
        second = approve("b");
        await second;
      };
      await expect(approve("b")).resolves.toMatchObject({ success: true, draftServicesSeeded: 0 });
      await expect(second).resolves.toMatchObject({ success: true, draftServicesSeeded: 1 });
      expect(auditEntries()).toHaveLength(2);
      expect(draftWrites("b")).toHaveLength(1);
      expect(isListed("b")).toBe(true);
    });

    it("updateBusinessTaxId moving the company to another number ⇒ the approval re-runs into stale_review", async () => {
      await applyAsCompany("b", OWNER);
      fake.state.beforeCommit = () => admin(updateBusinessTaxId, { providerId: "b", vatNumber: Y }).then(() => undefined);
      await expect(approve("b", OWNER)).rejects.toMatchObject({ message: "stale_review" });
      expect(isListed("b")).toBe(false);
      expect(instructor("b")).toMatchObject({ business: { vatNumber: Y } });
      expect(claimHolder(Y)).toBe("b");
      expect(claimHolder(X)).toBeUndefined();
    });

    it("convertBusinessToIndividual ⇒ the approval re-runs into stale_review (the reviewed company is gone)", async () => {
      await applyAsCompany("b", OWNER);
      fake.state.beforeCommit = () => admin(convertBusinessToIndividual, { providerId: "b" }).then(() => undefined);
      await expect(approve("b", OWNER)).rejects.toMatchObject({ message: "stale_review" });
      expect(isListed("b")).toBe(false);
      expect(instructor("b")).not.toHaveProperty("business");
    });

    it("a release of the claim (company rejected earlier) ⇒ the re-approval re-runs into claim_missing", async () => {
      await applyAsCompany("a", OWNER);
      await reject("a");
      fake.state.beforeCommit = () => admin(releaseBusinessVat, { vatNumber: X }).then(() => undefined);
      await expect(approve("a", OWNER)).rejects.toMatchObject({ message: "claim_missing" });
      expect(isListed("a")).toBe(false);
      expect(claimHolder(X)).toBeUndefined();
    });

    it("reverse S2: the individual's approval commits first, then the company application re-runs — locked, nothing written", async () => {
      h.settings.autoApprove = false;
      await as("b", applyAsProvider, { categoryIds: ["hiit"], fullName: "Bruno Titolare" });
      // B's company application is between its reads and its commit when the admin's approval
      // of the individual commits; the company transaction is re-run on the approved doc, which
      // is now a verified individual (S-1): provider_type_locked, and no claim is taken.
      fake.state.beforeCommit = () => approve("b").then(() => undefined);
      await expect(applyAsCompany("b", OWNER)).rejects.toMatchObject({ code: "failed-precondition", message: "provider_type_locked" });

      expect(isListed("b")).toBe(true);
      expect(instructor("b")).toMatchObject({ applicationStatus: "verified" });
      expect(instructor("b")).not.toHaveProperty("business");
      expect(fake.read("users/b")).toMatchObject({ providerStatus: "verified" });
      expect(fake.read("users/b")).not.toHaveProperty("providerType", "business");
      expect(claimHolder(X)).toBeUndefined();
      expectOneHolderPerTaxId();
    });
  });
});

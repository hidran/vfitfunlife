import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * B12 — approving a company creates its venue, inside commitProviderDecision's ONE transaction
 * (shared stateful fake: test/fakes/fakeFirestore.ts). The venue is `create`d under
 * `venues/biz_<uid>`, so a venue already living at that id is never overwritten and fails the
 * whole decision atomically (`already-exists` / `venue_exists`); the guards of the branch's
 * transaction (review_required, stale_review, claim_missing, the tax-id claim) run first and a
 * refused decision creates nothing. The real-Firestore counterpart (real ALREADY_EXISTS from
 * the emulator, real concurrent transactions) is test/business-venue.test.ts.
 */

const h = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("../../test/fakes/fakeFirestore");
  return createFakeFirestore();
});

vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => h.db, FieldValue: h.FieldValue }));
vi.mock("../utils/roles", () => ({
  getDefaultPermissionsForRole: () => ["bookings:read", "services:read"],
}));

import { commitProviderDecision } from "./commitDecision";
import { dottedKeys } from "../../test/fakes/fakeFirestore";

const ADMIN = { uid: "admin-1", email: "admin@example.it", role: "admin" };
const VAT = "12345678903";
const BUSINESS = {
  legalName: "Palestra Rossi S.r.l.",
  vatNumber: VAT,
  legalForm: "company",
  affiliationNumber: "CONI-1",
  displayName: "Palestra Rossi",
  description: "Functional training",
  website: "https://palestrarossi.it",
  logoUrl: "https://example.com/logo.png",
  city: "Torino",
  address: "Via Po 2",
  venueType: "school",
};
const REVIEW = {
  vatNumber: VAT,
  legalName: BUSINESS.legalName,
  legalForm: "company",
  affiliationNumber: "CONI-1",
  venueType: "school",
  address: "Via Po 2",
};

const approve = (providerId = "biz", expectedReview: unknown = REVIEW) =>
  commitProviderDecision({ providerId, decision: "verified", actor: ADMIN, expectedReview });
const reject = (providerId = "biz") => commitProviderDecision({ providerId, decision: "rejected", actor: ADMIN });
const venues = () => [...h.docs].filter(([path]) => /^venues\/[^/]+$/.test(path));
const audits = () => [...h.docs].filter(([path]) => path.startsWith("audit_logs/")).map(([, d]) => d);

function seedCompany(uid = "biz", business: Record<string, unknown> = BUSINESS, extra: Record<string, unknown> = {}) {
  h.put(`users/${uid}`, {
    fullName: "Owner", email: `${uid}@example.it`, role: "customer", providerStatus: "pending", providerType: "business",
  });
  h.put(`instructors/${uid}`, {
    uid, name: BUSINESS.displayName, fullName: BUSINESS.displayName, applicationStatus: "pending",
    providerProfile: { isVerified: false }, business, ...extra,
  });
  h.put(`businessVat/${business.vatNumber as string}`, { uid, createdAt: "T0" });
}

beforeEach(() => h.reset());

describe("approval creates the business's venue", () => {
  it("creates exactly one venue owned by the company, with the application's fields", async () => {
    seedCompany();
    const result = await approve();

    expect(result).toEqual({ draftServicesSeeded: 0, venueId: "biz_biz" });
    expect(venues()).toHaveLength(1);
    expect(h.read("venues/biz_biz")).toEqual({
      name: "Palestra Rossi",
      slug: "palestra-rossi-torino",
      type: "school",
      city: "Torino",
      address: "Via Po 2",
      ownerId: "biz",
      partnerStatus: "pending",
      isPartner: false,
      isActive: true,
      memberDiscountPercent: 0,
      partnerInstructorExtraPercent: 0,
      rating: 0,
      reviewCount: 0,
      description: "Functional training",
      heroGradients: [expect.any(String)],
      amenities: [],
      hours: [],
      photoUrls: [],
      createdAt: "NOW",
      updatedAt: "NOW",
    });
    // The venue is created (never set) in the same single commit as the decision.
    expect(h.state.commits).toBe(1);
    expect(h.ops.filter(([op, path]) => op === "create" && path === "venues/biz_biz")).toHaveLength(1);
    expect(h.ops.some(([op, path]) => op === "set" && path.startsWith("venues/"))).toBe(false);
  });

  it("links the venue as a nested map; every other business key survives; no dotted keys anywhere", async () => {
    seedCompany();
    await approve();

    const instructor = h.read("instructors/biz") as Record<string, unknown>;
    expect(instructor.business).toEqual({ ...BUSINESS, venueId: "biz_biz" });
    expect(instructor).toMatchObject({ applicationStatus: "verified", providerProfile: { isVerified: true } });
    expect(h.read("users/biz")).toMatchObject({ providerStatus: "verified", role: "provider" });
    for (const [, , data] of h.ops) expect(dottedKeys(data).filter((k) => k.startsWith("business") || k === "venueId")).toEqual([]);
    expect(dottedKeys(h.read("venues/biz_biz"))).toEqual([]);
    const instructorWrite = h.ops.find(([op, path]) => op === "set" && path === "instructors/biz");
    expect(Object.keys(instructorWrite?.[2] as object)).not.toContain("business.venueId");
    expect((instructorWrite?.[2] as { business: unknown }).business).toEqual({ venueId: "biz_biz" });
  });

  it("records the venue on the audit entry", async () => {
    seedCompany();
    await approve();
    const entries = audits() as Array<{ after: Record<string, unknown> }>;
    expect(entries).toHaveLength(1);
    expect(entries[0].after).toMatchObject({ providerStatus: "verified", venueId: "biz_biz" });
  });

  it("takes the location from the instructor document when it is valid", async () => {
    seedCompany("biz", BUSINESS, { city: "Milano", lat: 45.4642, lng: 9.19 });
    await approve();
    expect(h.read("venues/biz_biz")).toMatchObject({ city: "Milano", lat: 45.4642, lng: 9.19 });
  });

  it("a location saved just before the commit is read inside the transaction, never lost", async () => {
    seedCompany();
    h.state.beforeCommit = () => h.put("instructors/biz", { ...(h.read("instructors/biz") as object), lat: 45.07, lng: 7.69 });
    await approve();
    expect(h.state.attempts).toBe(2);
    expect(h.read("venues/biz_biz")).toMatchObject({ lat: 45.07, lng: 7.69 });
  });

  it("leaves the geo fields out for a (0,0) location", async () => {
    seedCompany("biz", BUSINESS, { lat: 0, lng: 0 });
    await approve();
    const venue = h.read("venues/biz_biz") as Record<string, unknown>;
    expect(venue).not.toHaveProperty("lat");
    expect(venue).not.toHaveProperty("lng");
  });

  it("a company stored without a venueType gets a gym", async () => {
    const { venueType: _omit, address: _address, ...old } = BUSINESS;
    seedCompany("biz", old);
    await approve("biz", { vatNumber: VAT, legalName: BUSINESS.legalName, legalForm: "company", affiliationNumber: "CONI-1" });
    expect(h.read("venues/biz_biz")).toMatchObject({ type: "gym", address: "" });
  });
});

describe("approval that must not create a venue", () => {
  it("re-running the approval creates no second venue and leaves the link alone", async () => {
    seedCompany();
    await approve();
    const before = h.read("venues/biz_biz");
    const second = await approve();
    expect(second.venueId).toBeNull();
    expect(venues()).toHaveLength(1);
    expect(h.read("venues/biz_biz")).toEqual(before);
    expect((h.read("instructors/biz") as { business: { venueId: string } }).business.venueId).toBe("biz_biz");
  });

  it("re-approval after a rejection reuses the venue it already has", async () => {
    seedCompany();
    await approve();
    await reject();
    h.put(`businessVat/${VAT}`, { uid: "biz", createdAt: "T1" }); // a rejection releases the claim; re-applying takes it again
    const again = await approve();
    expect(again.venueId).toBeNull();
    expect(venues()).toHaveLength(1);
    expect((h.read("instructors/biz") as { business: { venueId: string } }).business.venueId).toBe("biz_biz");
  });

  it("venueType none creates no venue and no link", async () => {
    seedCompany("biz", { ...BUSINESS, venueType: "none" });
    const result = await approve("biz", { ...REVIEW, venueType: "none" });
    expect(result.venueId).toBeNull();
    expect(venues()).toHaveLength(0);
    expect((h.read("instructors/biz") as { business: unknown }).business).toEqual({ ...BUSINESS, venueType: "none" });
    expect((audits()[0] as { after: object }).after).not.toHaveProperty("venueId");
  });

  it("rejection creates no venue and keeps the business map", async () => {
    seedCompany();
    const result = await reject();
    expect(result.venueId).toBeNull();
    expect(venues()).toHaveLength(0);
    expect((h.read("instructors/biz") as { business: unknown }).business).toEqual(BUSINESS);
  });

  it("approving an individual creates no venue", async () => {
    h.put("users/ind", { fullName: "Anna", role: "customer", providerStatus: "pending" });
    h.put("instructors/ind", { uid: "ind", name: "Anna", applicationStatus: "pending", providerProfile: { isVerified: false } });
    const result = await commitProviderDecision({ providerId: "ind", decision: "verified", actor: ADMIN });
    expect(result.venueId).toBeNull();
    expect(venues()).toHaveLength(0);
    expect(h.read("instructors/ind")).not.toHaveProperty("business");
  });

  it("a self-apply auto-approval (individual) creates no venue", async () => {
    h.put("users/ind", { fullName: "Anna", role: "customer" });
    const result = await commitProviderDecision({
      providerId: "ind", decision: "verified", actor: { uid: "ind", email: "a@example.it", role: "customer" },
      application: { requestedCategoryIds: ["hiit"], fullName: "Anna" },
    });
    expect(result.venueId).toBeNull();
    expect(venues()).toHaveLength(0);
  });

  it("a provider with no instructors document creates no venue", async () => {
    h.put("users/nodoc", { fullName: "X", role: "customer", providerStatus: "pending" });
    const result = await commitProviderDecision({ providerId: "nodoc", decision: "verified", actor: ADMIN });
    expect(result.venueId).toBeNull();
    expect(venues()).toHaveLength(0);
  });
});

describe("the transaction's guards still run first, and a refused decision creates no venue", () => {
  it("review_required: a company approved unseen", async () => {
    seedCompany();
    await expect(approve("biz", null)).rejects.toMatchObject({ code: "failed-precondition", message: "review_required" });
    expect(h.ops).toEqual([]);
    expect(venues()).toHaveLength(0);
  });

  it("stale_review: the tax id, the legal name — and now the venue type and the address — must match what was reviewed", async () => {
    seedCompany();
    for (const review of [
      { ...REVIEW, vatNumber: "00743110157" },
      { ...REVIEW, legalName: "Altra S.r.l." },
      { ...REVIEW, venueType: "gym" },
      { ...REVIEW, address: "Via Roma 1" },
      { ...REVIEW, address: null },
      { vatNumber: VAT, legalName: BUSINESS.legalName, legalForm: "company", affiliationNumber: "CONI-1" }, // old client: defaults gym / no address
    ]) {
      await expect(approve("biz", review)).rejects.toMatchObject({ code: "failed-precondition", message: "stale_review" });
    }
    expect(h.ops).toEqual([]);
    expect(venues()).toHaveLength(0);
  });

  it("the company re-applying with another venue type between the reads and the commit ⇒ stale_review on the re-run, no venue", async () => {
    seedCompany();
    h.state.beforeCommit = () => h.put("instructors/biz", {
      ...(h.read("instructors/biz") as object), business: { ...BUSINESS, venueType: "studio" },
    });
    await expect(approve()).rejects.toMatchObject({ message: "stale_review" });
    expect(h.state.attempts).toBe(2);
    expect(h.ops).toEqual([]);
    expect(venues()).toHaveLength(0);
  });

  it("an address with surrounding spaces still matches the review that trimmed it", async () => {
    seedCompany("biz", { ...BUSINESS, address: "  Via Po 2 " });
    await approve();
    expect(h.read("venues/biz_biz")).toMatchObject({ address: "Via Po 2" });
  });

  it("claim_missing: the tax-id claim was released", async () => {
    seedCompany();
    h.remove(`businessVat/${VAT}`);
    await expect(approve()).rejects.toMatchObject({ code: "failed-precondition", message: "claim_missing" });
    expect(h.ops).toEqual([]);
    expect(venues()).toHaveLength(0);
  });

  it("vat_already_registered: another account holds the claim", async () => {
    seedCompany();
    h.put(`businessVat/${VAT}`, { uid: "someone-else", createdAt: "T1" });
    await expect(approve()).rejects.toMatchObject({ code: "already-exists", message: "vat_already_registered" });
    expect(h.ops).toEqual([]);
    expect(venues()).toHaveLength(0);
  });

  it("concurrent_update still maps to aborted when contention outlasts the retries, venue or not", async () => {
    seedCompany();
    h.state.maxAttempts = 1;
    h.state.beforeCommit = () => h.put("users/biz", { ...(h.read("users/biz") as object), searchTokens: ["x"] });
    await expect(approve()).rejects.toMatchObject({ code: "aborted", message: "concurrent_update" });
    expect(h.ops).toEqual([]);
    expect(venues()).toHaveLength(0);
  });
});

describe("venue races and clashes", () => {
  it("a venue already at biz_<uid> is never overwritten: venue_exists, and the decision is not half-applied", async () => {
    seedCompany();
    const promoted = { name: "Promoted", partnerStatus: "active", isPartner: true };
    h.put("venues/biz_biz", promoted);

    await expect(approve()).rejects.toMatchObject({ code: "already-exists", message: "venue_exists" });

    expect(h.read("venues/biz_biz")).toEqual(promoted);
    expect(h.read("users/biz")).toMatchObject({ providerStatus: "pending" });
    expect((h.read("instructors/biz") as { business: unknown; applicationStatus: string })).toMatchObject({
      applicationStatus: "pending", business: BUSINESS,
    });
    expect(audits()).toHaveLength(0);
    expect(h.ops).toEqual([]);
  });

  it("two approvals racing: one venue, one link, and the loser ends in a clean no-op (not a second venue)", async () => {
    seedCompany();
    // The competing approval commits between this one's reads and its commit.
    h.state.beforeCommit = async () => {
      h.state.beforeCommit = null;
      await commitProviderDecision({ providerId: "biz", decision: "verified", actor: ADMIN, expectedReview: REVIEW });
    };
    const loser = await approve();

    expect(h.state.attempts).toBe(3); // competitor (1 run) + the loser's first run + its re-run
    expect(loser.venueId).toBeNull();
    expect(venues()).toHaveLength(1);
    expect((h.read("instructors/biz") as { business: { venueId: string } }).business.venueId).toBe("biz_biz");
    expect(audits()).toHaveLength(2);
  });

  it("two approvals that both plan the venue (no contention seen) collide on the id: venue_exists, one venue", async () => {
    seedCompany();
    // Simulates the commit-time ALREADY_EXISTS Firestore raises when a competing create lands
    // on biz_<uid> without touching any doc this transaction read.
    h.state.beforeCommit = () => h.put("venues/biz_biz", { name: "Raced", partnerStatus: "pending" });
    await expect(approve()).rejects.toMatchObject({ code: "already-exists", message: "venue_exists" });
    expect(venues()).toHaveLength(1);
    expect(h.read("venues/biz_biz")).toEqual({ name: "Raced", partnerStatus: "pending" });
    expect(h.read("users/biz")).toMatchObject({ providerStatus: "pending" });
  });

  it("an unrelated failure is not reported as venue_exists", async () => {
    await expect(approve("missing-user")).rejects.toMatchObject({ code: "not-found", message: "provider_not_found" });
  });
});

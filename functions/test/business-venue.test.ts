import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";

// B12 against the Firestore emulator: the venue `create`, the instructor link and the audit
// entry land in ONE real transaction, and the two outcomes a fake can only simulate happen for
// real here — Firestore's own ALREADY_EXISTS on a `create`, and two genuinely concurrent
// approval transactions. The logic matrix is src/providers/commitDecisionVenue.test.ts.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

let decision: typeof import("../src/providers/commitDecision");
let db: admin.firestore.Firestore;

const ADMIN = { uid: "admin1", email: "admin@example.com", role: "admin" };
const VAT = "12345678903";
const BUSINESS = {
  legalName: "Palestra Rossi S.r.l.",
  vatNumber: VAT,
  legalForm: "company",
  affiliationNumber: "",
  displayName: "Palestra Rossi",
  description: "Functional training",
  city: "Torino",
  address: "Via Po 2",
  venueType: "school",
};
const REVIEW = { vatNumber: VAT, legalName: BUSINESS.legalName, legalForm: "company", affiliationNumber: "", venueType: "school", address: "Via Po 2" };

const read = async (path: string) => (await db.doc(path).get()).data();
const venues = async () => (await db.collection("venues").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const approve = (providerId = "biz") =>
  decision.commitProviderDecision({ providerId, decision: "verified", actor: ADMIN, expectedReview: REVIEW });

/** Every key at every depth that contains a dot: a dotted path written through set/merge lands literally. */
function dottedKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof admin.firestore.Timestamp) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
    ...(k.includes(".") ? [`${prefix}${k}`] : []),
    ...dottedKeys(v, `${prefix}${k}/`),
  ]);
}

async function seedCompany(uid = "biz", instructorExtra: Record<string, unknown> = {}) {
  await db.doc(`users/${uid}`).set({
    fullName: "Owner", email: `${uid}@example.com`, role: "customer", isActive: true,
    providerStatus: "pending", providerType: "business",
  });
  await db.doc(`instructors/${uid}`).set({
    uid, name: BUSINESS.displayName, providerType: "business", applicationStatus: "pending",
    providerProfile: { isVerified: false }, business: BUSINESS, ...instructorExtra,
  });
  await db.doc(`businessVat/${VAT}`).set({ uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
}

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-business-venue" });
  db = admin.firestore();
  decision = await import("../src/providers/commitDecision");
});

beforeEach(async () => {
  for (const name of ["users", "instructors", "venues", "audit_logs", "businessVat"]) {
    await db.recursiveDelete(db.collection(name));
  }
});

describe("approving a company in a real transaction", () => {
  it("creates one venue, links it as a nested map, keeps every business key, audits it", async () => {
    await seedCompany("biz", { city: "Milano", lat: 45.4642, lng: 9.19 });

    const result = await approve();

    expect(result).toEqual({ draftServicesSeeded: 0, venueId: "biz_biz" });
    const all = await venues();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id: "biz_biz", name: "Palestra Rossi", type: "school", city: "Milano", address: "Via Po 2",
      lat: 45.4642, lng: 9.19, ownerId: "biz", partnerStatus: "pending", isPartner: false, isActive: true,
    });
    expect(dottedKeys(all[0])).toEqual([]);
    const instructor = await read("instructors/biz");
    expect(instructor?.business).toEqual({ ...BUSINESS, venueId: "biz_biz" });
    expect(dottedKeys(instructor)).toEqual([]);
    expect(await read("users/biz")).toMatchObject({ providerStatus: "verified" });
    const audits = (await db.collection("audit_logs").get()).docs.map((d) => d.data());
    expect(audits).toHaveLength(1);
    expect(audits[0].after).toMatchObject({ providerStatus: "verified", venueId: "biz_biz" });
  });

  it("re-running the approval creates nothing more", async () => {
    await seedCompany();
    await approve();
    expect((await approve()).venueId).toBeNull();
    expect(await venues()).toHaveLength(1);
  });

  it("a venue already at biz_<uid> is never overwritten: venue_exists, and nothing else was written", async () => {
    await seedCompany();
    await db.doc("venues/biz_biz").set({ name: "Promoted", partnerStatus: "active", isPartner: true });

    await expect(approve()).rejects.toMatchObject({ code: "already-exists", message: "venue_exists" });

    expect(await read("venues/biz_biz")).toEqual({ name: "Promoted", partnerStatus: "active", isPartner: true });
    expect(await read("users/biz")).toMatchObject({ providerStatus: "pending" });
    expect((await read("instructors/biz"))?.business).toEqual(BUSINESS);
    expect((await read("instructors/biz"))?.applicationStatus).toBe("pending");
    expect((await db.collection("audit_logs").get()).empty).toBe(true);
  });

  it("two simultaneous approvals yield exactly one venue and one link; a loser is a clean no-op or venue_exists", async () => {
    await seedCompany();

    const results = await Promise.allSettled([approve(), approve()]);

    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "already-exists", message: "venue_exists" });
    }
    expect(await venues()).toHaveLength(1);
    expect((await read("instructors/biz"))?.business?.venueId).toBe("biz_biz");
  });

  it("a refused approval (stale review, missing claim) creates no venue", async () => {
    await seedCompany();
    await expect(
      decision.commitProviderDecision({ providerId: "biz", decision: "verified", actor: ADMIN, expectedReview: { ...REVIEW, venueType: "gym" } }),
    ).rejects.toMatchObject({ message: "stale_review" });
    await db.doc(`businessVat/${VAT}`).delete();
    await expect(approve()).rejects.toMatchObject({ message: "claim_missing" });
    expect(await venues()).toHaveLength(0);
  });

  it("an unrelated failure is not reported as venue_exists", async () => {
    await expect(approve("missing-user")).rejects.toMatchObject({ code: "not-found" });
  });
});

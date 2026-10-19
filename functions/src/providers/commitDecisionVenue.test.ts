import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";

// Runs against the Firestore emulator: the venue, the instructor link and the audit entry
// must land in one batch, which a mocked Firestore cannot show.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

let decision: typeof import("./commitDecision");
let db: admin.firestore.Firestore;

const admin1 = { uid: "admin1", email: "admin@example.com", role: "admin" };

const business = {
  legalName: "Palestra Rossi S.r.l.",
  vatNumber: "01234567897",
  displayName: "Palestra Rossi",
  description: "Functional training",
  website: "https://palestrarossi.it",
  logoUrl: "https://example.com/logo.png",
  city: "Torino",
  address: "Via Po 2",
  venueType: "school",
};

const read = async (path: string) => (await db.doc(path).get()).data();
const venues = async () => (await db.collection("venues").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const approve = (providerId = "biz") =>
  decision.commitProviderDecision({ providerId, decision: "verified", actor: admin1 });

/** Every key at every depth, so a dotted path written through set/merge is caught wherever it lands. */
function dottedKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  if (value instanceof admin.firestore.Timestamp) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
    ...(k.includes(".") ? [`${prefix}${k}`] : []),
    ...dottedKeys(v, `${prefix}${k}/`),
  ]);
}

async function seedProvider(uid: string, instructor: Record<string, unknown>, providerType = "business") {
  await db.doc(`users/${uid}`).set({
    fullName: "Owner", email: `${uid}@example.com`, role: "customer", isActive: true,
    providerStatus: "pending", providerType,
  });
  await db.doc(`instructors/${uid}`).set({ providerType, applicationStatus: "pending", ...instructor });
}

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-commit-venue" });
  db = admin.firestore();
  decision = await import("./commitDecision");
});

beforeEach(async () => {
  for (const name of ["users", "instructors", "venues", "audit_logs"]) {
    await db.recursiveDelete(db.collection(name));
  }
});

describe("commitProviderDecision creates the business's venue", () => {
  it("approval creates exactly one venue owned by the business, with the application's fields", async () => {
    await seedProvider("biz", { name: "Palestra Rossi", fullName: "Palestra Rossi", business });

    const result = await approve();

    const all = await venues();
    expect(all).toHaveLength(1);
    // Deterministic id: what makes concurrent approvals collide instead of both creating.
    expect(result.venueId).toBe("biz_biz");
    expect(all[0].id).toBe("biz_biz");
    expect(all[0]).toMatchObject({
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
      amenities: [],
      hours: [],
    });
    expect((all[0] as { heroGradients: string[] }).heroGradients).toHaveLength(1);
    expect(all[0]).toHaveProperty("createdAt");
    expect(all[0]).toHaveProperty("updatedAt");
    // No saved location yet: not in radius searches until the owner sets one.
    expect(all[0]).not.toHaveProperty("lat");
    expect(all[0]).not.toHaveProperty("lng");
    expect(dottedKeys(all[0])).toEqual([]);
  });

  it("links the venue as a nested map and every other business key survives", async () => {
    await seedProvider("biz", { name: "Palestra Rossi", business });
    const { venueId } = await approve();

    const instructor = await read("instructors/biz");
    expect(instructor?.business).toEqual({ ...business, venueId });
    expect(dottedKeys(instructor)).toEqual([]);
  });

  it("takes the venue's location from the instructor document when it is valid", async () => {
    await seedProvider("biz", { business, city: "Milano", lat: 45.4642, lng: 9.19 });
    await approve();
    const [venue] = await venues();
    expect(venue).toMatchObject({ city: "Milano", lat: 45.4642, lng: 9.19 });
  });

  it("leaves the geo fields out for a (0,0) location", async () => {
    await seedProvider("biz", { business, lat: 0, lng: 0 });
    await approve();
    const [venue] = await venues();
    expect(venue).not.toHaveProperty("lat");
    expect(venue).not.toHaveProperty("lng");
  });

  it("defaults to a gym when the application stored no venueType", async () => {
    const { venueType: _omit, ...withoutType } = business;
    await seedProvider("biz", { business: withoutType });
    await approve();
    expect((await venues())[0]).toMatchObject({ type: "gym" });
  });

  it("records the venue id on the audit entry", async () => {
    await seedProvider("biz", { business });
    const { venueId } = await approve();
    const entries = (await db.collection("audit_logs").get()).docs.map((d) => d.data());
    expect(entries).toHaveLength(1);
    expect(entries[0].after).toMatchObject({ providerStatus: "verified", venueId });
  });

  it("re-running the decision creates no second venue", async () => {
    await seedProvider("biz", { business });
    const first = await approve();
    const second = await approve();
    expect(second.venueId).toBeNull();
    const all = await venues();
    expect(all).toHaveLength(1);
    expect((await read("instructors/biz"))?.business?.venueId).toBe(first.venueId);
  });

  it("re-approval after a rejection reuses the venue it already has", async () => {
    await seedProvider("biz", { business });
    const first = await approve();
    await decision.commitProviderDecision({ providerId: "biz", decision: "rejected", actor: admin1 });
    await approve();
    expect(await venues()).toHaveLength(1);
    expect((await read("instructors/biz"))?.business?.venueId).toBe(first.venueId);
  });

  it("venueType none creates no venue and no link", async () => {
    await seedProvider("biz", { business: { ...business, venueType: "none" } });
    const result = await approve();
    expect(result.venueId).toBeNull();
    expect(await venues()).toHaveLength(0);
    expect((await read("instructors/biz"))?.business).toEqual({ ...business, venueType: "none" });
  });

  it("rejection creates no venue", async () => {
    await seedProvider("biz", { business });
    const result = await decision.commitProviderDecision({ providerId: "biz", decision: "rejected", actor: admin1 });
    expect(result.venueId).toBeNull();
    expect(await venues()).toHaveLength(0);
    expect((await read("instructors/biz"))?.business).toEqual(business);
  });

  it("approving an individual creates no venue", async () => {
    await seedProvider("ind", { name: "Anna", requestedCategoryIds: ["personal_training"] }, "individual");
    const result = await approve("ind");
    expect(result.venueId).toBeNull();
    expect(await venues()).toHaveLength(0);
    expect(await read("instructors/ind")).not.toHaveProperty("business");
  });

  it("approving a provider with no instructors document creates no venue", async () => {
    await db.doc("users/nodoc").set({ fullName: "X", email: "x@example.com", role: "customer", providerStatus: "pending" });
    const result = await approve("nodoc");
    expect(result.venueId).toBeNull();
    expect(await venues()).toHaveLength(0);
  });
});

describe("commitProviderDecision venue races and clashes", () => {
  it("two simultaneous approvals yield exactly one venue and never a second link", async () => {
    await seedProvider("biz", { business });

    const results = await Promise.allSettled([approve(), approve()]);

    expect(await venues()).toHaveLength(1);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason).toMatchObject({ code: "already-exists", message: "venue_exists" });
      }
    }
    expect((await read("instructors/biz"))?.business?.venueId).toBe("biz_biz");
  });

  it("never overwrites a venue that already lives at the id: the approval fails with venue_exists", async () => {
    await seedProvider("biz", { business });
    await db.doc("venues/biz_biz").set({ name: "Promoted", partnerStatus: "active", isPartner: true });

    await expect(approve()).rejects.toMatchObject({ code: "already-exists", message: "venue_exists" });

    expect(await read("venues/biz_biz")).toEqual({ name: "Promoted", partnerStatus: "active", isPartner: true });
    // The batch is atomic: the decision itself was not half-applied.
    expect(await read("users/biz")).toMatchObject({ providerStatus: "pending" });
    expect((await read("instructors/biz"))?.business).toEqual(business);
    expect((await db.collection("audit_logs").get()).empty).toBe(true);
  });

  it("an unrelated commit failure is not reported as venue_exists", async () => {
    await expect(approve("missing-user")).rejects.toMatchObject({ code: "not-found" });
  });
});

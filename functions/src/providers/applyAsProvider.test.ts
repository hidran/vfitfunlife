import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";
import type { CallableRequest } from "firebase-functions/v2/https";

// Runs against the Firestore emulator (firebase emulators:start --only firestore); the
// uniqueness claim is a transaction, which a mocked Firestore cannot exercise honestly.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

let api: typeof import("./applyAsProvider");
let decision: typeof import("./commitDecision");
let db: admin.firestore.Firestore;

const request = (uid: string, data: unknown) =>
  ({ auth: { uid, token: { email: `${uid}@example.com` } }, data }) as CallableRequest;

const VAT = "01234567897";
const business = {
  legalName: "Palestra Rossi S.r.l.",
  vatNumber: "IT 0123 4567 897",
  displayName: "Palestra Rossi",
  description: "Functional training",
  website: "https://palestrarossi.it",
  city: "Torino",
};
const CATEGORY = "personal_training";

async function setAutoApprove(autoApprove: boolean) {
  await db.doc("systemSettings/providerOnboarding").set({ autoApprove });
  (await import("../lib/cachedDoc")).invalidateCachedDoc("systemSettings/providerOnboarding");
}

const apply = (uid: string, data: Record<string, unknown>) =>
  api.applyAsProvider.run(request(uid, { categoryIds: [CATEGORY], ...data }));

const read = async (path: string) => (await db.doc(path).get()).data();

/** Every key at every depth, so a dotted path written through set/merge is caught wherever it lands. */
function dottedKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  if (value instanceof admin.firestore.Timestamp) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
    ...(k.includes(".") ? [`${prefix}${k}`] : []),
    ...dottedKeys(v, `${prefix}${k}/`),
  ]);
}

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-business-apply" });
  db = admin.firestore();
  api = await import("./applyAsProvider");
  decision = await import("./commitDecision");
});

beforeEach(async () => {
  for (const name of ["users", "instructors", "businessVat", "audit_logs", "systemSettings", "venues"]) {
    await db.recursiveDelete(db.collection(name));
  }
  await setAutoApprove(true);
  for (const uid of ["u1", "u2"]) {
    await db.doc(`users/${uid}`).set({
      fullName: `Person ${uid}`, email: `${uid}@example.com`, role: "customer", isActive: true,
    });
  }
});

describe("applyAsProvider for a business", () => {
  it("refuses an invalid P.IVA with the stable code and writes nothing", async () => {
    const userBefore = await read("users/u1");
    await expect(apply("u1", { providerType: "business", business: { ...business, vatNumber: "01234567898" } }))
      .rejects.toMatchObject({ code: "invalid-argument", message: "business_vat_invalid" });
    await expect(apply("u1", { providerType: "business", business: { ...business, vatNumber: 123 } }))
      .rejects.toMatchObject({ code: "invalid-argument", message: "business_vat_invalid" });
    await expect(apply("u1", { providerType: "business" }))
      .rejects.toMatchObject({ code: "invalid-argument", message: "business_required" });
    await expect(apply("u1", { providerType: "company", business }))
      .rejects.toMatchObject({ code: "invalid-argument", message: "provider_type_invalid" });
    expect((await db.doc("instructors/u1").get()).exists).toBe(false);
    expect((await db.collection("businessVat").get()).empty).toBe(true);
    expect(await read("users/u1")).toEqual(userBefore);
  });

  it("is queued for review even with auto-approval on, with the company name and a nested business map", async () => {
    const result = await apply("u1", { providerType: "business", business });
    expect(result).toMatchObject({ success: true, providerId: "u1", status: "pending", autoApproved: false, draftServicesSeeded: 0 });

    const user = await read("users/u1");
    expect(user).toMatchObject({ providerStatus: "pending", providerType: "business", fullName: "Person u1" });

    const instructor = await read("instructors/u1");
    expect(instructor).toMatchObject({
      uid: "u1",
      name: "Palestra Rossi",
      fullName: "Palestra Rossi",
      providerType: "business",
      applicationStatus: "pending",
      providerProfile: { isVerified: false },
      requestedCategoryIds: [CATEGORY],
      business: {
        legalName: "Palestra Rossi S.r.l.",
        vatNumber: VAT,
        displayName: "Palestra Rossi",
        description: "Functional training",
        website: "https://palestrarossi.it/",
        city: "Torino",
        venueType: "gym",
        address: null,
      },
    });
    expect(instructor).not.toHaveProperty("availabilitySchedule");
    expect((await db.collection("instructors/u1/services").get()).empty).toBe(true);

    const claim = await read(`businessVat/${VAT}`);
    expect(claim?.uid).toBe("u1");
    expect(claim?.createdAt).toBeInstanceOf(admin.firestore.Timestamp);
  });

  it("stores the venue type and address for the approval step to create the venue", async () => {
    await apply("u1", {
      providerType: "business",
      business: { ...business, venueType: "studio", address: " Via Roma 1 " },
    });
    expect((await read("instructors/u1"))?.business).toMatchObject({ venueType: "studio", address: "Via Roma 1" });
  });

  it("refuses a P.IVA already claimed by someone else and leaves them untouched", async () => {
    await apply("u1", { providerType: "business", business });
    const userBefore = await read("users/u2");
    await expect(apply("u2", { providerType: "business", business: { ...business, displayName: "Copycat" } }))
      .rejects.toMatchObject({ code: "already-exists", message: "business_vat_taken" });

    expect((await db.doc("instructors/u2").get()).exists).toBe(false);
    expect(await read("users/u2")).toEqual(userBefore);
    expect((await read(`businessVat/${VAT}`))?.uid).toBe("u1");
    expect((await db.collection("businessVat").get()).size).toBe(1);
  });

  it("lets the same user re-apply without a second claim, keeping the original claim time", async () => {
    await apply("u1", { providerType: "business", business });
    const first = await read(`businessVat/${VAT}`);

    const again = await apply("u1", { providerType: "business", business: { ...business, city: "Milano" } });
    expect(again.autoApproved).toBe(false);

    const claims = await db.collection("businessVat").get();
    expect(claims.size).toBe(1);
    expect(claims.docs[0].id).toBe(VAT);
    expect((await read(`businessVat/${VAT}`))?.createdAt).toEqual(first?.createdAt);
    expect((await read("instructors/u1"))?.business).toMatchObject({ city: "Milano", vatNumber: VAT });
  });

  it("releases the caller's previous claim when they re-apply with a different P.IVA", async () => {
    await apply("u1", { providerType: "business", business });
    await apply("u1", { providerType: "business", business: { ...business, vatNumber: "12345678903" } });

    const claims = await db.collection("businessVat").get();
    expect(claims.docs.map((d) => d.id)).toEqual(["12345678903"]);
    // The old number is free for someone else again.
    await expect(apply("u2", { providerType: "business", business })).resolves.toMatchObject({ autoApproved: false });
  });

  it("writes no dotted keys anywhere", async () => {
    await apply("u1", { providerType: "business", business });
    for (const path of ["users/u1", "instructors/u1", `businessVat/${VAT}`]) {
      expect(dottedKeys(await read(path)), path).toEqual([]);
    }
  });
});

describe("applyAsProvider for an individual (unchanged)", () => {
  it("still auto-approves when the setting is on, and records the provider type", async () => {
    const result = await apply("u1", { fullName: "Anna Bianchi" });
    expect(result).toMatchObject({ success: true, status: "verified", autoApproved: true, draftServicesSeeded: 1 });

    expect(await read("users/u1")).toMatchObject({
      providerStatus: "verified", providerType: "individual", role: "provider", isVerified: true,
    });
    const instructor = await read("instructors/u1");
    expect(instructor).toMatchObject({
      name: "Anna Bianchi",
      fullName: "Anna Bianchi",
      providerType: "individual",
      applicationStatus: "verified",
      providerProfile: { isVerified: true },
    });
    expect(instructor).not.toHaveProperty("business");
    expect(dottedKeys(await read("users/u1"))).toEqual([]);
    expect(dottedKeys(instructor)).toEqual([]);
    expect((await db.collection("businessVat").get()).empty).toBe(true);
  });

  it("is queued when the setting is off, as before", async () => {
    await setAutoApprove(false);
    const result = await apply("u1", {});
    expect(result).toMatchObject({ status: "pending", autoApproved: false, draftServicesSeeded: 0 });
    expect(await read("users/u1")).toMatchObject({ providerStatus: "pending", providerType: "individual" });
    expect(await read("instructors/u1")).toMatchObject({
      fullName: "Person u1", providerType: "individual", applicationStatus: "pending",
      providerProfile: { isVerified: false },
    });
  });

  it("ignores a business payload sent with providerType individual", async () => {
    await apply("u1", { providerType: "individual", business });
    expect(await read("instructors/u1")).not.toHaveProperty("business");
    expect((await db.collection("businessVat").get()).empty).toBe(true);
  });
});

describe("applyAsProvider cannot bypass review", () => {
  const admin1 = { uid: "admin1", email: "admin@example.com", role: "admin" };

  it("keeps a pending business pending when it re-applies as an individual with auto-approval on", async () => {
    await apply("u1", { providerType: "business", business });
    const instructorBefore = await read("instructors/u1");
    const userBefore = await read("users/u1");

    await expect(apply("u1", { providerType: "individual", fullName: "Mario" }))
      .rejects.toMatchObject({ code: "failed-precondition", message: "provider_type_locked" });

    expect(await read("instructors/u1")).toEqual(instructorBefore);
    expect(await read("users/u1")).toEqual(userBefore);
    expect(userBefore).toMatchObject({ providerStatus: "pending", providerType: "business", role: "customer" });
  });

  it("asks a business account for its payload rather than locking when the type is not being changed", async () => {
    await apply("u1", { providerType: "business", business });
    const instructorBefore = await read("instructors/u1");
    const userBefore = await read("users/u1");

    await expect(apply("u1", { providerType: "business" }))
      .rejects.toMatchObject({ code: "invalid-argument", message: "business_required" });
    await expect(apply("u1", { fullName: "Mario" }))
      .rejects.toMatchObject({ code: "invalid-argument", message: "business_required" });

    expect(await read("instructors/u1")).toEqual(instructorBefore);
    expect(await read("users/u1")).toEqual(userBefore);
  });

  it("treats a re-application from a business account as a business even when the request says individual", async () => {
    await apply("u1", { providerType: "business", business });
    const result = await apply("u1", { providerType: "individual", business: { ...business, city: "Milano" } });
    expect(result.autoApproved).toBe(false);
    expect(await read("instructors/u1")).toMatchObject({
      providerType: "business", applicationStatus: "pending", fullName: "Palestra Rossi", business: { city: "Milano" },
    });
    expect(await read("users/u1")).toMatchObject({ providerStatus: "pending", providerType: "business" });
  });

  it("keeps a rejected business locked to business after rejection", async () => {
    await apply("u1", { providerType: "business", business });
    await decision.commitProviderDecision({ providerId: "u1", decision: "rejected", actor: admin1 });
    await expect(apply("u1", { providerType: "individual" }))
      .rejects.toMatchObject({ code: "failed-precondition", message: "provider_type_locked" });
    await expect(apply("u1", {})).rejects.toMatchObject({ code: "invalid-argument", message: "business_required" });
    expect(await read("users/u1")).toMatchObject({ providerStatus: "rejected" });
  });

  it("queues a rejected individual on re-apply even with auto-approval on", async () => {
    await setAutoApprove(false);
    await apply("u1", { fullName: "Anna" });
    await decision.commitProviderDecision({ providerId: "u1", decision: "rejected", actor: admin1, notes: "No" });
    await setAutoApprove(true);

    const result = await apply("u1", { fullName: "Anna" });
    expect(result).toMatchObject({ status: "pending", autoApproved: false, draftServicesSeeded: 0 });
    expect(await read("users/u1")).toMatchObject({ providerStatus: "pending", role: "customer" });
    expect(await read("instructors/u1")).toMatchObject({
      applicationStatus: "pending", providerProfile: { isVerified: false },
    });
    expect((await db.collection("instructors/u1/services").get()).empty).toBe(true);
  });

  it("is a no-op for an already verified individual", async () => {
    await apply("u1", { fullName: "Anna" });
    const instructorBefore = await read("instructors/u1");
    const userBefore = await read("users/u1");

    const result = await apply("u1", { fullName: "Someone Else", categoryIds: ["yoga"] });
    expect(result).toEqual({ success: true, providerId: "u1", status: "verified", autoApproved: false, draftServicesSeeded: 0 });
    expect(await read("instructors/u1")).toEqual(instructorBefore);
    expect(await read("users/u1")).toEqual(userBefore);
  });

  it("refuses to convert a verified individual into a business", async () => {
    await apply("u1", { fullName: "Anna" });
    await expect(apply("u1", { providerType: "business", business }))
      .rejects.toMatchObject({ code: "failed-precondition", message: "provider_type_locked" });
    expect((await db.collection("businessVat").get()).empty).toBe(true);
    expect(await read("instructors/u1")).not.toHaveProperty("business");
  });

  it("treats a legacy verified instructor without users.providerStatus as verified", async () => {
    await db.doc("instructors/u1").set({
      uid: "u1", fullName: "Legacy", isActive: true, providerProfile: { isVerified: true, bio: "", rating: 0, reviewCount: 0 },
    });
    const instructorBefore = await read("instructors/u1");
    const userBefore = await read("users/u1");
    expect(userBefore).not.toHaveProperty("providerStatus");

    await expect(apply("u1", { providerType: "business", business }))
      .rejects.toMatchObject({ code: "failed-precondition", message: "provider_type_locked" });
    expect(await apply("u1", { fullName: "Legacy" })).toMatchObject({ status: "verified", autoApproved: false });

    expect(await read("instructors/u1")).toEqual(instructorBefore);
    expect(await read("users/u1")).toEqual(userBefore);
    expect((await db.collection("businessVat").get()).empty).toBe(true);
  });

  it("is a no-op for an already verified business, keeping its claim", async () => {
    await apply("u1", { providerType: "business", business });
    await decision.commitProviderDecision({ providerId: "u1", decision: "verified", actor: admin1 });
    const before = await read("instructors/u1");

    const result = await apply("u1", { providerType: "business", business: { ...business, city: "Milano" } });
    expect(result).toMatchObject({ status: "verified", autoApproved: false, draftServicesSeeded: 0 });
    expect(await read("instructors/u1")).toEqual(before);
    expect((await read(`businessVat/${VAT}`))?.uid).toBe("u1");
  });
});

describe("commitProviderDecision on a business application", () => {
  const admin1 = { uid: "admin1", email: "admin@example.com", role: "admin" };

  it("approval keeps the company name, the provider type and the whole business map", async () => {
    await apply("u1", { providerType: "business", business: { ...business, venueType: "school", address: "Via Po 2" } });
    const before = (await read("instructors/u1"))?.business;

    const { draftServicesSeeded } = await decision.commitProviderDecision({
      providerId: "u1", decision: "verified", actor: admin1, notes: "Checked the P.IVA",
    });
    expect(draftServicesSeeded).toBe(1);

    const instructor = await read("instructors/u1");
    expect(instructor).toMatchObject({
      name: "Palestra Rossi",
      fullName: "Palestra Rossi",
      providerType: "business",
      applicationStatus: "verified",
      providerProfile: { isVerified: true },
    });
    // The business map is exactly what the application stored, plus the link to the venue
    // approval created for it.
    expect(instructor?.business).toEqual({ ...before, venueId: expect.any(String) });
    expect(instructor?.business).toMatchObject({ venueType: "school", address: "Via Po 2" });
    expect(dottedKeys(instructor)).toEqual([]);

    expect(await read("users/u1")).toMatchObject({
      providerStatus: "verified", providerType: "business", role: "provider",
    });
    expect((await read(`businessVat/${VAT}`))?.uid).toBe("u1");
  });

  it("rejection leaves the claim in place", async () => {
    await apply("u1", { providerType: "business", business });
    await decision.commitProviderDecision({ providerId: "u1", decision: "rejected", actor: admin1 });

    expect(await read("instructors/u1")).toMatchObject({
      applicationStatus: "rejected", fullName: "Palestra Rossi", business: { vatNumber: VAT },
    });
    expect((await read(`businessVat/${VAT}`))?.uid).toBe("u1");
  });

  it("never overwrites the stored name with a null application name", async () => {
    await apply("u1", { providerType: "business", business });
    await decision.commitProviderDecision({
      providerId: "u1", decision: "verified", actor: admin1,
      application: { requestedCategoryIds: [CATEGORY], fullName: null },
    });
    expect(await read("instructors/u1")).toMatchObject({ name: "Palestra Rossi", fullName: "Palestra Rossi" });
  });
});

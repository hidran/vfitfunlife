import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";
import type { CallableRequest } from "firebase-functions/v2/https";

// Runs against the Firestore emulator: the release is a transaction that must read the
// claim before deleting it, and the audit entry must commit with it.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

let api: typeof import("./releaseBusinessVat");
let db: admin.firestore.Firestore;

const VAT = "01234567897";

const request = (uid: string | undefined, data: unknown) =>
  ({ auth: uid ? { uid, token: { email: `${uid}@example.com` } } : undefined, data }) as CallableRequest;

const release = (callerUid: string | undefined, data: Record<string, unknown>) =>
  api.releaseBusinessVat.run(request(callerUid, { providerId: "biz", ...data }));

const read = async (path: string) => (await db.doc(path).get()).data();
const auditEntries = async () => (await db.collection("audit_logs").get()).docs.map((d) => d.data());

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-business-release" });
  db = admin.firestore();
  api = await import("./releaseBusinessVat");
});

beforeEach(async () => {
  for (const name of ["users", "instructors", "businessVat", "audit_logs"]) {
    await db.recursiveDelete(db.collection(name));
  }
  await db.doc("users/admin1").set({ email: "admin1@example.com", role: "admin", isActive: true });
  await db.doc("users/super1").set({ email: "super1@example.com", role: "superadmin", isActive: true });
  await db.doc("users/cust1").set({ email: "cust1@example.com", role: "customer", isActive: true });
  await db.doc("users/biz").set({ email: "biz@example.com", role: "customer", providerType: "business" });
  await db.doc("instructors/biz").set({
    providerType: "business",
    business: { legalName: "Palestra Rossi S.r.l.", vatNumber: VAT, displayName: "Palestra Rossi" },
  });
  await db.doc(`businessVat/${VAT}`).set({ uid: "biz", createdAt: admin.firestore.Timestamp.now() });
});

describe("releaseBusinessVat", () => {
  it("lets an admin (not only a superadmin) free the claim, audited, keeping the stored P.IVA", async () => {
    const result = await release("admin1", { reason: "Company closed" });
    expect(result).toEqual({ success: true, providerId: "biz", vatNumber: VAT, released: true });

    expect(await read(`businessVat/${VAT}`)).toBeUndefined();
    // The number stays on the profile: the claim is what was released, not the record.
    expect((await read("instructors/biz"))?.business?.vatNumber).toBe(VAT);

    const entries = await auditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUid: "admin1",
      actorEmail: "admin1@example.com",
      actorRole: "admin",
      action: "update",
      entityType: "provider",
      entityId: "biz",
      before: { vatNumber: VAT, claimed: true },
      after: { claimed: false },
      reason: "Company closed",
    });
    expect(entries[0].timestamp).toBeInstanceOf(admin.firestore.Timestamp);
  });

  it("works for a superadmin too, with no reason", async () => {
    const result = await release("super1", {});
    expect(result).toMatchObject({ released: true });
    const [entry] = await auditEntries();
    expect(entry).toMatchObject({ actorRole: "superadmin" });
    expect(entry).not.toHaveProperty("reason");
  });

  it("is idempotent: a second release succeeds with released: false and no second audit entry", async () => {
    await release("admin1", {});
    const again = await release("admin1", {});
    expect(again).toEqual({ success: true, providerId: "biz", vatNumber: VAT, released: false });
    expect(await auditEntries()).toHaveLength(1);
  });

  it("never deletes a claim held by another uid", async () => {
    await db.doc(`businessVat/${VAT}`).set({ uid: "someone-else", createdAt: admin.firestore.Timestamp.now() });

    const result = await release("admin1", {});
    expect(result).toMatchObject({ released: false });
    expect((await read(`businessVat/${VAT}`))?.uid).toBe("someone-else");
    expect(await auditEntries()).toHaveLength(0);
  });

  it("refuses non-admins and anonymous callers without touching the claim", async () => {
    await expect(release("cust1", {})).rejects.toMatchObject({ code: "permission-denied" });
    await expect(release("biz", {})).rejects.toMatchObject({ code: "permission-denied" });
    await expect(release(undefined, {})).rejects.toMatchObject({ code: "unauthenticated" });
    expect((await read(`businessVat/${VAT}`))?.uid).toBe("biz");
    expect(await auditEntries()).toHaveLength(0);
  });

  it("rejects a missing providerId, an unknown provider and one without a P.IVA", async () => {
    await expect(release("admin1", { providerId: "" })).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(release("admin1", { providerId: "ghost" })).rejects.toMatchObject({ code: "not-found" });
    await db.doc("instructors/solo").set({ providerType: "individual" });
    await expect(release("admin1", { providerId: "solo" }))
      .rejects.toMatchObject({ code: "failed-precondition", message: "business_vat_missing" });
  });
});

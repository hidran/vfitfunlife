import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";

// Runs against the Firestore emulator: both helpers are transaction steps (read-then-write
// ordering, create-vs-set semantics), which a mocked Firestore cannot exercise honestly.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

let api: typeof import("./businessVatClaim");
let db: admin.firestore.Firestore;

const VAT = "01234567897";
const OTHER_VAT = "12345678903";

const claimDoc = async (vat: string) => (await db.doc(`businessVat/${vat}`).get()).data();

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-business-claim" });
  db = admin.firestore();
  api = await import("./businessVatClaim");
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("businessVat"));
});

describe("claimVat", () => {
  it("creates the claim for a free number", async () => {
    await db.runTransaction((tx) => api.claimVat(tx, db, { uid: "u1", vatNumber: VAT }));

    const claim = await claimDoc(VAT);
    expect(claim?.uid).toBe("u1");
    expect(claim?.createdAt).toBeInstanceOf(admin.firestore.Timestamp);
  });

  it("refuses a number someone else holds with the stable code", async () => {
    await db.runTransaction((tx) => api.claimVat(tx, db, { uid: "u1", vatNumber: VAT }));

    await expect(
      db.runTransaction((tx) => api.claimVat(tx, db, { uid: "u2", vatNumber: VAT })),
    ).rejects.toMatchObject({ code: "already-exists", message: "business_vat_taken" });
    expect((await claimDoc(VAT))?.uid).toBe("u1");
  });

  it("is a no-op for the holder, keeping the original claim time", async () => {
    await db.runTransaction((tx) => api.claimVat(tx, db, { uid: "u1", vatNumber: VAT }));
    const first = await claimDoc(VAT);

    await db.runTransaction((tx) => api.claimVat(tx, db, { uid: "u1", vatNumber: VAT }));
    expect((await claimDoc(VAT))?.createdAt).toEqual(first?.createdAt);
    expect((await db.collection("businessVat").get()).size).toBe(1);
  });

  it("releases the caller's previous number when switching, but never someone else's", async () => {
    await db.runTransaction((tx) => api.claimVat(tx, db, { uid: "u1", vatNumber: VAT }));
    await db.runTransaction((tx) =>
      api.claimVat(tx, db, { uid: "u1", vatNumber: OTHER_VAT, previousVat: VAT }),
    );
    expect((await db.collection("businessVat").get()).docs.map((d) => d.id)).toEqual([OTHER_VAT]);

    // u2 now takes VAT; u1 "switching back" from OTHER_VAT must not release u2's claim.
    await db.runTransaction((tx) => api.claimVat(tx, db, { uid: "u2", vatNumber: VAT }));
    await expect(
      db.runTransaction((tx) =>
        api.claimVat(tx, db, { uid: "u1", vatNumber: VAT, previousVat: OTHER_VAT }),
      ),
    ).rejects.toMatchObject({ code: "already-exists" });
    expect((await claimDoc(VAT))?.uid).toBe("u2");
    expect((await claimDoc(OTHER_VAT))?.uid).toBe("u1");
  });
});

describe("releaseClaim", () => {
  it("deletes the holder's claim and reports it", async () => {
    await db.runTransaction((tx) => api.claimVat(tx, db, { uid: "u1", vatNumber: VAT }));

    const released = await db.runTransaction((tx) => api.releaseClaim(tx, db, VAT, "u1"));
    expect(released).toBe(true);
    expect(await claimDoc(VAT)).toBeUndefined();
  });

  it("leaves another uid's claim alone and reports nothing released", async () => {
    await db.runTransaction((tx) => api.claimVat(tx, db, { uid: "u2", vatNumber: VAT }));

    expect(await db.runTransaction((tx) => api.releaseClaim(tx, db, VAT, "u1"))).toBe(false);
    expect((await claimDoc(VAT))?.uid).toBe("u2");
  });

  it("reports nothing released for a number nobody holds", async () => {
    expect(await db.runTransaction((tx) => api.releaseClaim(tx, db, VAT, "u1"))).toBe(false);
  });
});

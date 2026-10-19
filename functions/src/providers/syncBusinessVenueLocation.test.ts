import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";

// Emulator-backed: the mirror is a real update on the venue document. The handler is called
// with synthetic before/after snapshots, the same way the trigger receives them.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

let mirror: typeof import("./syncBusinessVenueLocation").mirrorBusinessVenueLocation;
let db: admin.firestore.Firestore;

const snap = (data: Record<string, unknown> | undefined) => ({ exists: data !== undefined, data: () => data });
const event = (before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) =>
  ({ data: { before: snap(before), after: snap(after) } }) as unknown as Parameters<typeof mirror>[0];

const readVenue = async (id = "v1") => (await db.doc(`venues/${id}`).get()).data();

const LOC = { lat: 45.07, lng: 7.69, city: "Torino" };

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-venue-location" });
  db = admin.firestore();
  mirror = (await import("./syncBusinessVenueLocation")).mirrorBusinessVenueLocation;
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("venues"));
  await db.doc("venues/v1").set({ name: "Palestra Rossi", city: "", address: "Via Po 2", ownerId: "biz" });
});

describe("mirrorBusinessVenueLocation", () => {
  it("copies a newly saved location onto the linked venue and touches nothing else", async () => {
    await mirror(event({ business: { venueId: "v1" } }, { business: { venueId: "v1" }, ...LOC }));
    expect(await readVenue()).toEqual({ name: "Palestra Rossi", address: "Via Po 2", ownerId: "biz", ...LOC });
  });

  it("follows the provider when the location moves", async () => {
    await mirror(event({ business: { venueId: "v1" }, ...LOC }, { business: { venueId: "v1" }, lat: 41.9, lng: 12.5, city: "Roma" }));
    expect(await readVenue()).toMatchObject({ lat: 41.9, lng: 12.5, city: "Roma" });
  });

  it("does nothing when the location did not change", async () => {
    const doc = { business: { venueId: "v1" }, ...LOC };
    await mirror(event(doc, { ...doc, bio: "new bio" }));
    expect(await readVenue()).not.toHaveProperty("lat");
  });

  it("does nothing without a linked venue (individuals, businesses with venueType none)", async () => {
    await mirror(event({}, { ...LOC }));
    await mirror(event({}, { business: { venueType: "none" }, ...LOC }));
    expect(await readVenue()).not.toHaveProperty("lat");
  });

  it("does nothing on delete or an invalid location", async () => {
    await mirror(event({ business: { venueId: "v1" }, ...LOC }, undefined));
    await mirror(event({ business: { venueId: "v1" } }, { business: { venueId: "v1" }, lat: 0, lng: 0 }));
    expect(await readVenue()).not.toHaveProperty("lat");
  });

  it("returns quietly, and recreates nothing, when the venue is gone", async () => {
    await db.doc("venues/v1").delete();
    await expect(mirror(event({}, { business: { venueId: "v1" }, ...LOC }))).resolves.toBeUndefined();
    expect((await db.doc("venues/v1").get()).exists).toBe(false);
  });
});

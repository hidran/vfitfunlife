import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";

// Emulator-backed: the mirror is a real update on the venue document. The handler is called
// with synthetic before/after snapshots, the same way the trigger receives them; the
// instructors document it re-reads is the real one in the emulator.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

let triggerModule: typeof import("./syncBusinessVenueLocation");
let db: admin.firestore.Firestore;

type Doc = Record<string, unknown> | undefined;
const snap = (data: Doc) => ({ exists: data !== undefined, data: () => data, ref: db.doc("instructors/biz") });

/** Stores `current` (null: none) as the instructor document, then delivers a before -> after event. */
async function deliver(before: Doc, after: Doc, current: Doc | null = after) {
  if (current) await db.doc("instructors/biz").set(current);
  else await db.doc("instructors/biz").delete();
  return triggerModule.mirrorBusinessVenueLocation(
    { data: { before: snap(before), after: snap(after) } } as unknown as Parameters<
      typeof triggerModule.mirrorBusinessVenueLocation
    >[0],
  );
}

const readVenue = async () => (await db.doc("venues/v1").get()).data();

const LINKED = { business: { venueId: "v1" } };
const LOC = { lat: 45.07, lng: 7.69, city: "Torino" };

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-venue-location" });
  db = admin.firestore();
  triggerModule = await import("./syncBusinessVenueLocation");
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("venues"));
  await db.recursiveDelete(db.collection("instructors"));
  await db.doc("venues/v1").set({ name: "Palestra Rossi", city: "", address: "Via Po 2", ownerId: "biz" });
});

describe("syncBusinessVenueLocation registration", () => {
  it("retries failed deliveries and runs in the shared region", async () => {
    const { region } = await import("../lib/runtimeOptions");
    const endpoint = (triggerModule.syncBusinessVenueLocation as unknown as {
      __endpoint: { region: string[]; eventTrigger: { retry: boolean; eventFilterPathPatterns: Record<string, string> } };
    }).__endpoint;
    expect(endpoint.eventTrigger.retry).toBe(true);
    expect(endpoint.region).toEqual([region]);
    expect(endpoint.eventTrigger.eventFilterPathPatterns.document).toBe("instructors/{instructorId}");
  });
});

describe("mirrorBusinessVenueLocation", () => {
  it("copies a newly saved location onto the linked venue and touches nothing else", async () => {
    await deliver(LINKED, { ...LINKED, ...LOC });
    expect(await readVenue()).toEqual({ name: "Palestra Rossi", address: "Via Po 2", ownerId: "biz", ...LOC });
  });

  it("follows the provider when the location moves", async () => {
    await deliver({ ...LINKED, ...LOC }, { ...LINKED, lat: 41.9, lng: 12.5, city: "Roma" });
    expect(await readVenue()).toMatchObject({ lat: 41.9, lng: 12.5, city: "Roma" });
  });

  it("writes the instructor's current location, not a stale event's", async () => {
    // The event says Roma, but the owner has since moved on to Torino.
    await deliver({ ...LINKED }, { ...LINKED, lat: 41.9, lng: 12.5, city: "Roma" }, { ...LINKED, ...LOC });
    expect(await readVenue()).toMatchObject(LOC);
  });

  it("renames the venue when the public name changes, leaving the slug and location alone", async () => {
    await db.doc("venues/v1").update({ slug: "palestra-rossi", lat: 45.07, lng: 7.69, city: "Torino" });
    const doc = { business: { venueId: "v1", displayName: "Palestra Rossi" }, ...LOC };
    await deliver(doc, { ...doc, business: { venueId: "v1", displayName: "Palestra Rossi Centro" } });
    expect(await readVenue()).toEqual({
      name: "Palestra Rossi Centro", slug: "palestra-rossi", address: "Via Po 2", ownerId: "biz", ...LOC,
    });
  });

  it("writes the instructor's current public name, not a stale event's", async () => {
    const before = { business: { venueId: "v1", displayName: "A" } };
    await deliver(before, { business: { venueId: "v1", displayName: "B" } }, { business: { venueId: "v1", displayName: "C" } });
    expect(await readVenue()).toMatchObject({ name: "C" });
  });

  it("mirrors a rename and a move delivered in one write, together", async () => {
    await deliver(
      { business: { venueId: "v1", displayName: "A" } },
      { business: { venueId: "v1", displayName: "B" }, ...LOC },
    );
    expect(await readVenue()).toMatchObject({ name: "B", ...LOC });
  });

  it("a move alone does not rewrite a name an admin edited on the venue", async () => {
    await db.doc("venues/v1").update({ name: "Admin Chosen Name" });
    const doc = { business: { venueId: "v1", displayName: "Palestra Rossi" } };
    await deliver(doc, { ...doc, ...LOC });
    expect(await readVenue()).toMatchObject({ name: "Admin Chosen Name", ...LOC });
  });

  it("does not blank the venue name when the public name is emptied", async () => {
    await deliver({ business: { venueId: "v1", displayName: "A" } }, { business: { venueId: "v1", displayName: "" } });
    expect(await readVenue()).toMatchObject({ name: "Palestra Rossi" });
  });

  it("does nothing when neither the name nor the location changed", async () => {
    const doc = { ...LINKED, ...LOC };
    await deliver(doc, { ...doc, bio: "new bio" });
    expect(await readVenue()).not.toHaveProperty("lat");
  });

  it("does nothing without a linked venue (individuals, businesses with venueType none)", async () => {
    await deliver({}, { ...LOC });
    await deliver({}, { business: { venueType: "none" }, ...LOC });
    expect(await readVenue()).not.toHaveProperty("lat");
  });

  it("does nothing on delete or an invalid location", async () => {
    await deliver({ ...LINKED, ...LOC }, undefined);
    await deliver({ ...LINKED }, { ...LINKED, lat: 0, lng: 0 });
    expect(await readVenue()).not.toHaveProperty("lat");
  });

  it("does nothing when the instructor document is gone by the time of the retry", async () => {
    await deliver({ ...LINKED }, { ...LINKED, ...LOC }, null);
    expect(await readVenue()).not.toHaveProperty("lat");
  });

  it("returns quietly, and recreates nothing, when the venue is gone", async () => {
    await db.doc("venues/v1").delete();
    await expect(deliver({}, { ...LINKED, ...LOC })).resolves.toBeUndefined();
    expect((await db.doc("venues/v1").get()).exists).toBe(false);
  });
});

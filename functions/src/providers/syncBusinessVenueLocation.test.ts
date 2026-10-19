import { beforeEach, describe, expect, it, vi } from "vitest";

// Over the shared Firestore fake (test/fakes/fakeFirestore.ts): the mirror is a real update on
// the venue document (the fake fails a missing one with gRPC NOT_FOUND, like Firestore). The
// handler is called with synthetic before/after snapshots, the same way the trigger receives
// them; the instructors document it re-reads is the fake's.

const h = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("../../test/fakes/fakeFirestore");
  return createFakeFirestore();
});

vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => h.db, FieldValue: h.FieldValue }));

import * as triggerModule from "./syncBusinessVenueLocation";

const db = h.db;

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

const readVenue = async () => h.read("venues/v1");

const LINKED = { business: { venueId: "v1" } };
const LOC = { lat: 45.07, lng: 7.69, city: "Torino" };

beforeEach(async () => {
  h.reset();
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
    expect(await readVenue()).toEqual({ name: "Palestra Rossi", address: "Via Po 2", ownerId: "biz", ...LOC, updatedAt: "NOW" });
  });

  it("a city-only change leaves the venue's lat/lng untouched (and stamps updatedAt)", async () => {
    await db.doc("venues/v1").update({ lat: 40.1, lng: 8.2, city: "Torino" }); // e.g. an admin's correction
    const before = { ...LINKED, ...LOC };
    await deliver(before, { ...before, city: "Moncalieri" });
    expect(await readVenue()).toMatchObject({ lat: 40.1, lng: 8.2, city: "Moncalieri", updatedAt: "NOW" });
  });

  it("a move leaves the venue's city alone when the city did not change", async () => {
    await db.doc("venues/v1").update({ city: "Admin Chosen City" });
    const before = { ...LINKED, ...LOC };
    await deliver(before, { ...before, lat: 41.9, lng: 12.5 });
    expect(await readVenue()).toMatchObject({ lat: 41.9, lng: 12.5, city: "Admin Chosen City" });
  });

  it("a city-only event writes the CURRENT city even if the instructor moved on since", async () => {
    const before = { ...LINKED, ...LOC };
    await deliver(before, { ...before, city: "Moncalieri" }, { ...before, city: "Chieri", lat: 1, lng: 1 });
    const venue = await readVenue();
    expect(venue).toMatchObject({ city: "Chieri" });
    expect(venue).not.toHaveProperty("lat");
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
      name: "Palestra Rossi Centro", slug: "palestra-rossi", address: "Via Po 2", ownerId: "biz", ...LOC, updatedAt: "NOW",
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

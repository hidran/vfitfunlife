import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";
import type { CallableRequest } from "firebase-functions/v2/https";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
let db: admin.firestore.Firestore;
let spaces: typeof import("./spaces");
const req = (uid: string, data: unknown) => ({ auth: { uid, token: {} }, data }) as CallableRequest;
const location = { kind: "location", venueId: "gym", name: "Centro", address: "Via Roma 1", city: "Roma",
  timezone: "Europe/Rome", isActive: true };
const link = { venueId: "gym", instructorId: "coach", partnerStatus: "active", isActive: true };

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-spaces" });
  db = admin.firestore();
  spaces = await import("./spaces");
});

beforeEach(async () => {
  for (const name of ["venues", "venueStaff", "users", "instructors"]) await db.recursiveDelete(db.collection(name));
  await db.doc("venues/gym").set({ name: "Gym", type: "gym", isActive: true, ownerId: "owner" });
  await db.doc("venues/spa").set({ name: "Spa", type: "spa", isActive: true, ownerId: "owner" });
  for (const [uid, role] of [["owner", "provider"], ["staff", "customer"], ["inactive", "customer"],
    ["stranger", "customer"], ["admin", "admin"]]) {
    await db.doc(`users/${uid}`).set({ role, isActive: true, fullName: uid });
  }
  await db.doc("venueStaff/staff").set({ venueId: "gym", isActive: true });
  await db.doc("venueStaff/inactive").set({ venueId: "gym", isActive: false });
  await db.doc("instructors/coach").set({ fullName: "Coach", isActive: true, partnerStatus: "pending",
    providerProfile: { isVerified: true } });
  await db.doc("instructors/rookie").set({ fullName: "Rookie", isActive: true, providerProfile: { isVerified: false } });
});

describe("saveGymSpace", () => {
  it.each(["owner", "staff", "admin"])("lets %s create a location and a room", async (uid) => {
    const { id } = await spaces.saveGymSpace.run(req(uid, location));
    expect((await db.doc(`venues/gym/locations/${id}`).get()).data()).toMatchObject({
      name: "Centro", city: "Roma", timezone: "Europe/Rome", isActive: true });
    const room = await spaces.saveGymSpace.run(req(uid, { kind: "room", venueId: "gym", locationId: id,
      name: "Sala 1", isActive: true }));
    expect((await db.doc(`venues/gym/locations/${id}/rooms/${room.id}`).get()).data()).toMatchObject({
      name: "Sala 1", isActive: true });
  });

  it("updates an existing location in place when an id is given", async () => {
    const { id } = await spaces.saveGymSpace.run(req("owner", location));
    await spaces.saveGymSpace.run(req("owner", { ...location, id, name: "Nuovo", isActive: false }));
    expect((await db.doc(`venues/gym/locations/${id}`).get()).data()).toMatchObject({ name: "Nuovo", isActive: false });
    expect((await db.collection("venues/gym/locations").get()).size).toBe(1);
  });

  it.each(["stranger", "inactive"])("refuses %s", async (uid) => {
    await expect(spaces.saveGymSpace.run(req(uid, location))).rejects.toMatchObject({
      code: "permission-denied", message: "venue_authorization_required" });
    expect((await db.collection("venues/gym/locations").get()).size).toBe(0);
  });

  it("rejects an unknown IANA timezone", async () => {
    await expect(spaces.saveGymSpace.run(req("owner", { ...location, timezone: "Mars/Phobos" }))).rejects.toThrow();
    expect((await db.collection("venues/gym/locations").get()).size).toBe(0);
  });

  it("rejects a room under a missing location", async () => {
    await expect(spaces.saveGymSpace.run(req("owner", { kind: "room", venueId: "gym", locationId: "nope",
      name: "Sala", isActive: true }))).rejects.toThrow("gym_location_not_found");
  });

  it("treats a venue that does not host courses as not found, and a missing venue too", async () => {
    await expect(spaces.saveGymSpace.run(req("owner", { ...location, venueId: "spa" }))).rejects.toThrow("gym_not_found");
    await expect(spaces.saveGymSpace.run(req("owner", { ...location, venueId: "ghost" }))).rejects.toThrow("gym_not_found");
  });

  it("rejects ids that are not safe path segments", async () => {
    await expect(spaces.saveGymSpace.run(req("owner", { ...location, venueId: "a/b" }))).rejects.toThrow("invalid_id");
  });

  it("requires sign-in", async () => {
    await expect(spaces.saveGymSpace.run({ data: location } as CallableRequest)).rejects.toThrow("Sign in required");
  });
});

describe("configureGymInstructor", () => {
  it("lets an admin link an instructor; partnerStatus and the venue link are written together", async () => {
    await expect(spaces.configureGymInstructor.run(req("admin", link))).resolves.toEqual({ success: true });
    expect((await db.doc("instructors/coach").get()).data()?.partnerStatus).toBe("active");
    expect((await db.doc("venues/gym/instructors/coach").get()).data()).toMatchObject({
      isActive: true, name: "Coach" });
  });

  it("refuses the venue owner and staff", async () => {
    for (const uid of ["owner", "staff"]) {
      await expect(spaces.configureGymInstructor.run(req(uid, link))).rejects.toThrow("admin_required");
    }
    expect((await db.doc("instructors/coach").get()).data()?.partnerStatus).toBe("pending");
    expect((await db.doc("venues/gym/instructors/coach").get()).exists).toBe(false);
  });

  it("refuses an unverified instructor and a venue that does not host courses", async () => {
    await expect(spaces.configureGymInstructor.run(req("admin", { ...link, instructorId: "rookie" })))
      .rejects.toThrow("verified_instructor_required");
    await expect(spaces.configureGymInstructor.run(req("admin", { ...link, venueId: "spa" })))
      .rejects.toThrow("verified_instructor_required");
  });

  it("validates the status and active flag", async () => {
    await expect(spaces.configureGymInstructor.run(req("admin", { ...link, partnerStatus: "bogus" })))
      .rejects.toThrow("invalid_instructor_partnership");
    await expect(spaces.configureGymInstructor.run(req("admin", { ...link, isActive: "yes" })))
      .rejects.toThrow("invalid_instructor_partnership");
  });
});


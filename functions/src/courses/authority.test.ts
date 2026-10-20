import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testProjectId } from "./testProject";
import * as admin from "firebase-admin";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
let db: admin.firestore.Firestore;
let authority: typeof import("./authority");
const course = { providerId: "p", venueId: "v" };
const denied = (message: string) => expect.objectContaining({ code: "permission-denied", message });
beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: testProjectId("demo-vfit-authority") });
  db = admin.firestore();
  authority = await import("./authority");
});
beforeEach(async () => {
  for (const name of ["users", "venues", "venueStaff"]) await db.recursiveDelete(db.collection(name));
  const users: Record<string, Record<string, unknown>> = {
    p: { role: "provider" }, owner: { role: "provider" }, staff: { role: "customer" },
    inactiveStaff: { role: "customer" }, otherStaff: { role: "customer" }, stranger: { role: "customer" },
    admin: { role: "admin" }, superadmin: { role: "superadmin" },
    suspended: { role: "provider", accountStatus: "suspended" },
    deleted: { role: "admin", accountStatus: "deleted" },
    disabled: { role: "provider", isActive: false },
  };
  for (const [uid, data] of Object.entries(users)) await db.doc(`users/${uid}`).set({ isActive: true, ...data });
  await db.doc("venues/v").set({ ownerId: "owner" });
  await db.doc("venues/sv").set({ ownerId: "suspended" });
  await db.doc("venues/noowner").set({ name: "No owner" });
  await db.doc("venueStaff/staff").set({ venueId: "v", isActive: true });
  await db.doc("venueStaff/inactiveStaff").set({ venueId: "v", isActive: false });
  await db.doc("venueStaff/otherStaff").set({ venueId: "w", isActive: true });
  await db.doc("venueStaff/suspended").set({ venueId: "v", isActive: true });
});
// every case runs plain and inside a transaction, so both read paths are covered
const modes: [string, <T>(run: (tx?: FirebaseFirestore.Transaction) => Promise<T>) => Promise<T>][] = [
  ["without a transaction", (run) => run()],
  ["inside a transaction", (run) => db.runTransaction((tx) => run(tx))],
];
describe.each(modes)("course authority %s", (_label, wrap) => {
  describe("managesVenue", () => {
    const manages = (uid: string, venueId: string) => wrap((tx) => authority.managesVenue(uid, venueId, tx));
    it.each(["owner", "staff", "admin", "superadmin"])("allows %s", async (uid) => {
      expect(await manages(uid, "v")).toBe(true);
    });
    it.each(["inactiveStaff", "otherStaff", "stranger", "ghost"])("refuses %s", async (uid) => {
      expect(await manages(uid, "v")).toBe(false);
    });
    it("refuses a missing venue, even for an admin", async () => {
      expect(await manages("owner", "missing")).toBe(false);
      expect(await manages("admin", "missing")).toBe(false);
    });
    it("refuses suspended, deleted and disabled accounts on every route", async () => {
      expect(await manages("suspended", "sv")).toBe(false);
      expect(await manages("suspended", "v")).toBe(false);
      expect(await manages("deleted", "v")).toBe(false);
      expect(await manages("disabled", "v")).toBe(false);
    });
    it("does not treat an ownerless venue as owned by anyone", async () => {
      expect(await manages("stranger", "noowner")).toBe(false);
      expect(await manages("admin", "noowner")).toBe(true);
    });
  });
  describe("canManageCourse", () => {
    const can = (uid: string, c: { providerId: string; venueId: string | null }) =>
      wrap((tx) => authority.canManageCourse(uid, c, tx));
    it("resolves the course provider as owner, with or without a venue", async () => {
      expect(await can("p", course)).toEqual({ uid: "p", via: "owner" });
      expect(await can("p", { providerId: "p", venueId: null })).toEqual({ uid: "p", via: "owner" });
    });
    it("resolves the venue owner and active venue staff as venue", async () => {
      expect(await can("owner", course)).toEqual({ uid: "owner", via: "venue" });
      expect(await can("staff", course)).toEqual({ uid: "staff", via: "venue" });
    });
    it("resolves admin and superadmin as admin", async () => {
      expect(await can("admin", course)).toEqual({ uid: "admin", via: "admin" });
      expect(await can("superadmin", { providerId: "p", venueId: null })).toEqual({ uid: "superadmin", via: "admin" });
    });
    it("prefers owner over admin when the admin owns the course", async () => {
      expect(await can("admin", { providerId: "admin", venueId: "v" })).toEqual({ uid: "admin", via: "owner" });
    });
    it("rejects a stranger on a venue course and on a venue-less course", async () => {
      await expect(can("stranger", course)).rejects.toMatchObject(denied("course_owner_required"));
      await expect(can("stranger", { providerId: "p", venueId: null })).rejects.toMatchObject(denied("course_owner_required"));
    });
    it("rejects inactive staff and staff of another venue", async () => {
      await expect(can("inactiveStaff", course)).rejects.toMatchObject(denied("course_owner_required"));
      await expect(can("otherStaff", course)).rejects.toMatchObject(denied("course_owner_required"));
    });
    it("gives venue staff nothing on a venue-less course", async () => {
      await expect(can("staff", { providerId: "p", venueId: null })).rejects.toMatchObject(denied("course_owner_required"));
      await expect(can("owner", { providerId: "p", venueId: null })).rejects.toMatchObject(denied("course_owner_required"));
    });
    it("rejects a course pointing at a missing venue unless the caller owns it or is admin", async () => {
      const ghost = { providerId: "p", venueId: "missing" };
      await expect(can("owner", ghost)).rejects.toMatchObject(denied("course_owner_required"));
      expect(await can("p", ghost)).toMatchObject({ via: "owner" });
      expect(await can("admin", ghost)).toMatchObject({ via: "admin" });
    });
    it.each(["suspended", "deleted", "disabled", "ghost"])("reports account_inactive for %s", async (uid) => {
      await expect(can(uid, { providerId: uid, venueId: "v" })).rejects.toMatchObject(denied("account_inactive"));
    });
  });
});

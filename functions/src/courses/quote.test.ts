import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as admin from "firebase-admin";
import type { CallableRequest } from "firebase-functions/v2/https";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
vi.mock("../lib/stripeClient", () => ({ getStripe: async () => ({}) }));
const auth = vi.hoisted(() => ({ generatePasswordResetLink: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => auth }));
vi.mock("../lib/email", () => ({ EMAIL_SECRETS: [], sendEmail: vi.fn() }));
let api: typeof import("./index");
let db: admin.firestore.Firestore;
const request = (uid: string | null, data: unknown) =>
  ({ auth: uid ? { uid, token: {} } : undefined, data }) as CallableRequest;
const base = { name: "Karate", categoryId: "karate", location: "Torino", instructor: "Anna", capacity: 5,
  durationMinutes: 60, startDate: "2099-10-12", startTime: "18:00", timezone: "Europe/Rome",
  recurrence: "daily", endDate: "2099-10-14", lessonPriceCents: 1500, seriesPriceCents: 4000, state: "published" };
const venueCourse = { ...base, venueId: "v", locationId: "l1", roomId: "r1" };
const COLLECTIONS = ["courses", "users", "instructors", "serviceCategories", "venues", "venueStaff",
  "courseScheduleLocks", "courseEnrollments"];

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-course-quote" });
  db = admin.firestore();
  api = await import("./index");
});
beforeEach(async () => {
  for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name));
  await db.doc("serviceCategories/karate").set({ isActive: true, parentId: "combat" });
  for (const [uid, role] of Object.entries({ p: "provider", p2: "provider", biz: "provider", s: "customer",
    u: "customer", x: "customer" })) await db.doc(`users/${uid}`).set({ fullName: uid, role, isActive: true });
  const provider = { isActive: true, applicationStatus: "approved", providerProfile: { isVerified: true } };
  await db.doc("instructors/p").set({ ...provider, fullName: "Anna", partnerStatus: "active" });
  await db.doc("instructors/p2").set({ ...provider, fullName: "Paola", partnerStatus: "pending" });
  await db.doc("instructors/biz").set({ ...provider, fullName: "Biz" });
  await db.doc("venues/v").set({ ownerId: "biz", type: "gym", partnerStatus: "active", isActive: true,
    memberDiscountPercent: 10, partnerInstructorExtraPercent: 5 });
  await db.doc("venues/v/locations/l1").set({ name: "Sede", city: "Torino", timezone: "Europe/Rome", isActive: true });
  await db.doc("venues/v/locations/l1/rooms/r1").set({ name: "Sala 1", isActive: true });
  for (const i of ["p", "p2"]) await db.doc(`venues/v/instructors/${i}`).set({ isActive: true, name: i });
  await db.doc("venueStaff/s").set({ venueId: "v", isActive: true });
});

async function save(uid: string, course: Record<string, unknown>) {
  return (await api.saveCourse.run(request(uid, { course }))).courseId as string;
}
const quote = (uid: string | null, courseId: string, sessionIds?: string[]) =>
  api.quoteCourse.run(request(uid, { courseId, ...(sessionIds ? { sessionIds } : {}) }));

describe("quoteCourse", () => {
  it("quotes an unlinked course with no discount even for a partner instructor", async () => {
    const id = await save("p", { ...base, instructorId: "p" });
    const result = await quote("u", id, ["2099-10-12"]);
    expect(result.sessions).toEqual([{ sessionId: "2099-10-12", revision: 1, regularCents: 1500, discountPercent: 0,
      gymPercent: 0, instructorPercent: 0, discountCents: 0, finalCents: 1500, availableSeats: 5, waitlisted: 0 }]);
    expect(result.series).toMatchObject({ regularCents: 4000, discountPercent: 0, discountCents: 0, finalCents: 4000 });
  });

  it("adds the venue percent and the active partner instructor percent", async () => {
    const id = await save("biz", { ...venueCourse, instructorId: "p" });
    const result = await quote("u", id, ["2099-10-12"]);
    expect(result.sessions[0]).toMatchObject({ discountPercent: 15, gymPercent: 10, instructorPercent: 5,
      regularCents: 1500, discountCents: 225, finalCents: 1275 });
  });

  it("gives only the venue percent when the instructor is not an active partner", async () => {
    const id = await save("biz", { ...venueCourse, instructorId: "p2" });
    const result = await quote("u", id, ["2099-10-12"]);
    expect(result.sessions[0]).toMatchObject({ discountPercent: 10, instructorPercent: 0, finalCents: 1350 });
  });

  it("quotes a venue course without an instructor at the venue percent", async () => {
    const id = await save("biz", venueCourse);
    expect((await quote("u", id, ["2099-10-12"])).sessions[0]).toMatchObject({ discountPercent: 10, finalCents: 1350 });
  });

  it("allocates the series first, then discounts each allocation", async () => {
    const id = await save("biz", { ...venueCourse, instructorId: "p" });
    const { series } = await quote("u", id, ["2099-10-12"]);
    expect(series).toEqual({ regularCents: 4000, discountPercent: 15, gymPercent: 10, instructorPercent: 5,
      discountCents: 598, finalCents: 3402,
      allocations: { "2099-10-12": 1134, "2099-10-13": 1134, "2099-10-14": 1134 } });
    expect(Object.values(series!.allocations).reduce((a, b) => a + b, 0)).toBe(series!.finalCents);
  });

  it("prices a substituted lesson by the substitute's partner status", async () => {
    const id = await save("biz", { ...venueCourse, instructorId: "p" });
    await db.doc(`courses/${id}/sessions/2099-10-13`).update({ instructorId: "p2" });
    const result = await quote("u", id);
    expect(result.sessions.map((s) => s.discountPercent)).toEqual([15, 10, 15]);
    // The series headline percent follows the course instructor; the money follows each lesson.
    expect(result.series).toMatchObject({ discountPercent: 15, finalCents: 3468, discountCents: 532,
      allocations: { "2099-10-12": 1134, "2099-10-13": 1200, "2099-10-14": 1134 } });
  });

  it("quotes free lessons and free series at zero", async () => {
    const id = await save("biz", { ...venueCourse, lessonPriceCents: 0, seriesPriceCents: 0 });
    const result = await quote("u", id, ["2099-10-12"]);
    expect(result.sessions[0]).toMatchObject({ regularCents: 0, discountCents: 0, finalCents: 0 });
    expect(result.series).toMatchObject({ finalCents: 0, allocations: { "2099-10-12": 0 } });
  });

  it("omits the lesson or series quote the course does not sell", async () => {
    const lessonOnly = await save("p", { ...base, seriesPriceCents: null });
    expect((await quote("u", lessonOnly, ["2099-10-12"])).series).toBeNull();
    const seriesOnly = await save("p", { ...base, name: "Series", startTime: "20:00", lessonPriceCents: null });
    const result = await quote("u", seriesOnly, ["2099-10-12"]);
    expect(result.sessions).toEqual([]);
    expect(result.series?.finalCents).toBe(4000);
  });

  it("reports seats left, revision and the waitlist count of a full lesson", async () => {
    const id = await save("p", { ...base, capacity: 2 });
    await db.doc(`courses/${id}/sessions/2099-10-12`).update({ occupied: 1, held: 1, waitlisted: 3, revision: 4 });
    expect((await quote("u", id, ["2099-10-12", "2099-10-13"])).sessions).toMatchObject([
      { sessionId: "2099-10-12", availableSeats: 0, waitlisted: 3, revision: 4 },
      { sessionId: "2099-10-13", availableSeats: 2, waitlisted: 0, revision: 1 }]);
  });

  it("defaults to every lesson and dedupes the requested ids", async () => {
    const id = await save("p", base);
    expect((await quote("u", id)).sessions.map((s) => s.sessionId)).toEqual(["2099-10-12", "2099-10-13", "2099-10-14"]);
    expect((await quote("u", id, ["2099-10-13", "2099-10-13"])).sessions).toHaveLength(1);
  });

  it("rejects ids outside the course and more than 100 ids", async () => {
    const id = await save("p", base);
    await expect(quote("u", id, ["2099-11-01"])).rejects.toThrow("session_not_in_course");
    await expect(quote("u", id, Array.from({ length: 101 }, (_, i) => `s${i}`))).rejects.toThrow("too_many_sessions");
    await expect(quote("u", id, ["bad id"])).rejects.toThrow("invalid_id");
  });

  it("requires a signed-in caller", async () => {
    const id = await save("p", base);
    await expect(quote(null, id)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("hides a draft from strangers but quotes it for the owner and venue staff", async () => {
    const id = await save("biz", { ...venueCourse, state: "draft" });
    await expect(quote("x", id)).rejects.toThrow("course_not_found");
    await expect(quote("u", id)).rejects.toThrow("course_not_found");
    expect((await quote("biz", id)).sessions).toHaveLength(3);
    expect((await quote("s", id)).sessions).toHaveLength(3);
    await expect(quote("u", "missing")).rejects.toThrow("course_not_found");
  });

  it("refuses customers when the venue stopped being an active partner, but not managers", async () => {
    const id = await save("biz", venueCourse);
    await db.doc("venues/v").update({ partnerStatus: "suspended" });
    await expect(quote("u", id)).rejects.toThrow("venue_not_active");
    await db.doc("venues/v").update({ partnerStatus: "active", isActive: false });
    await expect(quote("u", id)).rejects.toThrow("venue_not_active");
    expect((await quote("s", id)).sessions).toHaveLength(3);
  });

  it("hides a published course whose provider stopped being eligible", async () => {
    const id = await save("p", base);
    await db.doc(`courses/${id}`).update({ providerEligible: false });
    await expect(quote("u", id)).rejects.toThrow("course_not_found");
    expect((await quote("p", id)).sessions).toHaveLength(3);
  });
});

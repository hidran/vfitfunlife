import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as admin from "firebase-admin";
import { createHash } from "crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import { assertLockInvariant } from "./lockInvariant.testutil";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
vi.mock("../lib/stripeClient", () => ({ getStripe: async () => ({}) }));
const auth = vi.hoisted(() => ({ generatePasswordResetLink: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => auth }));
vi.mock("../lib/email", () => ({ EMAIL_SECRETS: [], sendEmail: vi.fn() }));
let api: typeof import("./index");
let db: admin.firestore.Firestore;
const request = (uid: string, data: unknown) => ({ auth: { uid, token: {} }, data }) as CallableRequest;
const input = { name: "Karate", categoryId: "karate", location: "Torino", instructor: "Anna", capacity: 1,
  durationMinutes: 60, startDate: "2099-10-12", startTime: "18:00", timezone: "Europe/Rome",
  recurrence: "daily", endDate: "2099-10-13", lessonPriceCents: 1500, seriesPriceCents: 2500, state: "published" };
const SESSION = "2099-10-12";
const OTHER = "2099-10-13";
const COLLECTIONS = ["courses", "courseEnrollments", "courseRefunds", "courseNotifications", "clients",
  "users", "instructors", "serviceCategories", "venues", "venueStaff", "rateLimits", "courseScheduleLocks",
  "systemSettings"];
const CUSTOMERS = ["u1", "u2", "u3", "u4", "u5", "h"];

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-waitlist" });
  db = admin.firestore();
  api = await import("./index");
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name));
  await db.doc("instructors/p").set({ fullName: "Anna", isActive: true, applicationStatus: "approved",
    providerProfile: { isVerified: true } });
  await db.doc("serviceCategories/karate").set({ isActive: true, parentId: "combat" });
  await db.doc("users/p").set({ fullName: "p", role: "provider", isActive: true });
  for (const uid of CUSTOMERS) await db.doc(`users/${uid}`).set({ fullName: `Name ${uid}`, role: "customer", isActive: true });
  await db.doc("systemSettings/payments").set({ stripePaymentsEnabled: false, courseCheckoutEnabled: false });
});

async function course(extra: Record<string, unknown> = {}) {
  return (await api.saveCourse.run(request("p", { course: { ...input, ...extra } }))).courseId as string;
}
const sessionRef = (courseId: string, id = SESSION) => db.doc(`courses/${courseId}/sessions/${id}`);
async function sessionOf(courseId: string, id = SESSION) {
  return (await sessionRef(courseId, id).get()).data()!;
}
// A real customer takes the last seat, so participants and counters agree.
async function holdSeat(courseId: string, uid = "h", id = SESSION) {
  const quote = await api.quoteCourse.run(request(uid, { courseId }));
  const line = quote.sessions.find((l) => l.sessionId === id)!;
  await api.enrollInCourse.run(request(uid, { courseId, scope: "lesson", sessionId: id, requestId: `hold-${uid}-${id}`,
    expectedFinalCents: line.finalCents, expectedRevisions: { [id]: line.revision } }));
}
async function fullCourse(extra: Record<string, unknown> = {}) {
  const courseId = await course(extra);
  await holdSeat(courseId);
  return courseId;
}
const join = (uid: string, courseId: string, extra: Record<string, unknown> = {}) =>
  api.joinCourseWaitlist.run(request(uid, { courseId, sessionId: SESSION, paymentMode: "direct",
    requestId: `w-${uid}`, ...extra }));
const leave = (uid: string, courseId: string, sessionId = SESSION) =>
  api.leaveCourseWaitlist.run(request(uid, { courseId, sessionId }));
const waitlist = async (courseId: string, id = SESSION) =>
  (await sessionRef(courseId, id).collection("waitlist").orderBy("position").get())
    .docs.map((d) => ({ id: d.id, ...d.data() })) as unknown as { id: string; position: number }[];

/** Counters always agree with the documents they summarise. */
async function assertCounters(courseId: string) {
  for (const doc of (await db.collection(`courses/${courseId}/sessions`).get()).docs) {
    const session = doc.data();
    const participants = (await doc.ref.collection("participants").get()).docs.map((d) => d.data());
    const entries = (await doc.ref.collection("waitlist").orderBy("position").get()).docs;
    expect(session.occupied, `${doc.id} occupied`).toBe(participants.filter((p) => p.state === "confirmed").length);
    expect(session.held, `${doc.id} held`).toBe(participants.filter((p) => p.state === "held").length);
    expect(session.waitlisted ?? 0, `${doc.id} waitlisted`).toBe(entries.length);
    expect(entries.map((d) => d.data().position), `${doc.id} positions`).toEqual(entries.map((_, i) => i + 1));
    expect(session.occupied + session.held).toBeLessThanOrEqual(session.capacity);
  }
  await assertLockInvariant(db);
}
const refusal = (promise: Promise<unknown>, message: string) =>
  expect(promise).rejects.toMatchObject({ message });

describe("joinCourseWaitlist", () => {
  it("adds the customer to a full lesson with position 1 and counts them", async () => {
    const courseId = await fullCourse();
    const result = await join("u1", courseId, { paymentMode: "direct" });
    expect(result).toEqual({ success: true, position: 1, replay: false });
    const [entry] = await waitlist(courseId);
    expect(entry).toMatchObject({ id: "u1", userId: "u1", customerName: "Name u1", scope: "lesson",
      requestId: "w-u1", paymentMode: "direct", position: 1, courseId, sessionId: SESSION, courseName: "Karate",
      providerId: "p", venueId: null });
    expect(entry).toHaveProperty("createdAt");
    expect((await sessionOf(courseId)).waitlisted).toBe(1);
    await assertCounters(courseId);
  });
  it("gives the next customer position 2 and leaves other lessons alone", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    expect((await join("u2", courseId)).position).toBe(2);
    expect((await sessionOf(courseId)).waitlisted).toBe(2);
    expect((await sessionOf(courseId, OTHER)).waitlisted).toBe(0);
    await assertCounters(courseId);
  });
  it("replays the same request without writing again", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    const [before] = await waitlist(courseId);
    expect(await join("u1", courseId)).toEqual({ success: true, position: 1, replay: true });
    expect(await waitlist(courseId)).toEqual([before]);
    expect((await sessionOf(courseId)).waitlisted).toBe(1);
    await assertCounters(courseId);
  });
  it("refuses a second entry under a new request id", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await refusal(join("u1", courseId, { requestId: "w-other" }), "already_waitlisted");
    expect((await sessionOf(courseId)).waitlisted).toBe(1);
  });
  it("refuses a request id that already belongs to an enrollment", async () => {
    const courseId = await fullCourse();
    const id = createHash("sha256").update("u1:reused").digest("hex");
    await db.doc(`courseEnrollments/${id}`).set({ userId: "u1", courseId });
    await refusal(join("u1", courseId, { requestId: "reused" }), "request_id_reused");
    expect(await waitlist(courseId)).toEqual([]);
  });
  it("is not open while a seat is free", async () => {
    const courseId = await course();
    await refusal(join("u1", courseId), "waitlist_not_open");
    expect((await sessionOf(courseId)).waitlisted).toBe(0);
  });
  it("is disabled by the course", async () => {
    const courseId = await fullCourse({ waitlistEnabled: false });
    await refusal(join("u1", courseId), "waitlist_disabled");
  });
  it("is closed inside the booking notice window", async () => {
    const courseId = await fullCourse();
    await sessionRef(courseId).update({ startsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3600000) });
    await refusal(join("u1", courseId), "waitlist_not_open");
  });
  it("is closed for a cancelled lesson", async () => {
    const courseId = await fullCourse();
    await sessionRef(courseId).update({ state: "cancelled" });
    await refusal(join("u1", courseId), "waitlist_not_open");
  });
  it("is closed for a draft course and for closed enrollment", async () => {
    const courseId = await fullCourse();
    await db.doc(`courses/${courseId}`).update({ enrollmentClosed: true });
    await refusal(join("u1", courseId), "waitlist_not_open");
    await db.doc(`courses/${courseId}`).update({ enrollmentClosed: false, state: "draft" });
    await refusal(join("u1", courseId), "waitlist_not_open");
  });
  it("tells a member of the lesson they are already enrolled", async () => {
    const courseId = await fullCourse();
    await refusal(join("h", courseId), "already_enrolled");
    expect((await sessionOf(courseId)).waitlisted).toBe(0);
  });
  it("does not let a provider wait for their own course", async () => {
    const courseId = await fullCourse();
    await refusal(join("p", courseId), "cannot_book_yourself");
  });
  it("refuses a suspended account", async () => {
    const courseId = await fullCourse();
    await db.doc("users/u1").update({ accountStatus: "suspended" });
    await refusal(join("u1", courseId), "account_inactive");
  });
  it("refuses an unavailable provider", async () => {
    const courseId = await fullCourse();
    await db.doc("instructors/p").update({ isActive: false });
    await refusal(join("u1", courseId), "provider_unavailable");
  });
  it("needs checkout to be on for a Stripe entry", async () => {
    const courseId = await fullCourse();
    await refusal(join("u1", courseId, { paymentMode: "stripe" }), "Online course payments are not enabled");
    expect(await waitlist(courseId)).toEqual([]);
  });
  it("rejects bad input and unauthenticated calls", async () => {
    const courseId = await fullCourse();
    await refusal(join("u1", courseId, { paymentMode: "cash" }), "invalid_booking_option");
    await refusal(join("u1", courseId, { requestId: "not valid!" }), "invalid_id");
    await refusal(join("u1", courseId, { sessionId: "../x" }), "invalid_id");
    await expect(api.joinCourseWaitlist.run({ data: { courseId } } as CallableRequest))
      .rejects.toMatchObject({ code: "unauthenticated" });
    await refusal(join("u1", "missing"), "course_not_found");
    await refusal(join("u1", courseId, { sessionId: "2099-01-01" }), "session_not_found");
  });
  it("stops at WAITLIST_MAX entries", async () => {
    const courseId = await fullCourse();
    await sessionRef(courseId).update({ waitlisted: 100 });
    await refusal(join("u1", courseId), "waitlist_full");
    expect(await waitlist(courseId)).toEqual([]);
  });
  it("records the venue of a venue-linked course and refuses once the venue is not active", async () => {
    await db.doc("venues/v").set({ ownerId: "p", type: "gym", partnerStatus: "active", isActive: true });
    const courseId = await fullCourse();
    await db.doc(`courses/${courseId}`).update({ venueId: "v" });
    await join("u1", courseId);
    expect((await waitlist(courseId))[0]).toMatchObject({ venueId: "v" });
    await db.doc("venues/v").update({ partnerStatus: "suspended" });
    await refusal(join("u2", courseId), "venue_not_active");
    await db.doc("venues/v").update({ partnerStatus: "active", isActive: false });
    await refusal(join("u2", courseId), "venue_not_active");
  });
  it("gives concurrent joins distinct consecutive positions", async () => {
    const courseId = await fullCourse();
    const results = await Promise.all(["u1", "u2", "u3"].map((uid) => join(uid, courseId)));
    expect(results.map((r) => r.position).sort()).toEqual([1, 2, 3]);
    expect((await sessionOf(courseId)).waitlisted).toBe(3);
    await assertCounters(courseId);
  });
  it("lets the same customer wait on two lessons", async () => {
    const courseId = await course();
    await holdSeat(courseId, "h", SESSION);
    await holdSeat(courseId, "h", OTHER);
    await join("u1", courseId);
    await api.joinCourseWaitlist.run(request("u1", { courseId, sessionId: OTHER, paymentMode: "direct",
      requestId: "w-u1-other" }));
    expect((await waitlist(courseId)).map((e) => e.id)).toEqual(["u1"]);
    expect((await waitlist(courseId, OTHER)).map((e) => e.id)).toEqual(["u1"]);
    await assertCounters(courseId);
  });
});

describe("leaveCourseWaitlist", () => {
  it("removes the entry and closes the gap behind it", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3"]) await join(uid, courseId);
    expect(await leave("u2", courseId)).toEqual({ success: true });
    expect((await waitlist(courseId)).map((e) => [e.id, e.position])).toEqual([["u1", 1], ["u3", 2]]);
    expect((await sessionOf(courseId)).waitlisted).toBe(2);
    await assertCounters(courseId);
  });
  it("leaving from the front promotes everyone one place", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3"]) await join(uid, courseId);
    await leave("u1", courseId);
    expect((await waitlist(courseId)).map((e) => [e.id, e.position])).toEqual([["u2", 1], ["u3", 2]]);
    await assertCounters(courseId);
  });
  it("is a no-op the second time and for someone who never joined", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await join("u2", courseId);
    await leave("u1", courseId);
    expect(await leave("u1", courseId)).toEqual({ success: true });
    expect(await leave("u3", courseId)).toEqual({ success: true });
    expect(await leave("u3", "missing")).toEqual({ success: true });
    expect((await waitlist(courseId)).map((e) => [e.id, e.position])).toEqual([["u2", 1]]);
    expect((await sessionOf(courseId)).waitlisted).toBe(1);
    await assertCounters(courseId);
  });
  it("lets the customer join again after leaving", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await leave("u1", courseId);
    expect((await join("u1", courseId, { requestId: "second" })).position).toBe(1);
    await assertCounters(courseId);
  });
  it("only ever removes the caller's own entry", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await leave("u2", courseId);
    expect((await waitlist(courseId)).map((e) => e.id)).toEqual(["u1"]);
  });
  it("rejects unauthenticated calls and bad ids", async () => {
    await expect(api.leaveCourseWaitlist.run({ data: { courseId: "c", sessionId: SESSION } } as CallableRequest))
      .rejects.toMatchObject({ code: "unauthenticated" });
    await refusal(leave("u1", "c", "bad id"), "invalid_id");
  });
  it("keeps the counter equal to the documents through concurrent joins and leaves", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await Promise.all([leave("u1", courseId), join("u3", courseId), join("u4", courseId)]);
    await assertCounters(courseId);
    expect((await waitlist(courseId)).map((e) => e.id).sort()).toEqual(["u2", "u3", "u4"]);
  });
});

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testProjectId } from "./testProject";
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
const CUSTOMERS = ["u1", "u2", "u3", "u4", "u5", "u6", "h"];

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: testProjectId("demo-vfit-waitlist") });
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
    // A customer is either seated or waiting, and every seat belongs to a live enrollment that lists the lesson.
    const seated = new Set((await doc.ref.collection("participants").get()).docs.map((d) => d.id));
    expect(entries.filter((e) => seated.has(e.id)).map((e) => e.id), `${doc.id} waiting and seated`).toEqual([]);
    for (const e of entries) {
      expect(e.data(), `${doc.id} entry ${e.id}`).toMatchObject({ userId: e.id, courseId, sessionId: doc.id });
    }
    for (const p of (await doc.ref.collection("participants").get()).docs) {
      const enrollment = (await db.doc(`courseEnrollments/${p.data().enrollmentId}`).get()).data();
      expect(enrollment?.activeSessionIds, `${doc.id} enrollment of ${p.id}`).toContain(doc.id);
      expect(enrollment?.state, `${doc.id} enrollment state of ${p.id}`).toBe(p.data().state);
    }
  }
  // The course's seat counter follows its next lesson.
  const stored = (await db.doc(`courses/${courseId}`).get()).data()!;
  if (stored.nextSessionId) {
    const next = (await db.doc(`courses/${courseId}/sessions/${stored.nextSessionId}`).get()).data()!;
    expect(stored.nextAvailableSeats, "course nextAvailableSeats").toBe(next.capacity - next.occupied - next.held);
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

// -- Promotion engine (D4) ------------------------------------------------------------------------------------------
type Freed = { sessionId: string; kind: "occupied" | "held" | "free" };
const enrollmentIdOf = (uid: string, requestId: string) =>
  createHash("sha256").update(`${uid}:${requestId}`).digest("hex");
const notices = async (event: string) =>
  (await db.collection("courseNotifications").where("event", "==", event).get()).docs
    .map((d) => d.data().uid as string).sort();
const waitlistView = async (courseId: string, id = SESSION) =>
  (await waitlist(courseId, id)).map((e) => [e.id, e.position]);

/**
 * Runs the planner the way a release does: one transaction that reads, frees the seat of `holders` (the customer
 * whose seat is released) and applies the plan. Counters therefore stay consistent for assertCounters.
 */
async function plan(courseId: string, freed: Freed[], options: { checkoutOn?: boolean; now?: Date; holders?: string[] } = {}) {
  const { planPromotions } = await import("./waitlist");
  return db.runTransaction(async (tx) => {
    const course = (await tx.get(db.doc(`courses/${courseId}`))).data() as never;
    const ids = [...new Set(freed.map((f) => f.sessionId))];
    const docs = ids.length ? await tx.getAll(...ids.map((id) => sessionRef(courseId, id))) : [];
    const sessions = new Map(docs.map((d) => [d.id, d.data()])) as never;
    const result = await planPromotions(tx, { course: { ...(course as object), id: courseId } as never, sessions,
      freed, checkoutOn: options.checkoutOn ?? false, now: options.now ?? new Date() });
    for (const seat of freed) {
      if (seat.kind === "free") continue;
      tx.update(sessionRef(courseId, seat.sessionId), { [seat.kind]: admin.firestore.FieldValue.increment(-1) });
      tx.delete(sessionRef(courseId, seat.sessionId).collection("participants").doc((options.holders ?? ["h"])[0]));
    }
    if (freed.some((f) => f.sessionId === (course as { nextSessionId: string }).nextSessionId && f.kind !== "free")) {
      tx.update(db.doc(`courses/${courseId}`), { nextAvailableSeats: admin.firestore.FieldValue.increment(1) });
    }
    result.apply();
    return { promoted: result.promoted, cleared: result.cleared, dropped: result.dropped };
  });
}
const seat: Freed = { sessionId: SESSION, kind: "occupied" };
const enrollmentOf = async (uid: string, requestId: string) =>
  (await db.doc(`courseEnrollments/${enrollmentIdOf(uid, requestId)}`).get()).data();

describe("planPromotions", () => {
  it("promotes position 1 into the freed seat and renumbers the rest", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3"]) await join(uid, courseId);
    const result = await plan(courseId, [seat]);
    expect(result.promoted).toEqual([{ sessionId: SESSION, uid: "u1", enrollmentId: enrollmentIdOf("u1", "w-u1") }]);
    expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed", userId: "u1", scope: "lesson",
      sessionIds: [SESSION], promotedFromWaitlist: true, paymentMode: "direct", totalCents: 1500 });
    expect(await waitlistView(courseId)).toEqual([["u2", 1], ["u3", 2]]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, held: 0, waitlisted: 2 });
    expect(await notices("waitlist_promoted")).toEqual(["u1"]);
    expect(await notices("waitlist_cleared")).toEqual([]);
    await assertCounters(courseId);
  });
  it("makes a Stripe entry a 30 minute hold when checkout is on", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await db.doc(`courses/${courseId}/sessions/${SESSION}/waitlist/u1`).update({ paymentMode: "stripe" });
    const before = Date.now();
    await plan(courseId, [seat], { checkoutOn: true });
    const enrollment = (await enrollmentOf("u1", "w-u1"))!;
    expect(enrollment).toMatchObject({ state: "held", paymentMode: "stripe", promotedFromWaitlist: true });
    expect(enrollment.holdExpiresAt.toMillis() - before).toBeGreaterThan(29 * 60000);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, held: 1, waitlisted: 0 });
    await assertCounters(courseId);
  });
  it("moves a freed hold to the next customer without touching the other counter", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await db.doc(`courses/${courseId}/sessions/${SESSION}/participants/h`).update({ state: "held" });
    await sessionRef(courseId).update({ occupied: 0, held: 1 });
    await db.doc(`courseEnrollments/${enrollmentIdOf("h", "hold-h-" + SESSION)}`).update({ state: "held" });
    await plan(courseId, [{ sessionId: SESSION, kind: "held" }]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, held: 0 });
    await assertCounters(courseId);
  });
  it("drops a suspended customer with a notice and promotes the next", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3"]) await join(uid, courseId);
    await db.doc("users/u1").update({ accountStatus: "suspended" });
    const result = await plan(courseId, [seat]);
    expect(result.promoted.map((p) => p.uid)).toEqual(["u2"]);
    expect(result.dropped).toEqual([{ sessionId: SESSION, uid: "u1" }]);
    expect(await waitlistView(courseId)).toEqual([["u3", 1]]);
    expect(await notices("waitlist_cleared")).toEqual(["u1"]);
    expect(await notices("waitlist_promoted")).toEqual(["u2"]);
    expect(await enrollmentOf("u1", "w-u1")).toBeUndefined();
    await assertCounters(courseId);
  });
  it("drops a customer who is already seated in the lesson", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await sessionRef(courseId).collection("participants").doc("u1").set({ enrollmentId: "x", userId: "u1" });
    const result = await plan(courseId, [seat]);
    expect(result.promoted.map((p) => p.uid)).toEqual(["u2"]);
    expect(await notices("waitlist_cleared")).toEqual(["u1"]);
  });
  it("drops a Stripe entry when checkout was switched off, and promotes the next", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await db.doc(`courses/${courseId}/sessions/${SESSION}/waitlist/u1`).update({ paymentMode: "stripe" });
    const result = await plan(courseId, [seat], { checkoutOn: false });
    expect(result.promoted.map((p) => p.uid)).toEqual(["u2"]);
    expect(await notices("waitlist_cleared")).toEqual(["u1"]);
    expect(await waitlistView(courseId)).toEqual([]);
    await assertCounters(courseId);
  });
  it("drops a Stripe entry whose price cannot be charged online and promotes the next direct entry", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await db.doc(`courses/${courseId}/sessions/${SESSION}/waitlist/u1`).update({ paymentMode: "stripe" });
    // 40 cents is above zero and below Stripe's minimum: no hold may be created for it.
    await db.doc(`courses/${courseId}`).update({ lessonPriceCents: 40 });
    const result = await plan(courseId, [seat], { checkoutOn: true });
    expect(result.promoted.map((p) => p.uid)).toEqual(["u2"]);
    expect(result.dropped).toEqual([{ sessionId: SESSION, uid: "u1" }]);
    expect(await enrollmentOf("u1", "w-u1")).toBeUndefined();
    expect(await enrollmentOf("u2", "w-u2")).toMatchObject({ state: "confirmed", totalCents: 40 });
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, held: 0 });
    await assertCounters(courseId);
  });
  it("drops an entry whose request id already belongs to another enrollment, and continues", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    // The customer used the same request id for another lesson that was promoted first.
    await db.doc(`courseEnrollments/${enrollmentIdOf("u1", "w-u1")}`).set({ userId: "u1", courseId: "other",
      scope: "lesson", sessionIds: ["x"], paymentMode: "direct", totalCents: 1 });
    const result = await plan(courseId, [seat]);
    expect(result.promoted.map((p) => p.uid)).toEqual(["u2"]);
    expect(result.dropped).toEqual([{ sessionId: SESSION, uid: "u1" }]);
    expect(await notices("waitlist_cleared")).toEqual(["u1"]);
    expect(await waitlistView(courseId)).toEqual([]);
  });
  it("stops, keeping every entry, when the refusal concerns the lesson (venue switched off)", async () => {
    await db.doc("venues/v").set({ ownerId: "p", type: "gym", partnerStatus: "active", isActive: true });
    const courseId = await fullCourse();
    await db.doc(`courses/${courseId}`).update({ venueId: "v" });
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await db.doc("venues/v").update({ partnerStatus: "suspended" });
    const result = await plan(courseId, [seat]);
    expect(result).toEqual({ promoted: [], cleared: [], dropped: [] });
    expect(await waitlistView(courseId)).toEqual([["u1", 1], ["u2", 2]]);
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 2, occupied: 0 });
    expect(await notices("waitlist_cleared")).toEqual([]);
  });
  it("tries only PROMOTION_SCAN entries per seat and leaves the others where they are", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3", "u4", "u5", "u6"]) await join(uid, courseId);
    for (const uid of ["u1", "u2", "u3", "u4", "u5"]) await db.doc(`users/${uid}`).update({ isActive: false });
    const result = await plan(courseId, [seat]);
    expect(result.promoted).toEqual([]);
    expect(result.dropped).toHaveLength(5);
    // u6 was never examined: still waiting, now first.
    expect(await waitlistView(courseId)).toEqual([["u6", 1]]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, waitlisted: 1 });
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2", "u3", "u4", "u5"]);
    await assertCounters(courseId);
  });
  it("clears the whole list when the lesson is inside the notice window, enrolling nobody", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await sessionRef(courseId).update({ startsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3600000) });
    const result = await plan(courseId, [seat]);
    expect(result).toEqual({ promoted: [], cleared: [SESSION], dropped: [] });
    expect(await waitlist(courseId)).toEqual([]);
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 0, occupied: 0 });
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2"]);
    expect(await notices("waitlist_promoted")).toEqual([]);
    expect((await db.collection("courseEnrollments").get()).size).toBe(1);
    await assertCounters(courseId);
  });
  it("promotes the same customer into two lessons in one transaction", async () => {
    const courseId = await course();
    await holdSeat(courseId, "h", SESSION);
    await holdSeat(courseId, "h", OTHER);
    await join("u1", courseId);
    await api.joinCourseWaitlist.run(request("u1", { courseId, sessionId: OTHER, paymentMode: "direct", requestId: "w-u1-b" }));
    await plan(courseId, [seat, { sessionId: OTHER, kind: "occupied" }]);
    expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ sessionIds: [SESSION], state: "confirmed" });
    expect(await enrollmentOf("u1", "w-u1-b")).toMatchObject({ sessionIds: [OTHER], state: "confirmed" });
    expect(await sessionOf(courseId, OTHER)).toMatchObject({ occupied: 1, waitlisted: 0 });
    // Both promotions share one transaction and one roster row.
    expect((await db.collection("clients").where("userId", "==", "u1").get()).size).toBe(1);
    await assertCounters(courseId);
  });
  it("consumes a request id shared by two lessons once: the second entry is dropped, the next customer promoted", async () => {
    const courseId = await course();
    await holdSeat(courseId, "h", SESSION);
    await holdSeat(courseId, "h", OTHER);
    await join("u1", courseId, { requestId: "shared" });
    await api.joinCourseWaitlist.run(request("u1", { courseId, sessionId: OTHER, paymentMode: "direct", requestId: "shared" }));
    await api.joinCourseWaitlist.run(request("u2", { courseId, sessionId: OTHER, paymentMode: "direct", requestId: "w-u2" }));
    const result = await plan(courseId, [seat, { sessionId: OTHER, kind: "occupied" }]);
    expect(result.promoted.map((p) => [p.sessionId, p.uid])).toEqual([[SESSION, "u1"], [OTHER, "u2"]]);
    expect(result.dropped).toEqual([{ sessionId: OTHER, uid: "u1" }]);
    expect(await enrollmentOf("u1", "shared")).toMatchObject({ sessionIds: [SESSION] });
    expect(await notices("waitlist_cleared")).toEqual(["u1"]);
    expect(await waitlist(courseId, OTHER)).toEqual([]);
  });
  it("does nothing, keeping the entries, for an unpublished or closed course", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    for (const change of [{ state: "archived" }, { state: "published", enrollmentClosed: true }]) {
      await db.doc(`courses/${courseId}`).update(change);
      const result = await plan(courseId, []);
      expect(result).toEqual({ promoted: [], cleared: [], dropped: [] });
    }
    await db.doc(`courses/${courseId}`).update({ state: "archived", enrollmentClosed: false });
    expect(await plan(courseId, [{ sessionId: SESSION, kind: "free" }]))
      .toEqual({ promoted: [], cleared: [], dropped: [] });
    expect(await waitlistView(courseId)).toEqual([["u1", 1]]);
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 1 });
  });
  it("does nothing for a cancelled lesson", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await sessionRef(courseId).update({ state: "cancelled" });
    expect(await plan(courseId, [seat])).toEqual({ promoted: [], cleared: [], dropped: [] });
    expect(await waitlistView(courseId)).toEqual([["u1", 1]]);
  });
  it("promotes into a seat that is already free in the stored counters", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await db.doc(`courses/${courseId}/sessions/${SESSION}/participants/h`).delete();
    await sessionRef(courseId).update({ occupied: 0 });
    await db.doc(`courses/${courseId}`).update({ nextAvailableSeats: 1 });
    const result = await plan(courseId, [{ sessionId: SESSION, kind: "free" }]);
    expect(result.promoted.map((p) => p.uid)).toEqual(["u1"]);
    await assertCounters(courseId);
  });
  it("leaves lessons that do not fit the write budget for the sweep", async () => {
    const courseId = await course();
    await holdSeat(courseId, "h", SESSION);
    await holdSeat(courseId, "h", OTHER);
    const soon = admin.firestore.Timestamp.fromMillis(Date.now() + 3600000);
    for (const id of [SESSION, OTHER]) {
      const batch = db.batch();
      for (let i = 0; i < 100; i++) {
        batch.set(sessionRef(courseId, id).collection("waitlist").doc(`b${i}`), { userId: `b${i}`, customerName: "b",
          scope: "lesson", requestId: `r${i}`, paymentMode: "direct", position: i + 1, createdAt: soon, courseId,
          sessionId: id, courseName: "Karate", providerId: "p", venueId: null });
      }
      batch.update(sessionRef(courseId, id), { waitlisted: 100, startsAt: soon });
      await batch.commit();
    }
    const result = await plan(courseId, [seat, { sessionId: OTHER, kind: "occupied" }]);
    expect(result.cleared).toEqual([SESSION]);
    expect(await sessionOf(courseId, SESSION)).toMatchObject({ waitlisted: 0 });
    expect(await sessionOf(courseId, OTHER)).toMatchObject({ waitlisted: 100 });
    expect((await waitlist(courseId, OTHER))).toHaveLength(100);
  });
  it("aborts on a Firestore contention error instead of swallowing it", async () => {
    const { planPromotions } = await import("./waitlist");
    const tx = { get: async () => { throw Object.assign(new Error("aborted"), { code: 10 }); } };
    const startsAt = admin.firestore.Timestamp.fromMillis(Date.now() + 86400000 * 30);
    await expect(planPromotions(tx as never, { course: { id: "c", state: "published", enrollmentClosed: false,
      bookingNoticeHours: 2 } as never, sessions: new Map([[SESSION, { state: "scheduled", waitlisted: 1, startsAt }]]) as never,
    freed: [seat], checkoutOn: false, now: new Date() })).rejects.toMatchObject({ code: 10 });
  });
});

describe("clearWaitlistInTx", () => {
  const clear = async (courseId: string, reason: "lesson_cancelled" | "rescheduled" | "archived" | "window_closed") => {
    const { clearWaitlistInTx } = await import("./waitlist");
    return db.runTransaction(async (tx) => {
      const course = (await tx.get(db.doc(`courses/${courseId}`))).data() as object;
      const write = await clearWaitlistInTx(tx, { ...course, id: courseId } as never, SESSION, reason);
      write();
    });
  };
  it("deletes every entry, zeroes the counter and notifies each customer", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3"]) await join(uid, courseId);
    await clear(courseId, "lesson_cancelled");
    expect(await waitlist(courseId)).toEqual([]);
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 0 });
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2", "u3"]);
    await assertCounters(courseId);
  });
  it("writes nothing for an empty list", async () => {
    const courseId = await fullCourse();
    const before = (await sessionRef(courseId).get()).updateTime;
    await clear(courseId, "archived");
    expect((await sessionRef(courseId).get()).updateTime).toEqual(before);
    expect((await db.collection("courseNotifications").get()).docs.filter((d) => d.data().event === "waitlist_cleared"))
      .toEqual([]);
  });
});

// -- Promotion on every release (D5) --------------------------------------------------------------------------------
const holderEnrollment = (id = SESSION) => enrollmentIdOf("h", `hold-h-${id}`);
const cancel = (uid: string, enrollmentId: string, extra: Record<string, unknown> = {}) =>
  api.cancelCourseEnrollment.run(request(uid, { enrollmentId, ...extra }));
const past = () => admin.firestore.Timestamp.fromMillis(Date.now() - 60000);
const stripeSwitch = async (on: boolean) => {
  await db.doc("systemSettings/payments").set({ stripePaymentsEnabled: on, courseCheckoutEnabled: on });
  (await import("../lib/cachedDoc")).invalidateCachedDoc("systemSettings/payments");
};
const maintain = () => api.maintainCourseEnrollments.run({ scheduleTime: new Date().toISOString(), jobName: "test" });
async function stripeHold(courseId: string, uid = "h", id = SESSION) {
  const quote = await api.quoteCourse.run(request(uid, { courseId }));
  const line = quote.sessions.find((l) => l.sessionId === id)!;
  return api.enrollInCourse.run(request(uid, { courseId, scope: "lesson", sessionId: id, paymentMode: "stripe",
    requestId: `hold-${uid}-${id}`, expectedFinalCents: line.finalCents, expectedRevisions: { [id]: line.revision } }));
}

describe("promotion when a seat is released", () => {
  it("seats the first waitlisted customer when the holder cancels", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await cancel("h", holderEnrollment());
    expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed", promotedFromWaitlist: true });
    expect(await enrollmentOf("h", `hold-h-${SESSION}`)).toMatchObject({ state: "cancelled" });
    // The released seat went straight to the customer: the counter never dropped.
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, held: 0, waitlisted: 1 });
    expect(await waitlistView(courseId)).toEqual([["u2", 1]]);
    expect(await notices("waitlist_promoted")).toEqual(["u1"]);
    await assertCounters(courseId);
  });
  it("does the same when the provider cancels the customer's booking", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await cancel("p", holderEnrollment(), { reason: "Sorry" });
    expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed", promotedFromWaitlist: true });
    expect(await notices("cancelled_by_trainer")).toEqual(["h"]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, waitlisted: 0 });
    await assertCounters(courseId);
  });
  it("promotes only once when the cancellation is replayed or raced", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await Promise.allSettled([cancel("h", holderEnrollment()), cancel("p", holderEnrollment())]);
    await cancel("h", holderEnrollment());
    expect(await enrollmentOf("u2", "w-u2")).toBeUndefined();
    expect(await waitlistView(courseId)).toEqual([["u2", 1]]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, waitlisted: 1 });
    await assertCounters(courseId);
  });
  it("promotes through a Stripe hold chain as holds expire in the maintenance run", async () => {
    await stripeSwitch(true);
    try {
      const courseId = await course();
      await stripeHold(courseId);
      await join("u1", courseId, { paymentMode: "stripe" });
      await join("u2", courseId);
      await db.doc(`courseEnrollments/${holderEnrollment()}`).update({ holdExpiresAt: past() });
      await maintain();
      const first = (await enrollmentOf("u1", "w-u1"))!;
      expect(first).toMatchObject({ state: "held", paymentMode: "stripe", promotedFromWaitlist: true });
      expect(first.holdExpiresAt.toMillis()).toBeGreaterThan(Date.now() + 25 * 60000);
      expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, held: 1, waitlisted: 1 });
      expect(await enrollmentOf("h", `hold-h-${SESSION}`)).toMatchObject({ state: "expired" });
      await assertCounters(courseId);
      await db.doc(`courseEnrollments/${enrollmentIdOf("u1", "w-u1")}`).update({ holdExpiresAt: past() });
      await maintain();
      expect(await enrollmentOf("u2", "w-u2")).toMatchObject({ state: "confirmed", paymentMode: "direct" });
      expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, held: 0, waitlisted: 0 });
      expect(await notices("waitlist_promoted")).toEqual(["u1", "u2"]);
      await assertCounters(courseId);
    } finally {
      await stripeSwitch(false);
    }
  });
  it("promotes when a checkout session expires (the webhook's release)", async () => {
    await stripeSwitch(true);
    try {
      const courseId = await course();
      await stripeHold(courseId);
      await join("u1", courseId);
      await db.doc(`courseEnrollments/${holderEnrollment()}`).update({ holdExpiresAt: past() });
      const { releaseEnrollment } = await import("./operations");
      await releaseEnrollment(holderEnrollment(), { kind: "system" }, undefined, "", true);
      expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed" });
      await releaseEnrollment(holderEnrollment(), { kind: "system" }, undefined, "", true);
      expect(await waitlist(courseId)).toEqual([]);
      expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, held: 0 });
      await assertCounters(courseId);
    } finally {
      await stripeSwitch(false);
    }
  });
  it("drops a Stripe entry at promotion time when checkout was switched off, and seats the next one", async () => {
    await stripeSwitch(true);
    try {
      const courseId = await course();
      await stripeHold(courseId);
      await join("u1", courseId, { paymentMode: "stripe" });
      await join("u2", courseId);
      await stripeSwitch(false);
      await db.doc(`courseEnrollments/${holderEnrollment()}`).update({ holdExpiresAt: past() });
      await maintain();
      expect(await enrollmentOf("u1", "w-u1")).toBeUndefined();
      expect(await notices("waitlist_cleared")).toEqual(["u1"]);
      expect(await enrollmentOf("u2", "w-u2")).toMatchObject({ state: "confirmed" });
      await assertCounters(courseId);
    } finally {
      await stripeSwitch(false);
    }
  });
  it("promotes when a late Stripe payment arrives for a hold that already ran out", async () => {
    await stripeSwitch(true);
    try {
      const courseId = await course();
      const booking = await stripeHold(courseId);
      await join("u1", courseId);
      await db.doc(`courseEnrollments/${booking.enrollmentId}`).update({ holdExpiresAt: past(), checkoutSessionId: "cs" });
      const checkout = await import("./checkout");
      await checkout.fulfillCourseCheckout({ id: "cs", payment_intent: "pi", payment_status: "paid", currency: "eur",
        amount_total: 1500, metadata: { courseEnrollmentId: booking.enrollmentId, userId: "h" } } as never);
      expect((await db.doc(`courseRefunds/${booking.enrollmentId}_late`).get()).data())
        .toMatchObject({ status: "pending", amountCents: 1500 });
      expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed", promotedFromWaitlist: true });
      expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, held: 0, waitlisted: 0 });
      await assertCounters(courseId);
    } finally {
      await stripeSwitch(false);
    }
  });
  it("promotes on every lesson of a released series that has a waitlist", async () => {
    const courseId = await course({ endDate: "2099-10-14", seriesPriceCents: 3000 });
    const days = ["2099-10-12", "2099-10-13", "2099-10-14"];
    const quote = await api.quoteCourse.run(request("h", { courseId }));
    const series = await api.enrollInCourse.run(request("h", { courseId, scope: "series", requestId: "series-h",
      expectedFinalCents: quote.series!.finalCents, expectedRevisions: quote.series!.revisions }));
    const wait = (uid: string, sessionId: string) =>
      api.joinCourseWaitlist.run(request(uid, { courseId, sessionId, paymentMode: "direct", requestId: `w-${uid}-${sessionId}` }));
    await wait("u1", days[0]);
    await wait("u2", days[1]);
    await wait("u3", days[2]);
    await wait("u4", days[2]);
    await cancel("h", series.enrollmentId);
    for (const [uid, day] of [["u1", days[0]], ["u2", days[1]], ["u3", days[2]]]) {
      expect(await enrollmentOf(uid, `w-${uid}-${day}`), `${uid} on ${day}`).toMatchObject({ state: "confirmed" });
    }
    expect(await waitlistView(courseId, days[2])).toEqual([["u4", 1]]);
    expect(await notices("waitlist_promoted")).toEqual(["u1", "u2", "u3"]);
    await assertCounters(courseId);
  });
  it("clears the waitlist, and leaves the seat free, when the seat is freed inside the notice window", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await sessionRef(courseId).update({ startsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3600000) });
    await cancel("p", holderEnrollment());
    expect(await enrollmentOf("u1", "w-u1")).toBeUndefined();
    expect(await waitlist(courseId)).toEqual([]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, waitlisted: 0 });
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2"]);
    await assertCounters(courseId);
  });
  it("promotes nobody into a lesson that was cancelled", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await api.manageCourseSession.run(request("p", { courseId, sessionId: SESSION, action: "cancel", reason: "Closed" }));
    expect(await enrollmentOf("u1", "w-u1")).toBeUndefined();
    expect(await notices("waitlist_promoted")).toEqual([]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, state: "cancelled" });
  });
  it("still cancels when the waitlist cannot be served (venue switched off)", async () => {
    await db.doc("venues/v").set({ ownerId: "p", type: "gym", partnerStatus: "active", isActive: true });
    const courseId = await fullCourse();
    await db.doc(`courses/${courseId}`).update({ venueId: "v" });
    await join("u1", courseId);
    await db.doc("venues/v").update({ partnerStatus: "suspended" });
    await cancel("h", holderEnrollment());
    expect(await enrollmentOf("h", `hold-h-${SESSION}`)).toMatchObject({ state: "cancelled" });
    expect(await enrollmentOf("u1", "w-u1")).toBeUndefined();
    expect(await waitlistView(courseId)).toEqual([["u1", 1]]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, waitlisted: 1 });
  });
  it("does not touch a lesson that has no waitlist", async () => {
    const courseId = await fullCourse();
    await cancel("h", holderEnrollment());
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, waitlisted: 0 });
    await assertCounters(courseId);
  });
});

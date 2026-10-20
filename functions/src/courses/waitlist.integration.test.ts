import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testProjectId } from "./testProject";
import * as admin from "firebase-admin";
import { createHash } from "crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import { assertLockInvariant } from "./lockInvariant.testutil";
import { retryEmulatorAbort, emulatorAborts, withTimeout } from "./raceRetry.testutil";
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
const COLLECTIONS = ["waitlist", "courses", "courseEnrollments", "courseRefunds", "courseNotifications", "clients",
  "users", "instructors", "serviceCategories", "venues", "venueStaff", "rateLimits", "courseScheduleLocks",
  "systemSettings", "courseSweepState", "elsewhere"];
const CUSTOMERS = ["u1", "u2", "u3", "u4", "u5", "u6", "h"];

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: testProjectId("demo-vfit-waitlist") });
  db = admin.firestore();
  api = await import("./index");
});
afterEach(() => vi.restoreAllMocks());
beforeEach(() => resetDb());
const wipe = (names: string[]) => Promise.all(names.map((name) => db.recursiveDelete(db.collection(name))));
// Full wipe and seed: once per test.
async function resetDb() {
  await wipe(COLLECTIONS);
  await seed();
}
async function seed() {
  await Promise.all([
    db.doc("instructors/p").set({ fullName: "Anna", isActive: true, applicationStatus: "approved",
      providerProfile: { isVerified: true } }),
    db.doc("serviceCategories/karate").set({ isActive: true, parentId: "combat" }),
    db.doc("users/p").set({ fullName: "p", role: "provider", isActive: true }),
    ...CUSTOMERS.map((uid) => db.doc(`users/${uid}`).set({ fullName: `Name ${uid}`, role: "customer", isActive: true })),
    db.doc("systemSettings/payments").set({ stripePaymentsEnabled: false, courseCheckoutEnabled: false }),
  ]);
}
// Between the iterations of one race only what a course run leaves behind goes: the seeded users, provider and
// settings are never written by a race, so they stay (the full wipe above ran in beforeEach).
const RACE_DATA = ["courses", "courseEnrollments", "courseRefunds", "courseNotifications", "clients",
  "courseScheduleLocks", "courseSweepState", "rateLimits"];
const resetRace = () => wipe(RACE_DATA);

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
    // Leaving is the customer's own act: no notice.
    expect(await notices("waitlist_removed")).toEqual([]);
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
const seatedOf2 = async (courseId: string, id = SESSION) =>
  (await sessionRef(courseId, id).collection("participants").get()).docs.map((d) => d.id).sort();
// Every notification queued so far as "event:uid", sorted: a duplicate or a wrong notice shows up as a diff.
const queued = async () => (await db.collection("courseNotifications").get()).docs
  .map((d) => `${d.data().event}:${d.data().uid}`).sort();
const forgetNotices = () => db.recursiveDelete(db.collection("courseNotifications"));
// uid -> reason code of the notices of one event.
const reasonsOf = async (event: string) => Object.fromEntries(
  (await db.collection("courseNotifications").where("event", "==", event).get()).docs
    .map((d) => [d.data().uid, d.data().reason]));

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
    expect(await notices("waitlist_removed")).toEqual(["u1"]);
    expect(await reasonsOf("waitlist_removed")).toEqual({ u1: "account_inactive" });
    expect(await notices("waitlist_cleared")).toEqual([]);
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
    expect(await notices("waitlist_removed")).toEqual(["u1"]);
  });
  it("drops a Stripe entry when checkout was switched off, and promotes the next", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await db.doc(`courses/${courseId}/sessions/${SESSION}/waitlist/u1`).update({ paymentMode: "stripe" });
    const result = await plan(courseId, [seat], { checkoutOn: false });
    expect(result.promoted.map((p) => p.uid)).toEqual(["u2"]);
    expect(await notices("waitlist_removed")).toEqual(["u1"]);
    expect(await reasonsOf("waitlist_removed")).toEqual({ u1: "payment_unavailable" });
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
    expect(await reasonsOf("waitlist_removed")).toEqual({ u1: "amount_too_low" });
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
    expect(await notices("waitlist_removed")).toEqual(["u1"]);
    expect(await reasonsOf("waitlist_removed")).toEqual({ u1: "request_reused" });
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
    expect(await notices("waitlist_removed")).toEqual(["u1", "u2", "u3", "u4", "u5"]);
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
    expect(await notices("waitlist_removed")).toEqual(["u1"]);
    expect(await reasonsOf("waitlist_removed")).toEqual({ u1: "request_reused" });
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
  it("repairs a ghost counter (counter 3, no entries) when a seat is released, and promotes nobody", async () => {
    const courseId = await fullCourse();
    await sessionRef(courseId).update({ waitlisted: 3 });
    const result = await plan(courseId, [seat]);
    expect(result).toEqual({ promoted: [], cleared: [], dropped: [] });
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 0, occupied: 0 });
    await assertCounters(courseId);
  });
  it("recounts from the entries when the counter disagrees and a promotion follows", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3"]) await join(uid, courseId);
    await sessionRef(courseId).update({ waitlisted: 7 });
    await plan(courseId, [seat]);
    expect(await seatedOf2(courseId)).toEqual(["u1"]);
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 2, occupied: 1 });
    expect(await waitlistView(courseId)).toEqual([["u2", 1], ["u3", 2]]);
    await assertCounters(courseId);
  });
  // The planner's own reads are not the only way contention reaches it: enrollInTx runs inside it, and a numeric gRPC
  // code from there (ABORTED, UNAVAILABLE, DEADLINE_EXCEEDED) must abort the whole transaction so it is retried.
  // Swallowing it as "stop" would commit the caller's release without the promotion; as "drop" it would delete an
  // innocent customer's entry.
  it.each([[10, "ABORTED"], [14, "UNAVAILABLE"], [4, "DEADLINE_EXCEEDED"]])(
    "rethrows gRPC code %i (%s) raised inside enrollInTx instead of stopping or dropping the entry",
    async (code) => {
      const courseId = await fullCourse();
      await join("u1", courseId);
      const { planPromotions } = await import("./waitlist");
      const failure = Object.assign(new Error(`${code} gRPC failure`), { code });
      const planned = db.runTransaction(async (tx) => {
        const course = (await tx.get(db.doc(`courses/${courseId}`))).data() as never;
        const sessions = new Map([[SESSION, (await tx.get(sessionRef(courseId))).data()]]) as never;
        // Everything the planner reads passes through; the customer's account, read by enrollInTx, fails.
        const guarded = new Proxy(tx, {
          get(target, prop) {
            const value = Reflect.get(target, prop) as (...args: unknown[]) => unknown;
            if (prop !== "get" && prop !== "getAll") return typeof value === "function" ? value.bind(target) : value;
            return (...refs: unknown[]) => {
              if (refs.some((ref) => (ref as { path?: string })?.path === "users/u1")) throw failure;
              return value.apply(target, refs);
            };
          },
        });
        const result = await planPromotions(guarded, { course: { ...(course as object), id: courseId } as never,
          sessions, freed: [seat], checkoutOn: false, now: new Date() });
        result.apply();
      }, { maxAttempts: 1 });
      await expect(planned).rejects.toMatchObject({ code });
      // Nothing was written: the entry is still waiting and nobody was told anything.
      expect(await waitlistView(courseId)).toEqual([["u1", 1]]);
      expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 1, occupied: 1 });
      expect(await queued()).not.toContain("waitlist_removed:u1");
      await assertCounters(courseId);
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
  it("zeroes a ghost counter (counter 3, no entries) without a notice", async () => {
    const courseId = await fullCourse();
    await sessionRef(courseId).update({ waitlisted: 3 });
    await clear(courseId, "lesson_cancelled");
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 0, occupied: 1 });
    expect(await notices("waitlist_cleared")).toEqual([]);
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
  it("tells a promoted direct customer exactly once: waitlist_promoted, no second 'accepted'; the provider hears new_request", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await forgetNotices();
    await cancel("h", holderEnrollment());
    expect(await queued()).toEqual(["cancelled_by_client:h", "new_request:p", "waitlist_promoted:u1"]);
    const promoted = (await db.collection("courseNotifications").where("event", "==", "waitlist_promoted").get())
      .docs[0].data();
    expect(promoted).toMatchObject({ uid: "u1", sendEmail: true, link: "/courses?tab=bookings" });
    await assertCounters(courseId);
  });
  it("tells a promoted Stripe customer once with the 30 minute hold copy, and nobody else", async () => {
    await stripeSwitch(true);
    try {
      const courseId = await course();
      await stripeHold(courseId);
      await join("u1", courseId, { paymentMode: "stripe" });
      await forgetNotices();
      await cancel("h", holderEnrollment());
      expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "held", paymentMode: "stripe" });
      expect(await queued()).toEqual(["cancelled_by_client:h", "waitlist_promoted_hold:u1"]);
      await assertCounters(courseId);
    } finally {
      await stripeSwitch(false);
    }
  });
  it("a Stripe entry whose lesson turned out free is confirmed, so it gets the confirmed notice", async () => {
    await stripeSwitch(true);
    try {
      const courseId = await course();
      await holdSeat(courseId, "h");
      await join("u1", courseId, { paymentMode: "stripe" });
      await db.doc(`courses/${courseId}`).update({ lessonPriceCents: 0 });
      await forgetNotices();
      await cancel("h", holderEnrollment());
      expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed", totalCents: 0 });
      expect(await queued()).toEqual(["cancelled_by_client:h", "new_request:p", "waitlist_promoted:u1"]);
    } finally {
      await stripeSwitch(false);
    }
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
      expect(await notices("waitlist_promoted_hold")).toEqual(["u1"]);
      expect(await notices("waitlist_promoted")).toEqual(["u2"]);
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
      expect(await notices("waitlist_removed")).toEqual(["u1"]);
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

// -- promoteWaitlist and the sweep (D6) -----------------------------------------------------------------------------
/** The holder's seat vanishes from the counters only (a stranded waitlist: free seat, entries still waiting). */
async function strand(courseId: string, id = SESSION) {
  await sessionRef(courseId, id).collection("participants").doc("h").delete();
  await sessionRef(courseId, id).update({ occupied: 0 });
  const stored = (await db.doc(`courses/${courseId}`).get()).data()!;
  if (stored.nextSessionId === id) await db.doc(`courses/${courseId}`).update({ nextAvailableSeats: 1 });
}
const promoteStandalone = async (courseId: string, id = SESSION) =>
  (await import("./waitlist")).promoteWaitlist(courseId, id);
const sweep = async (options: Record<string, unknown> = {}) => (await import("./maintenance")).sweepWaitlists(options);
const soon = () => admin.firestore.Timestamp.fromMillis(Date.now() + 3600000);

describe("promoteWaitlist", () => {
  it("seats as many customers as there are free seats and leaves the rest waiting; a replay seats nobody", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3"]) await join(uid, courseId);
    // Staff raised the capacity 1 -> 3 (the E4 hook will call promoteWaitlist after writing it).
    await sessionRef(courseId).update({ capacity: 3 });
    await db.doc(`courses/${courseId}`).update({ nextAvailableSeats: 2 });
    expect(await promoteStandalone(courseId)).toBe(2);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 3, held: 0, waitlisted: 1, capacity: 3 });
    expect(await waitlistView(courseId)).toEqual([["u3", 1]]);
    expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed", promotedFromWaitlist: true });
    expect(await enrollmentOf("u2", "w-u2")).toMatchObject({ state: "confirmed", promotedFromWaitlist: true });
    expect(await notices("waitlist_promoted")).toEqual(["u1", "u2"]);
    await assertCounters(courseId);
    expect(await promoteStandalone(courseId)).toBe(0);
    await assertCounters(courseId);
  });
  it("does nothing, and writes nothing, for a full lesson", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    const before = (await sessionRef(courseId).get()).updateTime;
    expect(await promoteStandalone(courseId)).toBe(0);
    expect((await sessionRef(courseId).get()).updateTime).toEqual(before);
    expect(await waitlistView(courseId)).toEqual([["u1", 1]]);
    await assertCounters(courseId);
  });
  it("does nothing for a lesson without a waitlist, a cancelled lesson, a closed course and unknown ids", async () => {
    const courseId = await fullCourse();
    await strand(courseId);
    expect(await promoteStandalone(courseId)).toBe(0);
    await join("u1", courseId).catch(() => undefined);
    await sessionRef(courseId).set({ waitlisted: 1 }, { merge: true });
    await sessionRef(courseId).update({ state: "cancelled" });
    expect(await promoteStandalone(courseId)).toBe(0);
    await sessionRef(courseId).update({ state: "scheduled" });
    await db.doc(`courses/${courseId}`).update({ enrollmentClosed: true });
    expect(await promoteStandalone(courseId)).toBe(0);
    expect(await promoteStandalone(courseId, "2099-01-01")).toBe(0);
    expect(await promoteStandalone("missing", SESSION)).toBe(0);
  });
  it("keeps going past dropped entries until it finds a customer it can seat", async () => {
    const courseId = await fullCourse();
    const ids = ["u1", "u2", "u3", "u4", "u5", "u6"];
    for (const uid of ids) await join(uid, courseId);
    for (const uid of ids.slice(0, 5)) await db.doc(`users/${uid}`).update({ isActive: false });
    await strand(courseId);
    expect(await promoteStandalone(courseId)).toBe(1);
    expect(await enrollmentOf("u6", "w-u6")).toMatchObject({ state: "confirmed" });
    expect(await waitlist(courseId)).toEqual([]);
    expect(await notices("waitlist_removed")).toEqual(ids.slice(0, 5));
    await assertCounters(courseId);
  });
  it("keeps every entry when the refusal concerns the lesson (venue switched off)", async () => {
    await db.doc("venues/v").set({ ownerId: "p", type: "gym", partnerStatus: "active", isActive: true });
    const courseId = await fullCourse();
    await db.doc(`courses/${courseId}`).update({ venueId: "v" });
    await join("u1", courseId);
    await strand(courseId);
    await db.doc("venues/v").update({ partnerStatus: "suspended" });
    expect(await promoteStandalone(courseId)).toBe(0);
    expect(await waitlistView(courseId)).toEqual([["u1", 1]]);
    await db.doc("venues/v").update({ partnerStatus: "active" });
    expect(await promoteStandalone(courseId)).toBe(1);
    await assertCounters(courseId);
  });
  it("zeroes a ghost counter on a lesson with a free seat and promotes nobody", async () => {
    const courseId = await fullCourse();
    await strand(courseId);
    await sessionRef(courseId).update({ waitlisted: 3 });
    expect(await promoteStandalone(courseId)).toBe(0);
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 0, occupied: 0 });
    await assertCounters(courseId);
  });
  it("serves entries behind a zero counter (under-count) and leaves the counter right", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await strand(courseId);
    await sessionRef(courseId).update({ waitlisted: 0 });
    expect(await promoteStandalone(courseId)).toBe(1);
    expect(await seatedOf2(courseId)).toEqual(["u1"]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, waitlisted: 1 });
    expect(await waitlistView(courseId)).toEqual([["u2", 1]]);
    await assertCounters(courseId);
  });
  it("recounts an under-count on a full lesson without promoting", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await sessionRef(courseId).update({ waitlisted: 0 });
    expect(await promoteStandalone(courseId)).toBe(0);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, waitlisted: 2 });
    await assertCounters(courseId);
  });
  it("two concurrent calls never seat more customers than there are seats", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3", "u4"]) await join(uid, courseId);
    await sessionRef(courseId).update({ capacity: 3 });
    await db.doc(`courses/${courseId}`).update({ nextAvailableSeats: 2 });
    await Promise.all([1, 2].map(() => retryEmulatorAbort(() => promoteStandalone(courseId))));
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 3, waitlisted: 2 });
    await assertCounters(courseId);
  });
});

describe("sweepWaitlists", () => {
  it("promotes a stranded entry into a free seat, once", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await strand(courseId);
    expect(await sweep()).toEqual({ examined: 1, promoted: 1, cleared: 0 });
    expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed" });
    await assertCounters(courseId);
    expect(await sweep()).toEqual({ examined: 0, promoted: 0, cleared: 0 });
    await assertCounters(courseId);
  });
  it("is part of the five minute maintenance run", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await strand(courseId);
    await maintain();
    expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed" });
    await assertCounters(courseId);
  });
  it("closes the list of a lesson inside the notice window or already started, with a notice for each customer", async () => {
    const courseId = await course();
    await holdSeat(courseId, "h", SESSION);
    await holdSeat(courseId, "h", OTHER);
    for (const id of [SESSION, OTHER]) {
      await api.joinCourseWaitlist.run(request("u1", { courseId, sessionId: id, paymentMode: "direct", requestId: `w-u1-${id}` }));
    }
    await join("u2", courseId);
    await sessionRef(courseId, SESSION).update({ startsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 60000) });
    await sessionRef(courseId, OTHER).update({ startsAt: soon() });
    expect(await sweep()).toEqual({ examined: 2, promoted: 0, cleared: 2 });
    expect(await waitlist(courseId, SESSION)).toEqual([]);
    expect(await waitlist(courseId, OTHER)).toEqual([]);
    expect(await sessionOf(courseId, SESSION)).toMatchObject({ waitlisted: 0, occupied: 1 });
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u1", "u2"]);
    expect(await notices("waitlist_promoted")).toEqual([]);
    expect(await sweep()).toEqual({ examined: 0, promoted: 0, cleared: 0 });
  });
  it("leaves a legitimate waitlist of a full lesson alone", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    const before = (await sessionRef(courseId).get()).updateTime;
    expect(await sweep()).toEqual({ examined: 1, promoted: 0, cleared: 0 });
    expect((await sessionRef(courseId).get()).updateTime).toEqual(before);
    await assertCounters(courseId);
  });
  it("repairs a ghost counter (counter 3, no entries) on a lesson with a free seat, once", async () => {
    const courseId = await fullCourse();
    await strand(courseId);
    await sessionRef(courseId).update({ waitlisted: 3 });
    expect(await sweep()).toEqual({ examined: 1, promoted: 0, cleared: 0 });
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 0, occupied: 0 });
    expect(await sweep()).toEqual({ examined: 0, promoted: 0, cleared: 0 });
    await assertCounters(courseId);
  });
  it("repairs a ghost counter on a lesson whose notice window is over", async () => {
    const courseId = await fullCourse();
    await sessionRef(courseId).update({ waitlisted: 2, startsAt: soon() });
    expect(await sweep()).toEqual({ examined: 1, promoted: 0, cleared: 1 });
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 0 });
    expect(await notices("waitlist_cleared")).toEqual([]);
  });
  it("picks up entries behind a zero counter (under-count) and seats the first", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await strand(courseId);
    await sessionRef(courseId).update({ waitlisted: 0 });
    expect(await sweep()).toEqual({ examined: 1, promoted: 1, cleared: 0 });
    expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed" });
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, waitlisted: 1 });
    await assertCounters(courseId);
    // The lesson is full again and the counter is right: the counter scan sees a legitimate list and leaves it.
    expect(await sweep()).toEqual({ examined: 1, promoted: 0, cleared: 0 });
  });
  it("recounts an under-count on a full lesson and closes an under-counted list inside the notice window", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await sessionRef(courseId).update({ waitlisted: 0 });
    expect(await sweep()).toEqual({ examined: 1, promoted: 0, cleared: 0 });
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 2, occupied: 1 });
    await assertCounters(courseId);
    await sessionRef(courseId).update({ waitlisted: 0, startsAt: soon() });
    expect(await sweep()).toEqual({ examined: 1, promoted: 0, cleared: 1 });
    expect(await waitlist(courseId)).toEqual([]);
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2"]);
  });
  it("the entry scan ignores waitlist collections that are not a course lesson's", async () => {
    await db.doc("elsewhere/x/sessions/s/waitlist/u1").set({ userId: "u1" });
    await db.doc("elsewhere/x/waitlist/u1").set({ userId: "u1" });
    await db.doc("waitlist/u1").set({ userId: "u1" });
    expect(await sweep()).toEqual({ examined: 0, promoted: 0, cleared: 0 });
  });
  it("does not open a promotion transaction for a legitimate waitlist of a full lesson", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    const waitlistModule = await import("./waitlist");
    const spy = vi.spyOn(waitlistModule, "promoteWaitlist");
    expect(await sweep()).toEqual({ examined: 1, promoted: 0, cleared: 0 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("reads the payment settings once for a run that serves several lessons", async () => {
    const courseId = await course();
    await holdSeat(courseId, "h", SESSION);
    await holdSeat(courseId, "h", OTHER);
    await join("u1", courseId);
    await api.joinCourseWaitlist.run(request("u2", { courseId, sessionId: OTHER, paymentMode: "direct", requestId: "w-u2" }));
    await strand(courseId, SESSION);
    await strand(courseId, OTHER);
    const settings = await import("../payments/paymentSettingsCallables");
    const spy = vi.spyOn(settings, "readPaymentSettings");
    expect(await sweep()).toEqual({ examined: 2, promoted: 2, cleared: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
  it("ignores sessions of other collections", async () => {
    await db.doc("elsewhere/x/sessions/s").set({ state: "scheduled", waitlisted: 3, startsAt: soon() });
    const courseId = await fullCourse();
    await join("u1", courseId);
    expect(await sweep()).toEqual({ examined: 1, promoted: 0, cleared: 0 });
    expect((await db.doc("elsewhere/x/sessions/s").get()).data()).toMatchObject({ waitlisted: 3 });
  });
  it("continues after the lesson the previous run stopped at, and wraps around", async () => {
    const courseId = await course();
    await holdSeat(courseId, "h", SESSION);
    await holdSeat(courseId, "h", OTHER);
    for (const id of [SESSION, OTHER]) {
      await api.joinCourseWaitlist.run(request("u1", { courseId, sessionId: id, paymentMode: "direct", requestId: `w-u1-${id}` }));
    }
    // A full lesson with a waitlist first in line must not starve the stranded one behind it.
    await sessionRef(courseId, SESSION).update({ waitlisted: 1 });
    await strand(courseId, OTHER);
    const one = { pageSize: 1, maxPages: 1 };
    const first = await sweep(one);
    expect(first.promoted).toBe(0);
    expect((await db.doc("courseSweepState/waitlist").get()).data()?.cursor).toContain("/sessions/");
    const second = await sweep(one);
    expect(second).toEqual({ examined: 1, promoted: 1, cleared: 0 });
    expect(await enrollmentOf("u1", `w-u1-${OTHER}`)).toMatchObject({ state: "confirmed" });
    expect(await sessionOf(courseId, SESSION)).toMatchObject({ occupied: 1, waitlisted: 1 });
  });
  it("works through the existing indexes while the (state, waitlisted) index is missing", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await strand(courseId);
    expect(await sweep({ scan: "fallback" })).toEqual({ examined: 1, promoted: 1, cleared: 0 });
    await assertCounters(courseId);
  });
  it("falls back when Firestore reports the missing index (code 9)", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await strand(courseId);
    const original = admin.firestore.Query.prototype.orderBy;
    vi.spyOn(admin.firestore.Query.prototype, "orderBy").mockImplementation(function (this: admin.firestore.Query, field, dir) {
      if (field === "waitlisted") {
        return { limit: () => ({ get: async () => { throw Object.assign(new Error("index"), { code: 9 }); } }),
          startAfter: () => ({ limit: () => ({ get: async () => { throw Object.assign(new Error("index"), { code: 9 }); } }) }) } as never;
      }
      return original.call(this, field as never, dir);
    });
    expect(await sweep()).toEqual({ examined: 1, promoted: 1, cleared: 0 });
    vi.restoreAllMocks();
    await assertCounters(courseId);
  });
});

// -- Concurrency and counter integrity (D7) -------------------------------------------------------------------------
// Every race runs RACE_ITERATIONS times (default 3; the pre-release run uses 10) on a fresh course. Callables are wrapped
// in retryEmulatorAbort: the emulator words a contention abort differently from Firestore, which the SDK would have
// retried (see raceRetry.testutil.ts). Every racing call also runs under a 30 s per-attempt timeout that names the
// stalled step, so a hang fails fast instead of waiting for the test timeout below.
const ITERATIONS = Math.max(1, Number(process.env.RACE_ITERATIONS ?? 3));
const RACE_TIMEOUT = Math.max(180000, ITERATIONS * 60000);
const raceCtx = { iteration: 0 };
const where = () => `${expect.getState().currentTestName ?? "race"} [iteration ${raceCtx.iteration + 1}/${ITERATIONS}]`;
type Labelled = (() => Promise<unknown>) & { label?: string };
const labelled = <F extends () => Promise<unknown>>(label: string, run: F): F & { label: string } =>
  Object.assign(run, { label });
/** A direct await inside a race test (setup, a sequential call) under the same hard timeout. */
const step = <T>(label: string, promise: Promise<T>) => withTimeout(`${where()} :: ${label}`, promise);
const CUSTOMERS_ALL = ["u1", "u2", "u3", "u4", "u5", "u6"];
const rid = (kind: string, uid: string, courseId: string, id = SESSION) => `${kind}-${uid}-${courseId}-${id}`;
const attempt = (run: Labelled, label = run.label ?? "call") =>
  retryEmulatorAbort(run, 8, `${where()} :: ${label}`).then(() => "ok",
    (error: Error & { details?: unknown }) => error.message);
/** A call that must succeed: retried on emulator noise, fails naming the step on a hang or a refusal. */
const must = (run: Labelled, label = run.label ?? "call") => retryEmulatorAbort(run, 8, `${where()} :: ${label}`);

async function lessonQuote(uid: string, courseId: string, id: string) {
  const quote = await api.quoteCourse.run(request(uid, { courseId }));
  return quote.sessions.find((l) => l.sessionId === id)!;
}
const raceEnroll = (uid: string, courseId: string, id = SESSION, requestId = rid("e", uid, courseId, id)) =>
  labelled(`enroll ${uid} on ${id}`, async () => {
    const line = await lessonQuote(uid, courseId, id);
    return api.enrollInCourse.run(request(uid, { courseId, scope: "lesson", sessionId: id, requestId,
      expectedFinalCents: line.finalCents, expectedRevisions: { [id]: line.revision } }));
  });
const raceJoin = (uid: string, courseId: string, id = SESSION, requestId = rid("w", uid, courseId, id)) =>
  labelled(`join ${uid} on ${id}`, () =>
    api.joinCourseWaitlist.run(request(uid, { courseId, sessionId: id, paymentMode: "direct", requestId })));
const raceLeave = (uid: string, courseId: string, id = SESSION) =>
  labelled(`leave ${uid} on ${id}`, () => leave(uid, courseId, id));
const raceCancel = (actor: string, courseId: string, uid: string, id = SESSION, requestId = rid("e", uid, courseId, id)) =>
  labelled(`cancel ${uid}'s booking by ${actor}`, () => cancel(actor, enrollmentIdOf(uid, requestId)));

/** assertCounters plus: a waitlist can only exist for a lesson that is full (no promotion was lost). */
async function assertRace(courseId: string) {
  await assertCounters(courseId);
  for (const doc of (await db.collection(`courses/${courseId}/sessions`).get()).docs) {
    const s = doc.data();
    if ((s.waitlisted ?? 0) > 0 && s.state === "scheduled") {
      expect(s.occupied + s.held, `${doc.id} has a waitlist but a free seat`).toBeGreaterThanOrEqual(s.capacity);
    }
  }
}
const seatedOf = async (courseId: string, id = SESSION) =>
  (await sessionRef(courseId, id).collection("participants").get()).docs.map((d) => d.id).sort();
const waitingOf = async (courseId: string, id = SESSION) => (await waitlist(courseId, id)).map((e) => e.id);
// Each iteration starts from an empty database (request ids are per customer, so a course must not see the last one's).
const repeat = async (body: (iteration: number) => Promise<void>) => {
  for (let i = 0; i < ITERATIONS; i++) {
    raceCtx.iteration = i;
    if (i > 0) await step("reset between iterations", resetRace());
    await body(i);
  }
};
const only = (outcomes: string[], allowed: string[]) =>
  expect(outcomes.filter((o) => o !== "ok" && !allowed.includes(o)), `unexpected outcomes ${outcomes}`).toEqual([]);

describe("waitlist concurrency", () => {
  it("admits exactly one of several customers racing for the last seat; the others are told the lesson is full", async () => {
    await repeat(async () => {
      const courseId = await course();
      const names = ["u1", "u2", "u3"];
      const outcomes = await Promise.all(names.map((uid) => attempt(raceEnroll(uid, courseId))));
      expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
      expect(outcomes.filter((o) => o === "lesson_full")).toHaveLength(2);
      expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, held: 0, waitlisted: 0 });
      await assertRace(courseId);
    });
  }, RACE_TIMEOUT);

  it("tells the losers a waitlist is available, and gives concurrent joiners positions 1 and 2", async () => {
    await repeat(async () => {
      const courseId = await course();
      await step("hold the seat as h", holdSeat(courseId, "h"));
      const loser = await step("u1 enrolls in a full lesson", raceEnroll("u1", courseId)().catch((error) => error));
      expect(loser).toMatchObject({ message: "lesson_full", details: { waitlistAvailable: true } });
      await Promise.all([raceJoin("u1", courseId), raceJoin("u2", courseId)].map((run) => must(run)));
      expect((await waitlist(courseId)).map((e) => e.position)).toEqual([1, 2]);
      expect((await sessionOf(courseId)).waitlisted).toBe(2);
      await assertRace(courseId);
    });
  }, RACE_TIMEOUT);

  it("promotes the first waitlisted customer when the holder cancels, renumbers the second, and ignores a replay", async () => {
    await repeat(async () => {
      const courseId = await course();
      await step("hold the seat as h", holdSeat(courseId, "h"));
      await must(raceJoin("u1", courseId));
      await must(raceJoin("u2", courseId));
      const holderId = enrollmentIdOf("h", `hold-h-${SESSION}`);
      await step("h cancels", cancel("h", holderId));
      expect(await seatedOf(courseId)).toEqual(["u1"]);
      expect(await waitlistView(courseId)).toEqual([["u2", 1]]);
      await assertRace(courseId);
      // Replays, sequential and racing, change nothing.
      await Promise.all([1, 2, 3].map((n) => attempt(() => cancel("h", holderId), `replayed cancel by h #${n}`)));
      expect(await seatedOf(courseId)).toEqual(["u1"]);
      expect(await waitlistView(courseId)).toEqual([["u2", 1]]);
      expect(await notices("waitlist_promoted")).toContain("u1");
      await assertRace(courseId);
    });
  }, RACE_TIMEOUT);

  it("never loses a promotion or over-fills when cancel, enroll, join and leave race for one seat", async () => {
    let promotedRuns = 0;
    await repeat(async (iteration) => {
      const courseId = await course();
      await step("hold the seat as h", holdSeat(courseId, "h"));
      // Odd iterations start with an empty waitlist: a join that lands after the cancel must be refused, not stranded.
      if (iteration % 2 === 0) await must(raceJoin("u5", courseId));
      const outcomes = await Promise.all([
        attempt(() => cancel("h", enrollmentIdOf("h", `hold-h-${SESSION}`)), "h cancels the held seat"),
        attempt(raceEnroll("u1", courseId)),
        attempt(raceJoin("u2", courseId)),
        attempt(raceJoin("u3", courseId)),
        attempt(raceLeave("u5", courseId)),
        attempt(raceEnroll("u4", courseId)),
      ]);
      only(outcomes, ["lesson_full", "waitlist_not_open", "already_waitlisted"]);
      await assertRace(courseId);
      const seated = await seatedOf(courseId);
      expect(seated.length).toBeLessThanOrEqual(1);
      // A customer whose join or enrollment succeeded is seated or waiting; nobody falls between the two.
      for (const [index, uid] of [[2, "u2"], [3, "u3"]] as const) {
        if (outcomes[index] === "ok") expect([...seated, ...(await waitingOf(courseId))], uid).toContain(uid);
      }
      for (const [index, uid] of [[1, "u1"], [5, "u4"]] as const) {
        if (outcomes[index] === "ok") expect(seated, uid).toContain(uid);
      }
      if ((await sessionOf(courseId)).occupied === 1 && !seated.includes("h")) promotedRuns++;
    });
    expect(promotedRuns).toBeGreaterThan(0);
  }, RACE_TIMEOUT);

  it("fills every seat of a larger lesson exactly, then queues the rest in order", async () => {
    await repeat(async () => {
      const courseId = await course({ capacity: 2 });
      const outcomes = await Promise.all(CUSTOMERS_ALL.map((uid) => attempt(raceEnroll(uid, courseId))));
      expect(outcomes.filter((o) => o === "ok")).toHaveLength(2);
      expect(outcomes.filter((o) => o === "lesson_full")).toHaveLength(4);
      const seated = await seatedOf(courseId);
      const losers = CUSTOMERS_ALL.filter((uid) => !seated.includes(uid));
      await Promise.all(losers.map((uid) => must(raceJoin(uid, courseId))));
      expect((await waitlist(courseId)).map((e) => e.position)).toEqual([1, 2, 3, 4]);
      await assertRace(courseId);
      // Both seat holders leave at the same time: the first two in line take their seats.
      const [first, second] = seated;
      const order = await waitingOf(courseId);
      await Promise.all([first, second].map((uid) => attempt(raceCancel(uid, courseId, uid))));
      expect((await seatedOf(courseId)).sort()).toEqual(order.slice(0, 2).sort());
      expect(await waitingOf(courseId)).toEqual(order.slice(2));
      expect((await sessionOf(courseId)).occupied).toBe(2);
      await assertRace(courseId);
    });
  }, RACE_TIMEOUT);

  it("serves a seat freed by a capacity increase to the waitlist or a walk-in, never to both", async () => {
    await repeat(async () => {
      const courseId = await course();
      await step("hold the seat as h", holdSeat(courseId, "h"));
      await must(raceJoin("u1", courseId));
      await must(raceJoin("u2", courseId));
      await step("raise capacity", Promise.all([sessionRef(courseId).update({ capacity: 2 }),
        db.doc(`courses/${courseId}`).update({ nextAvailableSeats: 1 })]));
      const outcomes = await Promise.all([
        attempt(() => promoteStandalone(courseId), "promote #1"), attempt(() => promoteStandalone(courseId), "promote #2"),
        attempt(raceEnroll("u4", courseId)), attempt(raceEnroll("u3", courseId)),
      ]);
      only(outcomes, ["lesson_full"]);
      expect((await sessionOf(courseId)).occupied).toBe(2);
      expect(await seatedOf(courseId)).toHaveLength(2);
      await assertRace(courseId);
    });
  }, RACE_TIMEOUT);

  it("replays of enroll, join, leave and promote change nothing the second time", async () => {
    await repeat(async () => {
      const courseId = await course();
      const [a, b] = await Promise.all([attempt(raceEnroll("u1", courseId), "enroll u1 (same request) #1"),
        attempt(raceEnroll("u1", courseId), "enroll u1 (same request) #2")]);
      expect([a, b]).toEqual(["ok", "ok"]);
      expect(await seatedOf(courseId)).toEqual(["u1"]);
      expect(await sessionOf(courseId)).toMatchObject({ occupied: 1 });
      expect((await db.collection("courseEnrollments").where("courseId", "==", courseId).get()).size).toBe(1);
      const joins = await Promise.all([1, 2, 3].map((n) => attempt(raceJoin("u2", courseId), `replayed join #${n}`)));
      expect(joins).toEqual(["ok", "ok", "ok"]);
      expect(await waitlistView(courseId)).toEqual([["u2", 1]]);
      expect((await sessionOf(courseId)).waitlisted).toBe(1);
      await assertRace(courseId);
      const leaves = await Promise.all([1, 2, 3].map((n) => attempt(raceLeave("u2", courseId), `replayed leave #${n}`)));
      expect(leaves).toEqual(["ok", "ok", "ok"]);
      expect(await waitlist(courseId)).toEqual([]);
      expect(await step("promote with an empty list", promoteStandalone(courseId))).toBe(0);
      expect((await sessionOf(courseId)).waitlisted).toBe(0);
      await assertRace(courseId);
    });
  }, RACE_TIMEOUT);

  it("creates nothing when a series purchase meets a full lesson, even while others fill it", async () => {
    await repeat(async () => {
      const courseId = await course({ endDate: "2099-10-14", seriesPriceCents: 3000 });
      const days = ["2099-10-12", "2099-10-13", "2099-10-14"];
      await step("hold the middle lesson as h", holdSeat(courseId, "h", days[1]));
      const series = (uid: string) => async () => {
        const quote = await api.quoteCourse.run(request(uid, { courseId }));
        return api.enrollInCourse.run(request(uid, { courseId, scope: "series", requestId: rid("s", uid, courseId),
          expectedFinalCents: quote.series!.finalCents, expectedRevisions: quote.series!.revisions }));
      };
      expect(await attempt(series("u1"))).toBe("lesson_full");
      expect(await db.collection("courseEnrollments").where("userId", "==", "u1").get().then((s) => s.size)).toBe(0);
      for (const day of days) expect(await seatedOf(courseId, day)).toEqual(day === days[1] ? ["h"] : []);
      // Now the middle lesson is freed while two series buyers and a single-lesson buyer race for it.
      await step("h cancels the middle lesson", cancel("h", enrollmentIdOf("h", `hold-h-${days[1]}`)));
      const outcomes = await Promise.all([attempt(series("u1")), attempt(series("u2")),
        attempt(raceEnroll("u3", courseId, days[1]))]);
      only(outcomes, ["lesson_full"]);
      const enrollments = (await db.collection("courseEnrollments").where("courseId", "==", courseId).get()).docs
        .filter((d) => d.data().userId !== "h");
      // Capacity 1: whoever won the middle lesson holds it, and a series buyer holds all three or none.
      for (const uid of ["u1", "u2"]) {
        const held = (await Promise.all(days.map((day) => seatedOf(courseId, day)))).map((ids) => ids.includes(uid));
        expect(held.every(Boolean) || held.every((x) => !x), `${uid} holds ${held}`).toBe(true);
      }
      expect(enrollments.length).toBe(outcomes.filter((o) => o === "ok").length);
      await assertRace(courseId);
    });
  }, RACE_TIMEOUT);

  it("falls through a chain of expiring Stripe holds to the next entry", async () => {
    await stripeSwitch(true);
    try {
      const courseId = await course();
      await step("h holds the seat with Stripe", stripeHold(courseId));
      await step("u1 joins", join("u1", courseId, { paymentMode: "stripe" }));
      await step("u2 joins", join("u2", courseId, { paymentMode: "stripe" }));
      await step("u3 joins", join("u3", courseId));
      const expire = (id: string) => db.doc(`courseEnrollments/${id}`).update({ holdExpiresAt: past() });
      await expire(holderEnrollment());
      await Promise.all([1, 2].map((n) => must(maintain, `maintenance run #${n}`)));
      expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, held: 1, waitlisted: 2 });
      expect(await seatedOf(courseId)).toEqual(["u1"]);
      await assertRace(courseId);
      await expire(enrollmentIdOf("u1", "w-u1"));
      await step("maintenance run", maintain());
      expect(await seatedOf(courseId)).toEqual(["u2"]);
      expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, held: 1, waitlisted: 1 });
      await assertRace(courseId);
      await expire(enrollmentIdOf("u2", "w-u2"));
      await step("maintenance run", maintain());
      await step("maintenance run", maintain());
      expect(await seatedOf(courseId)).toEqual(["u3"]);
      expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, held: 0, waitlisted: 0 });
      expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "expired" });
      expect(await enrollmentOf("u2", "w-u2")).toMatchObject({ state: "expired" });
      expect(await notices("waitlist_promoted_hold")).toEqual(["u1", "u2"]);
      expect(await notices("waitlist_promoted")).toEqual(["u3"]);
      await assertRace(courseId);
    } finally {
      await stripeSwitch(false);
    }
  }, RACE_TIMEOUT);

  it("closes the list, and refuses a late booking, when the seat is freed inside the notice window", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await sessionRef(courseId).update({ startsAt: soon() });
    // The provider cancels: a customer may not cancel inside the cancellation window.
    await cancel("p", holderEnrollment());
    expect(await waitlist(courseId)).toEqual([]);
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2"]);
    // The notice window that closes the list closes booking as well: the seat stays free.
    expect(await attempt(raceEnroll("u3", courseId))).toBe("booking_deadline");
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 0, held: 0, waitlisted: 0 });
    await assertRace(courseId);
  });
});

// -- manageCourseSession (Group E) -----------------------------------------------------------------------------------
const manage = (uid: string, data: Record<string, unknown>) =>
  api.manageCourseSession.run(request(uid, { sessionId: SESSION, ...data }));

describe("manageCourseSession reschedule and the waitlist", () => {
  it("closes the lesson's waitlist with waitlist_cleared and tells the seated customer", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await manage("p", { courseId, action: "reschedule", reason: "Later", startsAt: "2099-10-12T17:00:00Z" });
    expect(await waitlist(courseId)).toEqual([]);
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 0, occupied: 1, revision: 2 });
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2"]);
    expect(await notices("rescheduled")).toEqual(["h"]);
    await assertCounters(courseId);
  });
});

describe("manageCourseSession cancel and reschedule move only the changed lesson's lock", () => {
  const DAYS = ["2099-10-12", "2099-10-13", "2099-10-14"];
  // Paths of the lock documents any transaction asks for while `body` runs.
  async function lockReads(body: () => Promise<unknown>): Promise<string[]> {
    const paths: string[] = [];
    const original = admin.firestore.Transaction.prototype.getAll;
    const spy = vi.spyOn(admin.firestore.Transaction.prototype, "getAll").mockImplementation(function (
      this: admin.firestore.Transaction, ...refs: unknown[]) {
      for (const ref of refs) {
        const path = (ref as { path?: string })?.path;
        if (typeof path === "string" && path.startsWith("courseScheduleLocks/")) paths.push(path);
      }
      return (original as (...a: unknown[]) => Promise<unknown>).apply(this, refs);
    } as never);
    try {
      await body();
    } finally {
      spy.mockRestore();
    }
    return paths;
  }
  // The first lesson is over (it still reads "scheduled", as before the next maintenance run) and its lock is gone.
  async function courseWithPastFirstLesson() {
    const courseId = await course({ endDate: DAYS[2], instructorId: "p" });
    await sessionRef(courseId, DAYS[0]).update({
      startsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 7200000),
      endsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3600000) });
    for (const doc of (await db.collection("courseScheduleLocks").where("day", "==", DAYS[0]).get()).docs) {
      await doc.ref.delete();
    }
    return courseId;
  }
  const locksOf = async (courseId: string) => (await db.collection("courseScheduleLocks").get()).docs
    .flatMap((d) => Object.keys(d.data().slots ?? {})).filter((id) => id.startsWith(`${courseId}_`)).sort();

  it("cancelling a lesson reads only its own lock days, not the lessons that already ended", async () => {
    const courseId = await courseWithPastFirstLesson();
    const reads = await lockReads(() => manage("p", { courseId, sessionId: DAYS[2], action: "cancel", reason: "Sick" }));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((path) => path.endsWith(`|${DAYS[2]}`)), reads.join()).toBe(true);
    expect(await locksOf(courseId)).toEqual([`${courseId}_${DAYS[1]}`]);
    expect(await sessionOf(courseId, DAYS[2])).toMatchObject({ state: "cancelled" });
    await assertCounters(courseId);
  });
  it("rescheduling reads only the old and new day of that lesson and moves its slot", async () => {
    const courseId = await courseWithPastFirstLesson();
    const reads = await lockReads(() => manage("p", { courseId, sessionId: DAYS[1], action: "reschedule",
      reason: "Later", startsAt: `${DAYS[1]}T17:00:00Z` }));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((path) => path.endsWith(`|${DAYS[1]}`)), reads.join()).toBe(true);
    expect(await locksOf(courseId)).toEqual([`${courseId}_${DAYS[1]}`, `${courseId}_${DAYS[2]}`]);
    const moved = (await db.collection("courseScheduleLocks").get()).docs
      .map((d) => d.data().slots?.[`${courseId}_${DAYS[1]}`]).find(Boolean);
    expect(moved.start).toBe(new Date(`${DAYS[1]}T17:00:00Z`).getTime());
    await assertCounters(courseId);
  });
  it("cancelling the last lesson archives the course and gives every slot back", async () => {
    const courseId = await course({ endDate: DAYS[1], instructorId: "p" });
    await manage("p", { courseId, sessionId: DAYS[0], action: "cancel", reason: "Sick" });
    expect(await locksOf(courseId)).toEqual([`${courseId}_${DAYS[1]}`]);
    const reads = await lockReads(() => manage("p", { courseId, sessionId: DAYS[1], action: "cancel", reason: "Sick" }));
    expect(reads.length).toBeGreaterThan(0);
    expect(await locksOf(courseId)).toEqual([]);
    expect(await db.doc(`courses/${courseId}`).get().then((d) => d.data())).toMatchObject({ state: "archived" });
    await assertCounters(courseId);
  });
  it("a repeated cancel changes nothing", async () => {
    const courseId = await course({ endDate: DAYS[1], instructorId: "p" });
    await manage("p", { courseId, sessionId: DAYS[1], action: "cancel", reason: "Sick" });
    const reads = await lockReads(() => manage("p", { courseId, sessionId: DAYS[1], action: "cancel", reason: "Sick" }));
    expect(reads).toEqual([]);
    expect(await locksOf(courseId)).toEqual([`${courseId}_${DAYS[0]}`]);
    await assertCounters(courseId);
  });
});

describe("sessions of a cancelled or archived course leave the public listing", () => {
  const DAYS = ["2099-10-12", "2099-10-13", "2099-10-14"];
  const listedOf = async (courseId: string) => Object.fromEntries(
    (await db.collection(`courses/${courseId}/sessions`).orderBy("startsAt").get()).docs
      .map((d) => [d.id, d.data().listed]));
  const past = (courseId: string, id: string) => sessionRef(courseId, id).update({
    startsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 7200000),
    endsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3600000) });

  it("a cancelled lesson is unlisted; the others stay listed", async () => {
    const courseId = await course({ endDate: DAYS[2] });
    expect(await listedOf(courseId)).toEqual({ [DAYS[0]]: true, [DAYS[1]]: true, [DAYS[2]]: true });
    await manage("p", { courseId, sessionId: DAYS[1], action: "cancel", reason: "Sick" });
    expect(await listedOf(courseId)).toEqual({ [DAYS[0]]: true, [DAYS[1]]: false, [DAYS[2]]: true });
    expect(await sessionOf(courseId, DAYS[1])).toMatchObject({ state: "cancelled" });
  });
  it("cancelling the last lesson archives the course and unlists everything that is left", async () => {
    const courseId = await course({ endDate: DAYS[1] });
    await past(courseId, DAYS[0]);
    await manage("p", { courseId, sessionId: DAYS[1], action: "cancel", reason: "Sick" });
    expect(await db.doc(`courses/${courseId}`).get().then((d) => d.data())).toMatchObject({ state: "archived" });
    expect(await listedOf(courseId)).toEqual({ [DAYS[0]]: false, [DAYS[1]]: false });
  });
  it("cancelRemainingCourse unlists the cancelled lessons and the one already under way", async () => {
    const courseId = await course({ endDate: DAYS[2] });
    await past(courseId, DAYS[0]);
    await api.cancelRemainingCourse.run(request("p", { courseId, reason: "Closing" }));
    expect(await db.doc(`courses/${courseId}`).get().then((d) => d.data())).toMatchObject({ state: "archived" });
    expect(await listedOf(courseId)).toEqual({ [DAYS[0]]: false, [DAYS[1]]: false, [DAYS[2]]: false });
    expect((await sessionOf(courseId, DAYS[0])).state).toBe("scheduled");
    expect((await sessionOf(courseId, DAYS[1])).state).toBe("cancelled");
    await assertCounters(courseId);
  });
  it("the maintenance run that archives a finished course unlists its lessons", async () => {
    const courseId = await course({ endDate: DAYS[1] });
    for (const id of [DAYS[0], DAYS[1]]) await past(courseId, id);
    await db.doc(`courses/${courseId}`).update({ nextStartsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3600000) });
    await maintain();
    expect(await db.doc(`courses/${courseId}`).get().then((d) => d.data())).toMatchObject({
      state: "archived", enrollmentClosed: true });
    expect(await listedOf(courseId)).toEqual({ [DAYS[0]]: false, [DAYS[1]]: false });
  });
  it("a course that is not archived keeps its lessons listed after the maintenance run", async () => {
    const courseId = await course({ endDate: DAYS[1] });
    await past(courseId, DAYS[0]);
    await db.doc(`courses/${courseId}`).update({ nextStartsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3600000) });
    await maintain();
    expect(await db.doc(`courses/${courseId}`).get().then((d) => d.data())).toMatchObject({ state: "published" });
    expect(await listedOf(courseId)).toEqual({ [DAYS[0]]: true, [DAYS[1]]: true });
  });
});

describe("manageCourseSession removeParticipant, removeWaitlistEntry and no-shows", () => {
  const remove = (uid: string, courseId: string, userId: unknown, extra: Record<string, unknown> = {}) =>
    manage(uid, { courseId, action: "removeParticipant", userId, ...extra });
  const customerOf = async (courseId: string, uid = "h") =>
    (await db.doc(`courses/${courseId}/customers/${uid}`).get()).data();
  // 5 hours out: past the customer's 24 h cancellation deadline, still outside the 2 h booking notice.
  const withinDeadline = (courseId: string, id = SESSION) => sessionRef(courseId, id).update({
    startsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 3600000),
    endsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 6 * 3600000) });
  const started = (courseId: string, id = SESSION) => sessionRef(courseId, id).update({
    startsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 7200000),
    endsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3600000) });

  it("frees the seat, promotes the first waitlisted customer and tells the removed one; no late marks before the deadline", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await remove("p", courseId, "h", { reason: "Injured" });
    expect(await enrollmentOf("h", `hold-h-${SESSION}`)).toMatchObject({ state: "cancelled", cancellationReason: "Injured" });
    expect((await enrollmentOf("h", `hold-h-${SESSION}`))?.lateCancelledSessionIds).toBeUndefined();
    expect((await customerOf(courseId))?.lateCancels).toBeUndefined();
    expect(await enrollmentOf("u1", "w-u1")).toMatchObject({ state: "confirmed", promotedFromWaitlist: true });
    expect(await waitlistView(courseId)).toEqual([["u2", 1]]);
    expect(await notices("cancelled_by_trainer")).toEqual(["h"]);
    expect(await notices("waitlist_promoted")).toEqual(["u1"]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1, waitlisted: 1 });
    // The lesson itself is untouched.
    expect(await sessionOf(courseId)).toMatchObject({ state: "scheduled" });
    await assertCounters(courseId);
  });
  it("records a late removal on the enrollment and the customer's counter, once, and charges nothing", async () => {
    const courseId = await fullCourse();
    await withinDeadline(courseId);
    await remove("p", courseId, "h");
    expect(await enrollmentOf("h", `hold-h-${SESSION}`)).toMatchObject(
      { state: "cancelled", lateCancelledSessionIds: [SESSION], refundCents: 0 });
    expect(await customerOf(courseId)).toMatchObject({ userId: "h", lateCancels: 1 });
    expect(await db.collection("courseRefunds").get().then((r) => r.size)).toBe(0);
    // A replay finds no participant and changes nothing.
    await expect(remove("p", courseId, "h")).rejects.toMatchObject({ code: "not-found", message: "participant_not_found" });
    expect(await customerOf(courseId)).toMatchObject({ lateCancels: 1 });
    await assertCounters(courseId);
  });
  it("counts a late removal per customer across lessons, and only removes the chosen lesson of a series", async () => {
    const courseId = await course({ capacity: 3 });
    const quote = await api.quoteCourse.run(request("u1", { courseId }));
    await api.enrollInCourse.run(request("u1", { courseId, scope: "series", requestId: "series-u1",
      expectedFinalCents: quote.series!.finalCents,
      expectedRevisions: Object.fromEntries(quote.sessions.map((l) => [l.sessionId, l.revision])) }));
    await withinDeadline(courseId);
    await remove("p", courseId, "u1");
    const enrollment = await enrollmentOf("u1", "series-u1");
    expect(enrollment).toMatchObject({ state: "confirmed", activeSessionIds: [OTHER], cancelledSessionIds: [SESSION],
      lateCancelledSessionIds: [SESSION] });
    expect(await customerOf(courseId, "u1")).toMatchObject({ lateCancels: 1 });
    expect(await sessionOf(courseId, OTHER)).toMatchObject({ occupied: 1 });
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 0 });
    await assertCounters(courseId);
  });
  it("refuses a past lesson, an unknown customer, and a dropped customer id without touching the lesson", async () => {
    const courseId = await fullCourse();
    await expect(remove("p", courseId, "u1")).rejects.toMatchObject({ message: "participant_not_found" });
    await expect(remove("p", courseId, undefined)).rejects.toMatchObject({ message: "invalid_id" });
    expect(await sessionOf(courseId)).toMatchObject({ state: "scheduled", occupied: 1 });
    await started(courseId);
    await expect(remove("p", courseId, "h")).rejects.toThrow("cannot_cancel_past_lesson");
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1 });
  });
  it("marks absent as a no-show once, and clears it when the mark changes", async () => {
    const courseId = await fullCourse();
    await started(courseId);
    const mark = (attendance: string) => manage("p", { courseId, action: "attendance", userId: "h", attendance });
    const participant = async () => (await sessionRef(courseId).collection("participants").doc("h").get()).data();
    await mark("absent");
    expect(await participant()).toMatchObject({ attendance: "absent", noShow: true });
    expect(await customerOf(courseId)).toMatchObject({ noShows: 1 });
    await mark("absent");
    expect(await customerOf(courseId)).toMatchObject({ noShows: 1 });
    await mark("present");
    expect(await participant()).toMatchObject({ attendance: "present", noShow: false });
    expect(await customerOf(courseId)).toMatchObject({ noShows: 0 });
    await mark("present");
    await mark("unmarked");
    expect(await customerOf(courseId)).toMatchObject({ noShows: 0 });
    await mark("absent");
    expect(await customerOf(courseId)).toMatchObject({ noShows: 1 });
  });
  it("adds the no-show counter to the customer record the enrollment created", async () => {
    const courseId = await fullCourse();
    expect(await customerOf(courseId)).toMatchObject({ userId: "h" });
    await started(courseId);
    await manage("p", { courseId, action: "attendance", userId: "h", attendance: "absent" });
    expect(await customerOf(courseId)).toMatchObject({ userId: "h", noShows: 1 });
    expect((await customerOf(courseId))?.createdAt).toBeDefined();
  });
  it("removes another customer's waitlist entry, renumbers the rest and keeps the counter", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3"]) await join(uid, courseId);
    await manage("p", { courseId, action: "removeWaitlistEntry", userId: "u2" });
    expect(await waitlistView(courseId)).toEqual([["u1", 1], ["u3", 2]]);
    expect((await sessionOf(courseId)).waitlisted).toBe(2);
    // The removed customer is told it was the staff; nobody else is.
    expect(await notices("waitlist_removed")).toEqual(["u2"]);
    expect(await reasonsOf("waitlist_removed")).toEqual({ u2: "staff" });
    await manage("p", { courseId, action: "removeWaitlistEntry", userId: "u2" });
    expect(await waitlistView(courseId)).toEqual([["u1", 1], ["u3", 2]]);
    expect(await notices("waitlist_removed")).toEqual(["u2"]);
    await expect(manage("p", { courseId, action: "removeWaitlistEntry" })).rejects.toMatchObject({ message: "invalid_id" });
    await assertCounters(courseId);
  });
  it("denies a stranger all three", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await expect(remove("u6", courseId, "h")).rejects.toMatchObject({ message: "course_owner_required" });
    await expect(manage("u6", { courseId, action: "removeWaitlistEntry", userId: "u1" }))
      .rejects.toMatchObject({ message: "course_owner_required" });
    await started(courseId);
    await expect(manage("u6", { courseId, action: "attendance", userId: "h", attendance: "absent" }))
      .rejects.toMatchObject({ message: "course_owner_required" });
    expect(await waitlistView(courseId)).toEqual([["u1", 1]]);
    expect(await sessionOf(courseId)).toMatchObject({ occupied: 1 });
  });
});

describe("manageCourseSession capacity and saveCourse capacity increases", () => {
  const setCapacity = (uid: string, courseId: string, capacity: unknown, id = SESSION) =>
    manage(uid, { courseId, sessionId: id, action: "capacity", capacity });
  const save = (courseId: string, extra: Record<string, unknown>) =>
    api.saveCourse.run(request("p", { courseId, course: { ...input, ...extra } }));
  const seated = async (courseId: string, id = SESSION) =>
    (await sessionRef(courseId, id).collection("participants").get()).docs.map((d) => d.id).sort();

  it("promotes as many waiting customers as the new seats allow, bumps the revision and keeps the counters", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2", "u3"]) await join(uid, courseId);
    await setCapacity("p", courseId, 3);
    expect(await sessionOf(courseId)).toMatchObject({ capacity: 3, occupied: 3, held: 0, waitlisted: 1, revision: 2 });
    expect(await seated(courseId)).toEqual(["h", "u1", "u2"]);
    expect(await waitlistView(courseId)).toEqual([["u3", 1]]);
    expect((await db.doc(`courses/${courseId}`).get()).data()?.nextAvailableSeats).toBe(0);
    expect(await notices("waitlist_promoted")).toEqual(["u1", "u2"]);
    await assertCounters(courseId);
  });
  it("keeps the course's seat counter in step for the next lesson only, and lowers it again", async () => {
    const courseId = await course({ capacity: 4 });
    await setCapacity("p", courseId, 6, OTHER);
    expect((await db.doc(`courses/${courseId}`).get()).data()?.nextAvailableSeats).toBe(4);
    await setCapacity("p", courseId, 2);
    expect((await db.doc(`courses/${courseId}`).get()).data()?.nextAvailableSeats).toBe(2);
    expect(await sessionOf(courseId)).toMatchObject({ capacity: 2, revision: 2 });
    expect(await sessionOf(courseId, OTHER)).toMatchObject({ capacity: 6, revision: 2 });
    await assertCounters(courseId);
  });
  it("refuses a capacity below the bookings, an invalid one, and does nothing for the same number", async () => {
    const courseId = await course({ capacity: 3 });
    await holdSeat(courseId, "h");
    await holdSeat(courseId, "u1");
    await refusal(setCapacity("p", courseId, 1), "capacity_below_bookings");
    for (const bad of [0, 501, 1.5, "3", null, undefined]) await refusal(setCapacity("p", courseId, bad), "invalid_capacity");
    await setCapacity("p", courseId, 3);
    expect(await sessionOf(courseId)).toMatchObject({ capacity: 3, revision: 1, occupied: 2 });
    await setCapacity("p", courseId, 2);
    expect(await sessionOf(courseId)).toMatchObject({ capacity: 2, revision: 2 });
    await assertCounters(courseId);
  });
  it("refuses a cancelled or started lesson and a stranger", async () => {
    const courseId = await course({ capacity: 3 });
    await refusal(setCapacity("u6", courseId, 5), "course_owner_required");
    await sessionRef(courseId, OTHER).update({ state: "cancelled" });
    await refusal(setCapacity("p", courseId, 5, OTHER), "session_unavailable");
    await sessionRef(courseId).update({ startsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3600000),
      endsAt: admin.firestore.Timestamp.fromMillis(Date.now() - 60000) });
    await refusal(setCapacity("p", courseId, 5), "cannot_change_past_lesson");
    expect(await sessionOf(courseId)).toMatchObject({ capacity: 3 });
  });
  it("saves the capacity even when the promotion that follows fails", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    const waitlistModule = await import("./waitlist");
    const spy = vi.spyOn(waitlistModule, "promoteWaitlist").mockRejectedValue(new Error("boom"));
    await expect(setCapacity("p", courseId, 2)).resolves.toEqual({ success: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await sessionOf(courseId)).toMatchObject({ capacity: 2, occupied: 1, waitlisted: 1 });
    spy.mockRestore();
    // The sweep is the backstop.
    expect(await sweep()).toMatchObject({ promoted: 1 });
    await assertCounters(courseId);
  });

  it("saveCourse 1 -> 3 promotes on every waitlisted lesson, only after the course is committed", async () => {
    const courseId = await fullCourse();
    await holdSeat(courseId, "h", OTHER);
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await join("u3", courseId, { sessionId: OTHER });
    const waitlistModule = await import("./waitlist");
    const real = waitlistModule.promoteWaitlist;
    const seenCapacity: [string, number][] = [];
    const spy = vi.spyOn(waitlistModule, "promoteWaitlist").mockImplementation(async (c, s) => {
      seenCapacity.push([s, (await sessionOf(c, s)).capacity]);
      return real(c, s);
    });
    await save(courseId, { capacity: 3 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(seenCapacity.sort()).toEqual([[SESSION, 3], [OTHER, 3]].sort());
    expect(await sessionOf(courseId)).toMatchObject({ capacity: 3, occupied: 3, waitlisted: 0, revision: 2 });
    expect(await sessionOf(courseId, OTHER)).toMatchObject({ capacity: 3, occupied: 2, waitlisted: 0, revision: 2 });
    expect(await seated(courseId)).toEqual(["h", "u1", "u2"]);
    expect(await seated(courseId, OTHER)).toEqual(["h", "u3"]);
    await assertCounters(courseId);
  });
  it("saveCourse does not look at lessons without a waitlist, or when the capacity does not grow", async () => {
    const courseId = await fullCourse();
    const waitlistModule = await import("./waitlist");
    const spy = vi.spyOn(waitlistModule, "promoteWaitlist");
    await save(courseId, { capacity: 3 });
    await join("u1", courseId).catch(() => undefined);
    await save(courseId, { capacity: 3, name: "Karate 2" });
    await save(courseId, { capacity: 3, name: "Karate 3", description: "x" });
    expect(spy).not.toHaveBeenCalled();
  });
  it("saveCourse swallows a failed promotion and returns the course id", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    const waitlistModule = await import("./waitlist");
    const spy = vi.spyOn(waitlistModule, "promoteWaitlist").mockRejectedValue(new Error("boom"));
    await expect(save(courseId, { capacity: 2 })).resolves.toEqual({ courseId });
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await sessionOf(courseId)).capacity).toBe(2);
    spy.mockRestore();
    expect(await promoteStandalone(courseId)).toBe(1);
    await assertCounters(courseId);
  });
  it("saveCourse leaves a lesson-level capacity alone when the course capacity is unchanged (R12)", async () => {
    const courseId = await fullCourse();
    await setCapacity("p", courseId, 4);
    await save(courseId, { name: "Karate 2" });
    expect(await sessionOf(courseId)).toMatchObject({ capacity: 4, revision: 2 });
  });
});

describe("cancellation and archiving close the waitlists", () => {
  it("cancelling a lesson clears its waitlist and promotes nobody", async () => {
    const courseId = await fullCourse();
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await manage("p", { courseId, action: "cancel", reason: "Closed" });
    expect(await waitlist(courseId)).toEqual([]);
    expect(await sessionOf(courseId)).toMatchObject({ state: "cancelled", waitlisted: 0, occupied: 0 });
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2"]);
    expect(await notices("waitlist_promoted")).toEqual([]);
    expect(await notices("cancelled_by_trainer")).toEqual(["h"]);
    expect(await enrollmentOf("u1", "w-u1")).toBeUndefined();
    await assertCounters(courseId);
  });
  it("cancelling a lesson leaves the waitlist of the other lessons alone", async () => {
    const courseId = await fullCourse();
    await holdSeat(courseId, "h", OTHER);
    await join("u1", courseId);
    await join("u2", courseId, { sessionId: OTHER });
    await manage("p", { courseId, action: "cancel", reason: "Closed" });
    expect(await waitlistView(courseId, OTHER)).toEqual([["u2", 1]]);
    expect(await sessionOf(courseId, OTHER)).toMatchObject({ waitlisted: 1 });
    expect(await notices("waitlist_cleared")).toEqual(["u1"]);
    await assertCounters(courseId);
  });
  it("cancelRemainingCourse clears every waitlist of the course", async () => {
    const courseId = await fullCourse();
    await holdSeat(courseId, "h", OTHER);
    await join("u1", courseId);
    await join("u2", courseId, { sessionId: OTHER });
    await join("u3", courseId, { sessionId: OTHER });
    await api.cancelRemainingCourse.run(request("p", { courseId, reason: "Closed" }));
    expect(await waitlist(courseId)).toEqual([]);
    expect(await waitlist(courseId, OTHER)).toEqual([]);
    expect(await sessionOf(courseId)).toMatchObject({ state: "cancelled", waitlisted: 0, occupied: 0 });
    expect(await sessionOf(courseId, OTHER)).toMatchObject({ state: "cancelled", waitlisted: 0, occupied: 0 });
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2", "u3"]);
    expect(await notices("waitlist_promoted")).toEqual([]);
    await assertCounters(courseId);
  });
  it.each(["draft", "archived"])("moving the course to %s clears every waitlist", async (state) => {
    const courseId = await fullCourse();
    await holdSeat(courseId, "h", OTHER);
    for (const uid of ["u1", "u2"]) await join(uid, courseId);
    await join("u3", courseId, { sessionId: OTHER });
    await api.saveCourse.run(request("p", { courseId, course: { ...input, state } }));
    expect(await waitlist(courseId)).toEqual([]);
    expect(await waitlist(courseId, OTHER)).toEqual([]);
    expect(await sessionOf(courseId)).toMatchObject({ waitlisted: 0, occupied: 1, listed: false });
    expect(await sessionOf(courseId, OTHER)).toMatchObject({ waitlisted: 0, occupied: 1 });
    expect(await notices("waitlist_cleared")).toEqual(["u1", "u2", "u3"]);
    await assertCounters(courseId);
  });
  it("an edit that keeps the course published keeps its waitlists", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await api.saveCourse.run(request("p", { courseId, course: { ...input, name: "Karate 2" } }));
    expect(await waitlistView(courseId)).toEqual([["u1", 1]]);
    expect(await notices("waitlist_cleared")).toEqual([]);
    await assertCounters(courseId);
  });
  it("a customer who was cleared can join again once the course is published again", async () => {
    const courseId = await fullCourse();
    await join("u1", courseId);
    await api.saveCourse.run(request("p", { courseId, course: { ...input, state: "draft" } }));
    await api.saveCourse.run(request("p", { courseId, course: { ...input, state: "published" } }));
    expect(await join("u1", courseId)).toMatchObject({ success: true, position: 1 });
    await assertCounters(courseId);
  });
});

afterAll(() => {
  // Reported with the run so a flaky emulator abort rate is visible next to the pass count.
  console.info(`emulator aborts retried: ${emulatorAborts()}`);
});

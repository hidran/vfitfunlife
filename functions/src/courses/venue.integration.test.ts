import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as admin from "firebase-admin";
import type { CallableRequest } from "firebase-functions/v2/https";
import { assertLockInvariant } from "./lockInvariant.testutil";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
vi.mock("../lib/stripeClient", () => ({ getStripe: async () => ({}) }));
const auth = vi.hoisted(() => ({ generatePasswordResetLink: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => auth }));
vi.mock("../lib/email", () => ({ EMAIL_SECRETS: [], sendEmail: vi.fn() }));
let api: typeof import("./index");
let operations: typeof import("./operations");
let checkout: typeof import("./checkout");
let authority: typeof import("./authority");
let db: admin.firestore.Firestore;
const request = (uid: string, data: unknown) => ({ auth: { uid, token: {} }, data }) as CallableRequest;
const input = { name: "Karate", categoryId: "karate", location: "Torino", instructor: "Anna", capacity: 5,
  durationMinutes: 60, startDate: "2099-10-12", startTime: "18:00", timezone: "Europe/Rome",
  recurrence: "daily", endDate: "2099-10-13", lessonPriceCents: 1500, seriesPriceCents: 2500, state: "published" };
const SESSION = "2099-10-12";
const COLLECTIONS = ["courses", "courseEnrollments", "courseRefunds", "courseNotifications", "clients",
  "users", "instructors", "serviceCategories", "venues", "venueStaff", "rateLimits", "courseScheduleLocks"];

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-venue-courses" });
  db = admin.firestore();
  api = await import("./index");
  operations = await import("./operations");
  checkout = await import("./checkout");
  authority = await import("./authority");
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name));
  await db.doc("instructors/p").set({ fullName: "Anna", isActive: true, applicationStatus: "approved",
    providerProfile: { isVerified: true } });
  await db.doc("serviceCategories/karate").set({ isActive: true, parentId: "combat" });
  const users: Record<string, string> = { p: "provider", biz: "provider", s: "customer", si: "customer",
    os: "customer", x: "customer", a: "admin", u1: "customer", u2: "customer", u3: "customer",
    u4: "customer", u5: "customer" };
  for (const [uid, role] of Object.entries(users)) {
    await db.doc(`users/${uid}`).set({ fullName: uid, role, isActive: true });
  }
  await db.doc("instructors/biz").set({ fullName: "Biz", isActive: true, applicationStatus: "approved",
    providerProfile: { isVerified: true } });
  await db.doc("venues/v").set({ ownerId: "biz", type: "gym", partnerStatus: "active", isActive: true });
  await db.doc("venues/v/locations/l1").set({ name: "Sede", city: "Torino", timezone: "Europe/Rome", isActive: true });
  await db.doc("venues/v/locations/l1/rooms/r1").set({ name: "Sala 1", isActive: true });
  await db.doc("venueStaff/s").set({ venueId: "v", isActive: true });
  await db.doc("venueStaff/si").set({ venueId: "v", isActive: false });
  await db.doc("venueStaff/os").set({ venueId: "w", isActive: true });
});

// The course is written by saveCourse as the provider, then linked to the venue directly (saveCourse learns venues in B1).
async function venueCourse() {
  const { courseId } = await api.saveCourse.run(request("p", { course: input }));
  await db.doc(`courses/${courseId}`).update({ venueId: "v" });
  return courseId as string;
}
// A customer confirms the quote they reviewed: its final price and the revisions it showed.
async function quoted(courseId: string, scope = "lesson", sessionId = SESSION) {
  const quote = await api.quoteCourse.run(request("u1", { courseId }));
  const lines = scope === "series" ? quote.sessions : quote.sessions.filter((l) => l.sessionId === sessionId);
  return { expectedFinalCents: scope === "series" ? quote.series!.finalCents : lines[0].finalCents,
    expectedRevisions: Object.fromEntries(lines.map((l) => [l.sessionId, l.revision])) };
}
async function book(courseId: string, uid = "u1", scope = "lesson") {
  return (await api.enrollInCourse.run(request(uid, { courseId, scope, sessionId: SESSION, requestId: `r-${uid}`,
    ...await quoted(courseId, scope) }))).enrollmentId as string;
}
async function directRefund(courseId: string, withCourseId: boolean) {
  const enrollmentId = await book(courseId);
  await db.doc("courseRefunds/ref").set({ enrollmentId, providerId: "p", userId: "u1", sessionId: SESSION,
    amountCents: 1500, paymentMode: "direct", status: "pending", ...(withCourseId ? { courseId } : {}) });
  return "ref";
}

type Operation = [string, (uid: string, courseId: string) => Promise<unknown>];
const operationsUnderTest: Operation[] = [
  ["manageCourseSession cancel", (uid, courseId) => api.manageCourseSession.run(request(uid,
    { courseId, sessionId: SESSION, action: "cancel", reason: "closed" }))],
  ["cancelCourseEnrollment", async (uid, courseId) => api.cancelCourseEnrollment.run(request(uid,
    { enrollmentId: await book(courseId) }))],
  ["recordCoursePayment", async (uid, courseId) => api.recordCoursePayment.run(request(uid,
    { enrollmentId: await book(courseId), method: "cash" }))],
  ["confirmCourseRefund", async (uid, courseId) => api.confirmCourseRefund.run(request(uid,
    { refundId: await directRefund(courseId, true) }))],
  ["cancelRemainingCourse", (uid, courseId) => api.cancelRemainingCourse.run(request(uid,
    { courseId, reason: "closed" }))],
];

describe.each(operationsUnderTest)("venue authority: %s", (_name, run) => {
  it.each([["p", "the provider who owns the course"], ["biz", "the venue owner"],
    ["s", "active venue staff"], ["a", "an admin"]])("allows %s (%s)", async (uid) => {
    await expect(run(uid, await venueCourse())).resolves.toBeDefined();
  });
  it.each([["si", "inactive staff"], ["os", "staff of another venue"], ["x", "a stranger"]])(
    "refuses %s (%s)", async (uid) => {
      await expect(run(uid, await venueCourse())).rejects.toMatchObject(
        { code: "permission-denied", message: "course_owner_required" });
    });
});

describe("venue staff effects", () => {
  it("cancels a customer's enrollment as staff and frees the seat", async () => {
    const courseId = await venueCourse();
    const enrollmentId = await book(courseId);
    await api.cancelCourseEnrollment.run(request("s", { enrollmentId }));
    expect((await db.doc(`courseEnrollments/${enrollmentId}`).get()).data()?.state).toBe("cancelled");
    expect((await db.doc(`courses/${courseId}/sessions/${SESSION}`).get()).data()?.occupied).toBe(0);
  });
  it("records a direct payment as staff", async () => {
    const courseId = await venueCourse();
    const enrollmentId = await book(courseId);
    await api.recordCoursePayment.run(request("s", { enrollmentId, method: "cash" }));
    expect((await db.doc(`courseEnrollments/${enrollmentId}`).get()).data())
      .toMatchObject({ paymentStatus: "paid", paidBy: "s" });
  });
  it("confirms a refund that carries a courseId", async () => {
    const refundId = await directRefund(await venueCourse(), true);
    await api.confirmCourseRefund.run(request("s", { refundId }));
    expect((await db.doc(`courseRefunds/${refundId}`).get()).data()).toMatchObject({ status: "completed", confirmedBy: "s" });
  });
  it("resolves a refund without courseId through its enrollment (R14)", async () => {
    const courseId = await venueCourse();
    const refundId = await directRefund(courseId, false);
    await expect(api.confirmCourseRefund.run(request("x", { refundId }))).rejects.toThrow("course_owner_required");
    await api.confirmCourseRefund.run(request("s", { refundId }));
    expect((await db.doc(`courseRefunds/${refundId}`).get()).data()?.status).toBe("completed");
  });
  it("cancels the remaining lessons of the course as staff and releases every participant", async () => {
    const courseId = await venueCourse();
    const enrollmentId = await book(courseId, "u1", "series");
    await api.cancelRemainingCourse.run(request("s", { courseId, reason: "closed" }));
    expect((await db.doc(`courses/${courseId}`).get()).data()?.state).toBe("archived");
    expect((await db.doc(`courseEnrollments/${enrollmentId}`).get()).data()?.state).toBe("cancelled");
  });
});

describe("authority is resolved once per callable", () => {
  it("manageCourseSession cancel checks authority once for five participants", async () => {
    const courseId = await venueCourse();
    for (const uid of ["u1", "u2", "u3", "u4", "u5"]) await book(courseId, uid);
    const spy = vi.spyOn(authority, "canManageCourse");
    await api.manageCourseSession.run(request("s",
      { courseId, sessionId: SESSION, action: "cancel", reason: "closed" }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await db.doc(`courses/${courseId}/sessions/${SESSION}`).get()).data())
      .toMatchObject({ state: "cancelled", occupied: 0, cancellationReconciled: true });
  });
  it("cancelRemainingCourse checks authority once", async () => {
    const courseId = await venueCourse();
    for (const uid of ["u1", "u2"]) await book(courseId, uid, "series");
    const spy = vi.spyOn(authority, "canManageCourse");
    await api.cancelRemainingCourse.run(request("s", { courseId, reason: "closed" }));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("releaseActorFor", () => {
  it("returns the customer for the enrollment's own user without loading the course", async () => {
    expect(await operations.releaseActorFor("u1", { userId: "u1", courseId: "missing" }))
      .toEqual({ kind: "customer", uid: "u1" });
  });
  it("returns a manager for venue staff and rejects everyone else", async () => {
    const courseId = await venueCourse();
    const enrollment = { userId: "u1", courseId };
    expect(await operations.releaseActorFor("s", enrollment))
      .toEqual({ kind: "manager", authority: { uid: "s", via: "venue" } });
    await expect(operations.releaseActorFor("x", enrollment)).rejects.toThrow("course_owner_required");
  });
});

describe("participant callables by course authority", () => {
  const link = () => db.doc("clients/p_u1").set({ providerId: "p", userId: "u1", phone: "+393331234567" });
  const enrollData = (courseId: string) => ({ courseId, userId: "u1", scope: "lesson", sessionId: SESSION, requestId: "staff-add" });
  it("lets venue staff enroll a client linked to the course provider", async () => {
    const courseId = await venueCourse();
    await link();
    const booking = await api.enrollCourseParticipant.run(request("s", enrollData(courseId)));
    expect((await db.doc(`courseEnrollments/${booking.enrollmentId}`).get()).data())
      .toMatchObject({ userId: "u1", providerId: "p", createdBy: "s", paymentMode: "direct", state: "confirmed" });
    expect((await api.enrollCourseParticipant.run(request("s", enrollData(courseId)))).enrollmentId)
      .toBe(booking.enrollmentId);
  });
  it("requires the clients pair with the course provider, not with the staff member", async () => {
    const courseId = await venueCourse();
    await db.doc("clients/s_u1").set({ providerId: "s", userId: "u1" });
    await expect(api.enrollCourseParticipant.run(request("s", enrollData(courseId))))
      .rejects.toThrow("provider_client_required");
  });
  it.each(["x", "si", "os"])("refuses enrollment by %s", async (uid) => {
    const courseId = await venueCourse();
    await link();
    await expect(api.enrollCourseParticipant.run(request(uid, enrollData(courseId))))
      .rejects.toThrow("course_owner_required");
  });
  it("lets venue staff prepare an invitation through the course provider's roster", async () => {
    const courseId = await venueCourse();
    await link();
    await db.doc("users/u1").update({ email: "u1@example.com" });
    const result = await api.notifyCourseParticipant.run(request("s", { courseId, userId: "u1", channel: "phone" }));
    expect(result).toMatchObject({ status: "ready", url: expect.stringContaining("/courses?tab=bookings") });
    expect((await db.doc("rateLimits/participantNotifications_p").get()).data()?.count).toBe(1);
  });
  it("refuses invitations from strangers, for unlinked users and without a course", async () => {
    const courseId = await venueCourse();
    await link();
    await expect(api.notifyCourseParticipant.run(request("x", { courseId, userId: "u1", channel: "phone" })))
      .rejects.toMatchObject({ code: "permission-denied" });
    await expect(api.notifyCourseParticipant.run(request("s", { courseId, userId: "u2", channel: "phone" })))
      .rejects.toThrow("provider_client_required");
    await expect(api.notifyCourseParticipant.run(request("s", { userId: "u1", channel: "phone" })))
      .rejects.toThrow("invalid_id");
  });
});

describe("saveCourse provider and venue authority", () => {
  const venueInput = { ...input, venueId: "v", locationId: "l1", roomId: "r1" };
  const save = (uid: string, course: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    api.saveCourse.run(request(uid, { course, ...extra }));
  const providerOf = async (courseId: string) => (await db.doc(`courses/${courseId}`).get()).data()?.providerId;
  it("lets the venue owner create a course for their venue", async () => {
    const { courseId } = await save("biz", venueInput);
    expect(await providerOf(courseId)).toBe("biz");
  });
  it("creates on behalf of the owner when active staff leave providerId out or send their own", async () => {
    expect(await providerOf((await save("s", venueInput)).courseId)).toBe("biz");
    expect(await providerOf((await save("s", { ...venueInput, name: "Judo", startTime: "20:00" }, { providerId: "s" })).courseId)).toBe("biz");
  });
  it("keeps the stored provider when staff edit, whatever the client sends", async () => {
    const { courseId } = await save("biz", venueInput);
    await save("s", { ...venueInput, name: "Karate 2" }, { courseId, providerId: "x" });
    expect(await providerOf(courseId)).toBe("biz");
    expect((await db.doc(`courses/${courseId}`).get()).data()?.name).toBe("Karate 2");
  });
  it.each([["x", "a stranger"], ["si", "inactive staff"], ["os", "staff of another venue"]])(
    "refuses %s (%s) linking a venue", async (uid) => {
      await expect(save(uid, venueInput)).rejects.toMatchObject(
        { code: "permission-denied", message: "venue_authorization_required" });
    });
  it("refuses a stranger editing a venue course", async () => {
    const { courseId } = await save("biz", venueInput);
    await expect(save("x", venueInput, { courseId })).rejects.toMatchObject(
      { code: "permission-denied", message: "course_owner_required" });
  });
  it("leaves an individual provider without a venue unchanged", async () => {
    expect(await providerOf((await save("p", input)).courseId)).toBe("p");
  });
  it("refuses a foreign providerId without venue authority, but lets an admin pass one", async () => {
    await expect(save("p", input, { providerId: "biz" })).rejects.toMatchObject(
      { code: "permission-denied", message: "course_owner_required" });
    expect(await providerOf((await save("a", input, { providerId: "p" })).courseId)).toBe("p");
    expect(await providerOf((await save("a", { ...venueInput, startTime: "20:00" }, { providerId: "p" })).courseId)).toBe("p");
    expect(await providerOf((await save("a", { ...venueInput, startTime: "21:00" })).courseId)).toBe("biz");
  });
  it("needs an owner when staff create on behalf of an ownerless venue", async () => {
    await db.doc("venues/vn").set({ type: "gym", partnerStatus: "active", isActive: true });
    await db.doc("venueStaff/s").set({ venueId: "vn", isActive: true });
    await expect(save("s", { ...input, venueId: "vn" })).rejects.toMatchObject(
      { code: "permission-denied", message: "venue_owner_required" });
  });
  it("refuses a venue that does not host courses", async () => {
    await db.doc("venues/spa").set({ ownerId: "biz", type: "spa", partnerStatus: "active", isActive: true });
    await expect(save("biz", { ...input, venueId: "spa" })).rejects.toMatchObject(
      { code: "permission-denied", message: "venue_authorization_required" });
    await expect(save("biz", { ...input, venueId: "missing" })).rejects.toMatchObject(
      { code: "permission-denied", message: "venue_authorization_required" });
  });
  it("gates publishing on an active partner venue but lets drafts through", async () => {
    await db.doc("venues/v").update({ partnerStatus: "pending" });
    await expect(save("biz", venueInput)).rejects.toThrow("venue_not_active");
    await expect(save("biz", { ...venueInput, state: "draft" })).resolves.toHaveProperty("courseId");
    await db.doc("venues/v").update({ partnerStatus: "active", isActive: false });
    await expect(save("biz", venueInput)).rejects.toThrow("venue_not_active");
  });
  it("applies provider eligibility to the resolved provider", async () => {
    await db.doc("instructors/biz").update({ isActive: false });
    await expect(save("s", venueInput)).rejects.toThrow("provider_unavailable");
  });
});

describe("saveCourse venue space, instructor and timezone", () => {
  const venueInput = { ...input, venueId: "v", locationId: "l1", roomId: "r1" };
  const save = (uid: string, course: Record<string, unknown>) => api.saveCourse.run(request(uid, { course }));
  const stored = async (courseId: string) => (await db.doc(`courses/${courseId}`).get()).data()!;
  beforeEach(async () => {
    await db.doc("venues/v/locations/l2").set({ name: "Altra", city: "Milano", timezone: "Europe/Rome", isActive: true });
    await db.doc("venues/v/locations/l2/rooms/r2").set({ name: "Sala 2", isActive: true });
    await db.doc("venues/v/locations/off").set({ name: "Chiusa", city: "Roma", timezone: "Europe/Rome", isActive: false });
    await db.doc("venues/v/locations/off/rooms/r1").set({ name: "Sala", isActive: true });
    await db.doc("venues/v/locations/l1/rooms/rOff").set({ name: "Spenta", isActive: false });
    await db.doc("venues/w/locations/lw").set({ name: "Estranea", city: "Bari", timezone: "Europe/Rome", isActive: true });
    await db.doc("venues/w/locations/lw/rooms/rw").set({ name: "Sala W", isActive: true });
    await db.doc("instructors/q").set({ fullName: "Quinn", isActive: true, applicationStatus: "approved",
      providerProfile: { isVerified: false } });
    await db.doc("instructors/p2").set({ fullName: "Paola", isActive: true, applicationStatus: "approved",
      providerProfile: { isVerified: true } });
    await db.doc("venues/v/instructors/p").set({ isActive: true, name: "Anna" });
    await db.doc("venues/v/instructors/q").set({ isActive: true, name: "Quinn" });
    await db.doc("venues/v/instructors/off").set({ isActive: false, name: "Off" });
    await db.doc("instructors/off").set({ fullName: "Off", isActive: true, applicationStatus: "approved",
      providerProfile: { isVerified: true } });
  });
  it.each([
    ["an inactive room", { roomId: "rOff" }], ["a room of another location", { roomId: "r2" }],
    ["a missing room", { roomId: "nope" }], ["a missing room id", { roomId: null }],
    ["a missing location id", { locationId: null }], ["an inactive location", { locationId: "off" }],
    ["a location of another venue", { locationId: "lw", roomId: "rw" }],
  ])("rejects %s with invalid_space", async (_name, patch) => {
    await expect(save("biz", { ...venueInput, ...patch })).rejects.toMatchObject(
      { code: "invalid-argument", message: "invalid_space" });
  });
  it("stores the location's timezone whatever the client sends, and shows room and place", async () => {
    const course = await stored((await save("biz", { ...venueInput, timezone: "America/New_York" })).courseId);
    expect(course).toMatchObject({ timezone: "Europe/Rome", location: "Sala 1 · Sede", city: "Torino",
      locationId: "l1", roomId: "r1" });
  });
  it("generates the session instants in the location's timezone", async () => {
    await db.doc("venues/v/locations/l1").update({ timezone: "Asia/Tokyo" });
    const { courseId } = await save("biz", venueInput);
    expect(await stored(courseId)).toMatchObject({ timezone: "Asia/Tokyo" });
    const session = (await db.doc(`courses/${courseId}/sessions/${SESSION}`).get()).data()!;
    expect(session.startsAt.toDate().toISOString()).toBe("2099-10-12T09:00:00.000Z");
  });
  it("validates wall times in the location's timezone", async () => {
    await expect(save("biz", { ...venueInput, startDate: "2099-10-25", endDate: "2099-10-25",
      recurrence: "none", startTime: "02:30" })).rejects.toThrow("ambiguous_local_time");
  });
  it("ignores space ids on an unlinked course", async () => {
    const course = await stored((await save("p", { ...input, locationId: "l1", roomId: "r1" })).courseId);
    expect(course).toMatchObject({ locationId: null, roomId: null, location: "Torino", timezone: "Europe/Rome" });
  });
  it("accepts an instructor linked to the venue and overwrites the typed name", async () => {
    const course = await stored((await save("biz", { ...venueInput, instructorId: "p", instructor: "Free text" })).courseId);
    expect(course).toMatchObject({ instructorId: "p", instructor: "Anna" });
  });
  it.each([
    ["not linked to the venue", "p2"], ["linked but not verified", "q"], ["linked but switched off", "off"],
    ["unknown", "ghost"],
  ])("rejects a venue course instructor that is %s", async (_name, instructorId) => {
    await expect(save("biz", { ...venueInput, instructorId })).rejects.toMatchObject(
      { code: "invalid-argument", message: "invalid_instructor" });
  });
  it("accepts any verified provider as instructor of an unlinked course", async () => {
    const course = await stored((await save("p", { ...input, instructorId: "p2" })).courseId);
    expect(course).toMatchObject({ instructorId: "p2", instructor: "Paola" });
    await expect(save("p", { ...input, instructorId: "q" })).rejects.toThrow("invalid_instructor");
  });
  it("keeps the typed instructor name when no instructor is linked", async () => {
    expect((await stored((await save("biz", venueInput)).courseId)).instructor).toBe("Anna");
  });
});

describe("saveCourse session snapshots and revisions", () => {
  const venueInput = { ...input, venueId: "v", locationId: "l1", roomId: "r1", instructorId: "p" };
  const save = (uid: string, course: Record<string, unknown>, courseId?: string) =>
    api.saveCourse.run(request(uid, { course, ...(courseId ? { courseId } : {}) }));
  const sessions = async (courseId: string) =>
    (await db.collection(`courses/${courseId}/sessions`).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, any>);
  beforeEach(async () => {
    await db.doc("venues/v/instructors/p").set({ isActive: true, name: "Anna" });
    await db.doc("venues/v/instructors/p2").set({ isActive: true, name: "Paola" });
    await db.doc("instructors/p2").set({ fullName: "Paola", isActive: true, applicationStatus: "approved",
      providerProfile: { isVerified: true } });
    await db.doc("venues/v/locations/l1/rooms/r3").set({ name: "Sala 3", isActive: true });
    await db.doc("venues/v/locations/l2").set({ name: "Altra", city: "Milano", timezone: "Europe/Rome", isActive: true });
    await db.doc("venues/v/locations/l2/rooms/r2").set({ name: "Sala 2", isActive: true });
  });
  it("snapshots the venue, space, instructor, owner course and listing onto every new session", async () => {
    const { courseId } = await save("biz", venueInput);
    const all = await sessions(courseId);
    expect(all).toHaveLength(2);
    for (const session of all) {
      expect(session).toMatchObject({ revision: 1, courseId, venueId: "v", locationId: "l1", roomId: "r1",
        instructorId: "p", instructorName: "Anna", listed: true, waitlisted: 0, capacity: 5, state: "scheduled" });
    }
  });
  it("does not list sessions of a draft, and lists them once published", async () => {
    const { courseId } = await save("biz", { ...venueInput, state: "draft" });
    expect((await sessions(courseId)).every((s) => s.listed === false)).toBe(true);
    await save("biz", venueInput, courseId);
    expect((await sessions(courseId)).every((s) => s.listed === true)).toBe(true);
    await save("biz", { ...venueInput, state: "archived" }, courseId);
    expect((await sessions(courseId)).every((s) => s.listed === false)).toBe(true);
  });
  it("snapshots null space fields on an unlinked course", async () => {
    const { courseId } = await save("p", input);
    expect((await sessions(courseId))[0]).toMatchObject({ venueId: null, locationId: null, roomId: null,
      instructorId: null, revision: 1, listed: true, courseId });
  });
  it("bumps every scheduled session when capacity or price change, and only then", async () => {
    const { courseId } = await save("biz", venueInput);
    await save("biz", { ...venueInput, name: "Karate Pro", description: "x", level: "Beginner" }, courseId);
    expect((await sessions(courseId)).map((s) => s.revision)).toEqual([1, 1]);
    await save("biz", { ...venueInput, capacity: 10 }, courseId);
    expect((await sessions(courseId)).map((s) => s.revision)).toEqual([2, 2]);
    await save("biz", { ...venueInput, capacity: 10, lessonPriceCents: 1800 }, courseId);
    expect((await sessions(courseId)).map((s) => s.revision)).toEqual([3, 3]);
    await save("biz", { ...venueInput, capacity: 10, lessonPriceCents: 1800, seriesPriceCents: 0 }, courseId);
    expect((await sessions(courseId)).map((s) => s.revision)).toEqual([4, 4]);
  });
  it("leaves cancelled sessions' revision alone on a price change", async () => {
    const { courseId } = await save("biz", venueInput);
    await db.doc(`courses/${courseId}/sessions/${SESSION}`).update({ state: "cancelled" });
    await save("biz", { ...venueInput, lessonPriceCents: 1800 }, courseId);
    expect((await sessions(courseId)).map((s) => [s.id, s.revision])).toEqual([[SESSION, 1], ["2099-10-13", 2]]);
  });
  it("keeps a lesson's own capacity unless the course capacity changes (R12)", async () => {
    const { courseId } = await save("biz", venueInput);
    await db.doc(`courses/${courseId}/sessions/${SESSION}`).update({ capacity: 9 });
    await save("biz", { ...venueInput, name: "Karate 2" }, courseId);
    expect((await sessions(courseId)).map((s) => s.capacity)).toEqual([9, 5]);
    await save("biz", { ...venueInput, name: "Karate 2", capacity: 7 }, courseId);
    expect((await sessions(courseId)).map((s) => s.capacity)).toEqual([7, 7]);
    expect((await db.doc(`courses/${courseId}`).get()).data()?.nextAvailableSeats).toBe(7);
  });
  it("does not trip capacity_below_bookings on a lesson whose own capacity is above the course's", async () => {
    const { courseId } = await save("biz", venueInput);
    await db.doc(`courses/${courseId}/sessions/${SESSION}`).update({ capacity: 10, occupied: 6 });
    await save("biz", { ...venueInput, name: "Karate 2" }, courseId);
    await expect(save("biz", { ...venueInput, capacity: 4 }, courseId)).rejects.toThrow("capacity_below_bookings");
    await save("biz", { ...venueInput, capacity: 6 }, courseId);
  });
  it("freezes room, location, venue and instructor once booked, but not unbooked", async () => {
    const { courseId } = await save("biz", venueInput);
    await save("biz", { ...venueInput, roomId: "r3" }, courseId);
    await save("biz", { ...venueInput, roomId: "r3", instructorId: "p2" }, courseId);
    const moved = await sessions(courseId);
    expect(moved[0]).toMatchObject({ roomId: "r3", instructorId: "p2", instructorName: "Paola", revision: 3 });
    await book(courseId);
    await expect(save("biz", { ...venueInput, roomId: "r1", instructorId: "p2" }, courseId))
      .rejects.toThrow("booked_schedule_locked");
    await expect(save("biz", { ...venueInput, roomId: "r3", instructorId: "p" }, courseId))
      .rejects.toThrow("booked_schedule_locked");
    await expect(save("biz", { ...venueInput, roomId: "r2", instructorId: "p2", locationId: "l2" }, courseId))
      .rejects.toThrow("booked_schedule_locked");
  });
  it("lets a booked venue course be edited after its room was renamed", async () => {
    const { courseId } = await save("biz", venueInput);
    await book(courseId);
    await db.doc("venues/v/locations/l1/rooms/r1").update({ name: "Sala Grande" });
    await db.doc("instructors/p").update({ fullName: "Anna Rossi" });
    await save("biz", { ...venueInput, name: "Karate 2" }, courseId);
    expect((await db.doc(`courses/${courseId}`).get()).data()).toMatchObject({ name: "Karate 2",
      location: "Sala Grande · Sede", instructor: "Anna Rossi" });
  });
  it("keeps a lesson-level room and substitute across a name-only edit while the course values are unchanged", async () => {
    const { courseId } = await save("biz", venueInput);
    await db.doc(`courses/${courseId}/sessions/${SESSION}`).update({ roomId: "r3", instructorId: "p2", instructorName: "Paola", revision: 4 });
    await save("biz", { ...venueInput, name: "Karate 2" }, courseId);
    expect((await sessions(courseId))[0]).toMatchObject({ roomId: "r3", instructorId: "p2", instructorName: "Paola", revision: 4 });
  });
});

describe("saveCourse lock lifecycle", () => {
  const venueInput = { ...input, venueId: "v", locationId: "l1", roomId: "r1", instructorId: "p" };
  const save = (uid: string, course: Record<string, unknown>, courseId?: string) =>
    api.saveCourse.run(request(uid, { course, ...(courseId ? { courseId } : {}) }));
  const slotsIn = async (path: string) => Object.keys((await db.doc(path).get()).data()?.slots ?? {});
  const lockDocs = async () => (await db.collection("courseScheduleLocks").get()).size;
  beforeEach(async () => {
    await db.doc("venues/v/instructors/p").set({ isActive: true, name: "Anna" });
    await db.doc("venues/v/instructors/p2").set({ isActive: true, name: "Paola" });
    await db.doc("instructors/p2").set({ fullName: "Paola", isActive: true, applicationStatus: "approved",
      providerProfile: { isVerified: true } });
    await db.doc("venues/v/locations/l1/rooms/r3").set({ name: "Sala 3", isActive: true });
  });
  afterEach(async () => assertLockInvariant(db));
  it("takes a room and an instructor lock for every session of a published course", async () => {
    const { courseId } = await save("biz", venueInput);
    for (const day of ["2099-10-12", "2099-10-13"]) {
      expect(await slotsIn(`courseScheduleLocks/room:v:l1:r1|${day}`)).toEqual([`${courseId}_${day}`]);
      expect(await slotsIn(`courseScheduleLocks/instructor:p|${day}`)).toEqual([`${courseId}_${day}`]);
    }
    expect(await lockDocs()).toBe(4);
  });
  it("rejects an overlapping room with the first course's name and time, and writes nothing", async () => {
    await save("biz", venueInput);
    const before = (await db.collection("courses").get()).size;
    await expect(save("biz", { ...venueInput, name: "Judo", instructorId: "p2", startTime: "18:30" }))
      .rejects.toMatchObject({ message: "room_overlap", details: { courseName: "Karate",
        startsAt: "2099-10-12T16:00:00.000Z", endsAt: "2099-10-12T17:00:00.000Z" } });
    expect((await db.collection("courses").get()).size).toBe(before);
    expect(await lockDocs()).toBe(4);
  });
  it("rejects the same instructor in another room as instructor_overlap", async () => {
    await save("biz", venueInput);
    await expect(save("biz", { ...venueInput, name: "Judo", roomId: "r3" })).rejects.toMatchObject(
      { message: "instructor_overlap", details: { courseName: "Karate" } });
  });
  it("allows adjacent lessons in the same room and with the same instructor", async () => {
    await save("biz", venueInput);
    await save("biz", { ...venueInput, name: "Judo", startTime: "19:00" });
    expect(await lockDocs()).toBe(4);
  });
  it("takes no locks for a draft, and none for an unlinked course without an instructor", async () => {
    await save("biz", { ...venueInput, state: "draft" });
    await save("p", input);
    expect(await lockDocs()).toBe(0);
  });
  it("takes instructor locks only for an unlinked course with an instructor", async () => {
    const { courseId } = await save("p", { ...input, instructorId: "p2" });
    expect(await slotsIn("courseScheduleLocks/instructor:p2|2099-10-12")).toEqual([`${courseId}_2099-10-12`]);
    expect(await lockDocs()).toBe(2);
  });
  it.each(["draft", "archived"])("releases every lock when the course goes back to %s", async (state) => {
    const { courseId } = await save("biz", venueInput);
    await save("biz", { ...venueInput, state }, courseId);
    expect(await lockDocs()).toBe(0);
  });
  describe.each(["archived", "draft"])("moving a published course to %s after its resources were switched off", (state) => {
    const off: [string, () => Promise<unknown>][] = [
      ["its room", () => db.doc("venues/v/locations/l1/rooms/r1").update({ isActive: false })],
      ["its location", () => db.doc("venues/v/locations/l1").update({ isActive: false })],
      ["its instructor link", () => db.doc("venues/v/instructors/p").update({ isActive: false })],
      ["its provider", () => db.doc("instructors/biz").update({ isActive: false })],
      ["its category", () => db.doc("serviceCategories/karate").update({ isActive: false })],
    ];
    it.each(off)("succeeds and releases every lock slot when %s is off", async (_name, switchOff) => {
      const { courseId } = await save("biz", venueInput);
      expect(await lockDocs()).toBe(4);
      await switchOff();
      await save("biz", { ...venueInput, state }, courseId);
      expect(await lockDocs()).toBe(0);
      expect((await db.doc(`courses/${courseId}`).get()).data()).toMatchObject({ state, roomId: "r1",
        locationId: "l1", instructorId: "p", location: "Sala 1 · Sede", providerName: "Biz" });
    });
    it("still refuses to publish again while the room is off", async () => {
      const { courseId } = await save("biz", venueInput);
      await db.doc("venues/v/locations/l1/rooms/r1").update({ isActive: false });
      await save("biz", { ...venueInput, state }, courseId);
      await expect(save("biz", venueInput, courseId)).rejects.toThrow("invalid_space");
    });
    it("still validates a room id that is changed in the same save", async () => {
      const { courseId } = await save("biz", venueInput);
      await db.doc("venues/v/locations/l1/rooms/r3").update({ isActive: false });
      await expect(save("biz", { ...venueInput, state, roomId: "r3" }, courseId)).rejects.toThrow("invalid_space");
      expect(await lockDocs()).toBe(4);
    });
  });
  it("re-takes locks on republish and fails if someone else holds the slot by then", async () => {
    const { courseId } = await save("biz", venueInput);
    await save("biz", { ...venueInput, state: "draft" }, courseId);
    await save("biz", { ...venueInput, name: "Judo", instructorId: "p2" });
    await expect(save("biz", venueInput, courseId)).rejects.toThrow("room_overlap");
    expect((await db.doc(`courses/${courseId}`).get()).data()?.state).toBe("draft");
  });
  it("releases the slots of sessions a schedule edit drops", async () => {
    const { courseId } = await save("biz", venueInput);
    await save("biz", { ...venueInput, endDate: "2099-10-12" }, courseId);
    expect(await slotsIn("courseScheduleLocks/room:v:l1:r1|2099-10-13")).toEqual([]);
    expect(await slotsIn("courseScheduleLocks/room:v:l1:r1|2099-10-12")).toEqual([`${courseId}_2099-10-12`]);
  });
  it("re-keys cleanly when a weekly course moves by one hour", async () => {
    const { courseId } = await save("biz", venueInput);
    await save("biz", { ...venueInput, startTime: "19:00" }, courseId);
    const slots = (await db.doc("courseScheduleLocks/room:v:l1:r1|2099-10-12").get()).data()!.slots;
    expect(slots[`${courseId}_2099-10-12`]).toMatchObject({ start: Date.parse("2099-10-12T17:00:00Z") });
  });
  it("does not conflict with itself when re-saved, renamed or moved onto its own old slot", async () => {
    const { courseId } = await save("biz", venueInput);
    await save("biz", venueInput, courseId);
    await save("biz", { ...venueInput, name: "Karate 2", startTime: "18:30" }, courseId);
    expect(await lockDocs()).toBe(4);
  });
  it("rejects a venue course with more than 400 locked sessions, but not an unlinked one (annual)", async () => {
    const twoYears = { ...venueInput, endDate: "2101-10-12" };
    await expect(save("biz", twoYears)).rejects.toMatchObject(
      { message: "locked_schedule_too_long", details: { fields: ["startDate", "endDate"] } });
    await expect(save("biz", { ...twoYears, state: "draft" })).resolves.toHaveProperty("courseId");
    await expect(save("p", { ...input, endDate: "2101-10-12" })).resolves.toHaveProperty("courseId");
    await expect(save("p", { ...input, endDate: "2101-10-12", instructorId: "p2", name: "Pilates" }))
      .rejects.toThrow("locked_schedule_too_long");
  });
  it("still locks a year of daily lessons (366 sessions, under the cap)", async () => {
    await save("biz", { ...venueInput, endDate: "2100-10-12" });
    expect(await lockDocs()).toBe(732);
  });
  it("lets exactly one of two concurrent overlapping publishes win", async () => {
    for (let round = 0; round < 3; round++) {
      await db.recursiveDelete(db.collection("courses"));
      await db.recursiveDelete(db.collection("courseScheduleLocks"));
      const results = await Promise.allSettled([
        save("biz", { ...venueInput, name: "Alpha", instructorId: "p" }),
        save("biz", { ...venueInput, name: "Bravo", instructorId: "p2", startTime: "18:30" }),
      ]);
      expect(results.map((r) => r.status === "rejected" ? r.reason.message : "ok").sort()).toEqual(["ok", "room_overlap"]);
      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(failed.reason.message).toBe("room_overlap");
      await assertLockInvariant(db);
    }
    // Each round pays for a lost transaction retry plus teardown: ~15 s, too close to the 15 s default.
  }, 60000);
});

describe("past lock slots", () => {
  const venueInput = { ...input, venueId: "v", locationId: "l1", roomId: "r1", instructorId: "p" };
  const save = (uid: string, course: Record<string, unknown>, courseId?: string) =>
    api.saveCourse.run(request(uid, { course, ...(courseId ? { courseId } : {}) }));
  const slotsIn = async (path: string) => Object.keys((await db.doc(path).get()).data()?.slots ?? {});
  const lockDocs = async () => (await db.collection("courseScheduleLocks").get()).size;
  const at = (iso: string) => vi.useFakeTimers({ toFake: ["Date"], now: new Date(iso) });
  beforeEach(async () => {
    await db.doc("venues/v/instructors/p").set({ isActive: true, name: "Anna" });
    await db.doc("venues/v/instructors/p2").set({ isActive: true, name: "Paola" });
    await db.doc("instructors/p2").set({ fullName: "Paola", isActive: true, applicationStatus: "approved",
      providerProfile: { isVerified: true } });
    await db.doc("venues/v/locations/l1/rooms/r3").set({ name: "Sala 3", isActive: true });
  });
  afterEach(() => vi.useRealTimers());

  it("does not raise room_overlap against slots of lessons that already ended", async () => {
    const a = await save("biz", venueInput);
    const b = await save("biz", { ...venueInput, name: "Judo", roomId: "r3", instructorId: "p2", endDate: "2099-10-14" });
    at("2099-10-13T20:00:00Z");
    // Judo's first two lessons overlap Karate's, but both ended; only the third lesson moves into the room.
    await save("biz", { ...venueInput, name: "Judo", roomId: "r1", instructorId: "p2", endDate: "2099-10-14" }, b.courseId);
    expect(await slotsIn("courseScheduleLocks/room:v:l1:r1|2099-10-14")).toEqual([`${b.courseId}_2099-10-14`]);
    expect(await slotsIn("courseScheduleLocks/room:v:l1:r1|2099-10-12")).toEqual([`${a.courseId}_2099-10-12`]);
    await api.sweepElapsedLocks(new Date());
    await assertLockInvariant(db);
  });

  it("counts only lessons that have not ended towards the 400 cap", async () => {
    const { courseId } = await save("biz", { ...venueInput, endDate: "2100-10-12" });
    expect(await lockDocs()).toBe(732);
    at("2100-10-13T00:00:00Z");
    // 731 lessons in total, 365 of them still to come.
    await save("biz", { ...venueInput, endDate: "2101-10-12" }, courseId);
    await api.sweepElapsedLocks(new Date(), 500, 10);
    expect(await lockDocs()).toBe(730);
    await assertLockInvariant(db);
  }, 120000);

  it("still rejects a course with more than 400 lessons to come", async () => {
    await expect(save("biz", { ...venueInput, endDate: "2101-10-12" })).rejects.toThrow("locked_schedule_too_long");
  });

  it("releases the stored slots of ended lessons when the course is archived", async () => {
    const { courseId } = await save("biz", venueInput);
    at("2099-10-12T20:00:00Z");
    await save("biz", { ...venueInput, state: "archived" }, courseId);
    expect(await lockDocs()).toBe(0);
    await assertLockInvariant(db);
  });

  describe("sweepElapsedLocks", () => {
    const put = (path: string, slots: Record<string, [string, string]>) => db.doc(path).set({
      day: path.slice(-10), slots: Object.fromEntries(Object.entries(slots).map(([id, [start, end]]) =>
        [id, { start: Date.parse(start), end: Date.parse(end), courseName: id }])) });
    it("deletes elapsed slots and emptied documents, and keeps lessons still to come", async () => {
      const now = new Date("2099-10-12T12:00:00Z");
      await put("courseScheduleLocks/room:v:l1:r1|2099-10-11", { a_1: ["2099-10-11T10:00:00Z", "2099-10-11T11:00:00Z"] });
      await put("courseScheduleLocks/room:v:l1:r1|2099-10-12", { b_1: ["2099-10-12T10:00:00Z", "2099-10-12T11:00:00Z"],
        c_1: ["2099-10-12T13:00:00Z", "2099-10-12T14:00:00Z"] });
      await put("courseScheduleLocks/room:v:l1:r1|2099-10-13", { d_1: ["2099-10-13T10:00:00Z", "2099-10-13T11:00:00Z"] });
      await db.doc("courseScheduleLocks/instructor:p|2099-10-11").set({ day: "2099-10-11", slots: {} });
      expect(await api.sweepElapsedLocks(now)).toBe(3);
      expect((await db.doc("courseScheduleLocks/room:v:l1:r1|2099-10-11").get()).exists).toBe(false);
      expect((await db.doc("courseScheduleLocks/instructor:p|2099-10-11").get()).exists).toBe(false);
      expect(await slotsIn("courseScheduleLocks/room:v:l1:r1|2099-10-12")).toEqual(["c_1"]);
      expect(await slotsIn("courseScheduleLocks/room:v:l1:r1|2099-10-13")).toEqual(["d_1"]);
    });
    it("keeps a lesson that started yesterday and is still running past midnight", async () => {
      await put("courseScheduleLocks/room:v:l1:r1|2099-10-11", { n_1: ["2099-10-11T23:30:00Z", "2099-10-12T00:30:00Z"] });
      await api.sweepElapsedLocks(new Date("2099-10-12T00:10:00Z"));
      expect(await slotsIn("courseScheduleLocks/room:v:l1:r1|2099-10-11")).toEqual(["n_1"]);
      await api.sweepElapsedLocks(new Date("2099-10-12T00:40:00Z"));
      expect((await db.doc("courseScheduleLocks/room:v:l1:r1|2099-10-11").get()).exists).toBe(false);
    });
    it("works through the backlog in bounded pages across runs", async () => {
      for (let i = 1; i <= 5; i++) {
        await put(`courseScheduleLocks/room:v:l1:r${i}|2099-10-11`, { [`o${i}_1`]: ["2099-10-11T10:00:00Z", "2099-10-11T11:00:00Z"] });
      }
      const now = new Date("2099-10-12T12:00:00Z");
      expect(await api.sweepElapsedLocks(now, 2, 1)).toBe(2);
      expect(await lockDocs()).toBe(3);
      expect(await api.sweepElapsedLocks(now, 2, 5)).toBe(3);
      expect(await lockDocs()).toBe(0);
    });
  });
});

describe("previewCourse conflicts", () => {
  const one = { ...input, venueId: "v", locationId: "l1", roomId: "r1", instructorId: "p", recurrence: "none" };
  const preview = (uid: string, course: Record<string, unknown>, courseId?: string) =>
    api.previewCourse.run(request(uid, { course, ...(courseId ? { courseId } : {}) }));
  const save = (uid: string, course: Record<string, unknown>, courseId?: string) =>
    api.saveCourse.run(request(uid, { course, ...(courseId ? { courseId } : {}) }));
  beforeEach(async () => {
    await db.doc("venues/v/instructors/p").set({ isActive: true, name: "Anna" });
    await db.doc("venues/v/instructors/p2").set({ isActive: true, name: "Paola" });
    await db.doc("instructors/p2").set({ fullName: "Paola", isActive: true, applicationStatus: "approved",
      providerProfile: { isVerified: true } });
    await db.doc("venues/v/locations/l1/rooms/r3").set({ name: "Sala 3", isActive: true });
  });
  it("reports the sessions and no conflicts for a free slot", async () => {
    const result = await preview("biz", one);
    expect(result).toEqual({ sessions: [{ id: SESSION, startsAt: "2099-10-12T16:00:00.000Z",
      endsAt: "2099-10-12T17:00:00.000Z" }], conflicts: [] });
  });
  it("names the other course when the room is taken", async () => {
    await save("biz", { ...one, state: "published" });
    const result = await preview("s", { ...one, name: "Judo", instructorId: "p2", startTime: "18:30" });
    expect(result.conflicts).toEqual([{ sessionId: SESSION, kind: "room", courseName: "Karate",
      startsAt: "2099-10-12T16:00:00.000Z", endsAt: "2099-10-12T17:00:00.000Z" }]);
  });
  it("names the other course when the instructor is taken in another room", async () => {
    await save("biz", one);
    const result = await preview("biz", { ...one, name: "Judo", roomId: "r3" });
    expect(result.conflicts).toEqual([{ sessionId: SESSION, kind: "instructor", courseName: "Karate",
      startsAt: "2099-10-12T16:00:00.000Z", endsAt: "2099-10-12T17:00:00.000Z" }]);
  });
  it("reports a room and an instructor conflict on the same lesson as two rows", async () => {
    await save("biz", one);
    expect((await preview("biz", { ...one, name: "Judo" })).conflicts.map((c: { kind: string }) => c.kind).sort())
      .toEqual(["instructor", "room"]);
  });
  it("ignores the slots of the course being edited", async () => {
    const { courseId } = await save("biz", one);
    expect((await preview("biz", { ...one, startTime: "18:30" }, courseId)).conflicts).toEqual([]);
    expect((await preview("biz", { ...one, startTime: "18:30" })).conflicts).toHaveLength(2);
  });
  it("is not blocked by a draft, and does not write anything", async () => {
    await save("biz", { ...one, state: "draft" });
    expect((await preview("biz", one)).conflicts).toEqual([]);
    expect((await db.collection("courseScheduleLocks").get()).size).toBe(0);
  });
  it("applies the venue space validation and timezone override", async () => {
    await db.doc("venues/v/locations/l1").update({ timezone: "Asia/Tokyo" });
    expect((await preview("biz", { ...one, timezone: "America/New_York" })).sessions[0].startsAt)
      .toBe("2099-10-12T09:00:00.000Z");
    await expect(preview("biz", { ...one, roomId: "nope" })).rejects.toThrow("invalid_space");
    await expect(preview("biz", { ...one, instructorId: "p3" })).rejects.toThrow("invalid_instructor");
  });
  it.each([["x", "a stranger"], ["si", "inactive staff"], ["os", "staff of another venue"]])(
    "refuses %s (%s) previewing a venue course", async (uid) => {
      await expect(preview(uid, one)).rejects.toMatchObject(
        { code: "permission-denied", message: "venue_authorization_required" });
    });
  it("keeps the unlinked preview unchanged", async () => {
    const result = await preview("x", input);
    expect(result.sessions).toHaveLength(2);
    expect(result.conflicts).toEqual([]);
  });
  it("reports instructor conflicts for an unlinked course too", async () => {
    await save("p", { ...input, instructorId: "p2" });
    expect((await preview("p", { ...input, instructorId: "p2", name: "Yoga" })).conflicts).toHaveLength(2);
  });
});

describe("priced enrollment on venue courses", () => {
  const priced = { ...input, endDate: "2099-10-14", seriesPriceCents: 4000, capacity: 2, venueId: "v",
    locationId: "l1", roomId: "r1", instructorId: "p" };
  const DAYS = ["2099-10-12", "2099-10-13", "2099-10-14"];
  beforeEach(async () => {
    await db.doc("venues/v").update({ memberDiscountPercent: 10, partnerInstructorExtraPercent: 5 });
    await db.doc("instructors/p").update({ partnerStatus: "active" });
    await db.doc("venues/v/instructors/p").set({ isActive: true, name: "Anna" });
  });
  const create = async (course: Record<string, unknown> = priced) =>
    (await api.saveCourse.run(request("biz", { course }))).courseId as string;
  const enrollment = async (id: string) => (await db.doc(`courseEnrollments/${id}`).get()).data()!;
  const lesson = async (courseId: string, uid = "u1", requestId = `r-${uid}`) => api.enrollInCourse.run(request(uid,
    { courseId, scope: "lesson", sessionId: SESSION, requestId, ...await quoted(courseId) }));

  it("stores the discount snapshot of a lesson and charges the discounted price", async () => {
    const courseId = await create();
    const booking = await lesson(courseId);
    expect(booking.totalCents).toBe(1275);
    expect(await enrollment(booking.enrollmentId)).toMatchObject({ venueId: "v", regularCents: 1500,
      discountCents: 225, discountPercent: 15, gymPercent: 10, instructorPercent: 5, totalCents: 1275,
      allocations: { [SESSION]: 1275 }, sessionRevisions: { [SESSION]: 1 }, promotedFromWaitlist: false });
  });

  it("stores post-discount allocations for a series with every lesson's revision", async () => {
    const courseId = await create();
    const booking = await api.enrollInCourse.run(request("u1", { courseId, scope: "series", requestId: "s1",
      ...await quoted(courseId, "series") }));
    const stored = await enrollment(booking.enrollmentId);
    expect(stored).toMatchObject({ totalCents: 3402, regularCents: 4000, discountCents: 598, discountPercent: 15,
      allocations: { [DAYS[0]]: 1134, [DAYS[1]]: 1134, [DAYS[2]]: 1134 },
      sessionRevisions: { [DAYS[0]]: 1, [DAYS[1]]: 1, [DAYS[2]]: 1 } });
    expect(Object.values(stored.allocations as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(stored.totalCents);
  });

  it("prices a substituted lesson by the substitute's partner status", async () => {
    const courseId = await create();
    await db.doc("instructors/p2").set({ partnerStatus: "pending" });
    await db.doc(`courses/${courseId}/sessions/${SESSION}`).update({ instructorId: "p2" });
    const booking = await lesson(courseId);
    expect(await enrollment(booking.enrollmentId)).toMatchObject({ discountPercent: 10, instructorPercent: 0, totalCents: 1350 });
  });

  it("gives staff-added participants the discount without any expected price", async () => {
    const courseId = await create();
    await db.doc("clients/biz_u1").set({ providerId: "biz", userId: "u1" });
    const booking = await api.enrollCourseParticipant.run(request("s", { courseId, userId: "u1", scope: "lesson",
      sessionId: SESSION, requestId: "staff-add" }));
    expect(await enrollment(booking.enrollmentId)).toMatchObject({ createdBy: "s", totalCents: 1275, discountCents: 225,
      paymentMode: "direct", state: "confirmed" });
  });

  it("reports price_changed when the venue discount moves between quote and confirm", async () => {
    const courseId = await create();
    const expected = await quoted(courseId);
    await db.doc("venues/v").update({ memberDiscountPercent: 20 });
    await expect(api.enrollInCourse.run(request("u1", { courseId, scope: "lesson", sessionId: SESSION,
      requestId: "drift", ...expected }))).rejects.toMatchObject(
      { code: "failed-precondition", message: "price_changed", details: { reason: "price" } });
    expect((await db.collection("courseEnrollments").get()).empty).toBe(true);
    expect((await db.doc(`courses/${courseId}/sessions/${SESSION}`).get()).data()?.occupied).toBe(0);
  });

  it("books a 100 percent discount as a free direct booking", async () => {
    await db.doc("venues/v").update({ memberDiscountPercent: 100 });
    const courseId = await create();
    const booking = await lesson(courseId);
    expect(booking.totalCents).toBe(0);
    expect(await enrollment(booking.enrollmentId)).toMatchObject({ paymentMode: "direct", paymentStatus: "paid",
      discountCents: 1500, state: "confirmed" });
  });

  it("refuses a booking once the venue stopped being an active partner", async () => {
    const courseId = await create();
    const expected = await quoted(courseId);
    await db.doc("venues/v").update({ partnerStatus: "suspended" });
    await expect(api.enrollInCourse.run(request("u1", { courseId, scope: "lesson", sessionId: SESSION,
      requestId: "late", ...expected }))).rejects.toMatchObject({ code: "failed-precondition", message: "venue_not_active" });
    expect((await db.collection("courseEnrollments").get()).empty).toBe(true);
  });

  it("creates nothing for a series when one lesson is full", async () => {
    const courseId = await create();
    const expected = await quoted(courseId, "series");
    await db.doc(`courses/${courseId}/sessions/${DAYS[1]}`).update({ occupied: 2 });
    await expect(api.enrollInCourse.run(request("u1", { courseId, scope: "series", requestId: "partial", ...expected })))
      .rejects.toMatchObject({ code: "failed-precondition", message: "lesson_full", details: { waitlistAvailable: false } });
    expect((await db.collection("courseEnrollments").get()).empty).toBe(true);
    const counters = await Promise.all(DAYS.map(async (d) => (await db.doc(`courses/${courseId}/sessions/${d}`).get()).data()!.occupied));
    expect(counters).toEqual([0, 2, 0]);
  });
  describe("refunds", () => {
    const refunds = async () => (await db.collection("courseRefunds").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const paidSeries = async () => {
      const courseId = await create();
      const booking = await api.enrollInCourse.run(request("u1", { courseId, scope: "series", requestId: "s1",
        ...await quoted(courseId, "series") }));
      await api.recordCoursePayment.run(request("biz", { enrollmentId: booking.enrollmentId, method: "cash" }));
      return { courseId, enrollmentId: booking.enrollmentId };
    };
    it("refunds the exact post-discount allocation per lesson and the full total over the whole series", async () => {
      const { courseId, enrollmentId } = await paidSeries();
      await api.cancelCourseEnrollment.run(request("u1", { enrollmentId, sessionIds: [DAYS[1]] }));
      expect(await refunds()).toEqual([expect.objectContaining({ id: `${enrollmentId}_${DAYS[1]}`, amountCents: 1134,
        courseId, venueId: "v", enrollmentId, sessionId: DAYS[1], status: "pending" })]);
      await api.cancelCourseEnrollment.run(request("u1", { enrollmentId }));
      const all = await refunds();
      expect(all).toHaveLength(3);
      expect(all.reduce((sum, r) => sum + (r as unknown as { amountCents: number }).amountCents, 0)).toBe(3402);
      expect(all.every((r) => (r as unknown as { courseId: string; venueId: string }).venueId === "v")).toBe(true);
      expect((await enrollment(enrollmentId)).refundCents).toBe(3402);
    });
    it("lets venue staff read-confirm a refund written by a staff cancellation", async () => {
      const { enrollmentId } = await paidSeries();
      await api.cancelCourseEnrollment.run(request("s", { enrollmentId, sessionIds: [DAYS[0]] }));
      const [refund] = await refunds();
      await api.confirmCourseRefund.run(request("s", { refundId: refund.id }));
      expect((await db.doc(`courseRefunds/${refund.id}`).get()).data()).toMatchObject({ status: "completed", venueId: "v" });
    });
    it("creates no refund document when a free booking is cancelled", async () => {
      await db.doc("venues/v").update({ memberDiscountPercent: 100 });
      const courseId = await create();
      const booking = await lesson(courseId);
      await api.cancelCourseEnrollment.run(request("u1", { enrollmentId: booking.enrollmentId }));
      expect(await refunds()).toEqual([]);
      expect(await enrollment(booking.enrollmentId)).toMatchObject({ state: "cancelled", refundCents: 0 });
    });
    it("records course and venue on a late Stripe refund", async () => {
      const courseId = await create();
      const booking = await lesson(courseId);
      const ref = db.doc(`courseEnrollments/${booking.enrollmentId}`);
      await ref.update({ paymentMode: "stripe", state: "expired", activeSessionIds: [],
        holdExpiresAt: admin.firestore.Timestamp.fromMillis(1), checkoutSessionId: "cs" });
      await checkout.fulfillCourseCheckout({ id: "cs", payment_intent: "pi", payment_status: "paid", currency: "eur",
        amount_total: 1275, metadata: { courseEnrollmentId: booking.enrollmentId, userId: "u1" } } as never);
      expect((await db.doc(`courseRefunds/${booking.enrollmentId}_late`).get()).data())
        .toMatchObject({ courseId, venueId: "v", amountCents: 1275, paymentMode: "stripe", status: "pending" });
    });
    it("still confirms a legacy refund that has no courseId through its enrollment", async () => {
      const { enrollmentId } = await paidSeries();
      await db.doc("courseRefunds/legacy").set({ enrollmentId, providerId: "biz", userId: "u1", amountCents: 1134,
        paymentMode: "direct", status: "pending" });
      await expect(api.confirmCourseRefund.run(request("x", { refundId: "legacy" }))).rejects.toThrow("course_owner_required");
      await api.confirmCourseRefund.run(request("s", { refundId: "legacy" }));
      expect((await db.doc("courseRefunds/legacy").get()).data()?.status).toBe("completed");
    });
  });
});

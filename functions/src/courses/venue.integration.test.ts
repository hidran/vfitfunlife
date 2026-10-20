import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as admin from "firebase-admin";
import type { CallableRequest } from "firebase-functions/v2/https";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
vi.mock("../lib/stripeClient", () => ({ getStripe: async () => ({}) }));
const auth = vi.hoisted(() => ({ generatePasswordResetLink: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => auth }));
vi.mock("../lib/email", () => ({ EMAIL_SECRETS: [], sendEmail: vi.fn() }));
let api: typeof import("./index");
let operations: typeof import("./operations");
let authority: typeof import("./authority");
let db: admin.firestore.Firestore;
const request = (uid: string, data: unknown) => ({ auth: { uid, token: {} }, data }) as CallableRequest;
const input = { name: "Karate", categoryId: "karate", location: "Torino", instructor: "Anna", capacity: 5,
  durationMinutes: 60, startDate: "2099-10-12", startTime: "18:00", timezone: "Europe/Rome",
  recurrence: "daily", endDate: "2099-10-13", lessonPriceCents: 1500, seriesPriceCents: 2500, state: "published" };
const SESSION = "2099-10-12";
const COLLECTIONS = ["courses", "courseEnrollments", "courseRefunds", "courseNotifications", "clients",
  "users", "instructors", "serviceCategories", "venues", "venueStaff", "rateLimits"];

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-venue-courses" });
  db = admin.firestore();
  api = await import("./index");
  operations = await import("./operations");
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
async function book(courseId: string, uid = "u1", scope = "lesson") {
  return (await api.enrollInCourse.run(request(uid, { courseId, scope, sessionId: SESSION, requestId: `r-${uid}` })))
    .enrollmentId as string;
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
    expect(await providerOf((await save("s", { ...venueInput, name: "Judo" }, { providerId: "s" })).courseId)).toBe("biz");
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
    expect(await providerOf((await save("a", venueInput, { providerId: "p" })).courseId)).toBe("p");
    expect(await providerOf((await save("a", venueInput)).courseId)).toBe("biz");
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

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
  await db.doc("venues/v").set({ ownerId: "biz" });
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

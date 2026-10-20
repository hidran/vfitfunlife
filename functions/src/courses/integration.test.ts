import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testProjectId } from "./testProject";
import * as admin from "firebase-admin";
import type { CallableRequest } from "firebase-functions/v2/https";
import type Stripe from "stripe";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const stripe = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn() } },
  refunds: { create: vi.fn(), retrieve: vi.fn(), list: vi.fn() },
}));
vi.mock("../lib/stripeClient", () => ({ getStripe: async () => stripe }));
const auth = vi.hoisted(() => ({ generatePasswordResetLink: vi.fn(), getUserByEmail: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn() }));
const mail = vi.hoisted(() => vi.fn());
vi.mock("firebase-admin/auth", () => ({ getAuth: () => auth }));
vi.mock("../lib/email", () => ({ EMAIL_SECRETS: [], sendEmail: mail }));
let api: typeof import("./index");
let checkout: typeof import("./checkout");
let db: admin.firestore.Firestore;
const request = (uid: string, data: unknown) => ({ auth: { uid, token: {} }, data }) as CallableRequest;
const input = { name: "Karate", categoryId: "karate", location: "Torino", instructor: "Anna", capacity: 1,
  durationMinutes: 60, startDate: "2099-10-12", startTime: "18:00", timezone: "Europe/Rome",
  recurrence: "daily", endDate: "2099-10-14", lessonPriceCents: 1500, seriesPriceCents: 4000, state: "published" };
beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: testProjectId("demo-vfit-courses-api") });
  db = admin.firestore();
  api = await import("./index");
  checkout = await import("./checkout");
});
beforeEach(async () => {
  vi.clearAllMocks();
  await db.doc("systemSettings/payments").set({ stripePaymentsEnabled: false, courseCheckoutEnabled: false });
  (await import("../lib/cachedDoc")).invalidateCachedDoc("systemSettings/payments");
  for (const name of ["courses", "courseEnrollments", "courseRefunds", "courseNotifications", "clients", "rateLimits", "participantInvitationDeliveries",
    "users", "instructors", "serviceCategories"]) {
    await db.recursiveDelete(db.collection(name));
  }
  await db.doc("instructors/p").set({ fullName: "Anna", isActive: true, applicationStatus: "approved", providerProfile: { isVerified: true } });
  await db.doc("serviceCategories/karate").set({ isActive: true, parentId: "combat" });
  for (const uid of ["p", "u", "v"]) await db.doc(`users/${uid}`).set({ fullName: uid, role: uid === "p" ? "provider" : "customer", isActive: true });
});
async function create() { return (await api.saveCourse.run(request("p", { course: input }))).courseId; }
// What a customer's confirm sends: the final price and revisions of the quote they reviewed.
async function quoted(courseId: string, scope: string, sessionId = "2099-10-12") {
  const quote = await api.quoteCourse.run(request("u", { courseId }));
  const lines = quote.sessions.filter(l => l.sessionId === sessionId);
  return { expectedFinalCents: scope === "series" ? quote.series!.finalCents : lines[0].finalCents,
    expectedRevisions: scope === "series" ? quote.series!.revisions :
      Object.fromEntries(lines.map(l => [l.sessionId, l.revision])) };
}
async function enroll(courseId: string, uid = "u", scope = "series", requestId = "r1") {
  return api.enrollInCourse.run(request(uid, { courseId, scope, sessionId: "2099-10-12", requestId,
    ...await quoted(courseId, scope) }));
}
describe("transactional course enrollment", () => {
  it("lets only the course owner enroll a linked client, with direct-payment and creator audit", async () => {
    const id = await create();
    const data = { courseId: id, userId: "u", scope: "series", requestId: "provider-add" };
    await expect(api.enrollCourseParticipant.run(request("p", data))).rejects.toThrow("provider_client_required");
    await db.doc("clients/p_u").set({ providerId: "p", userId: "u" });
    const booking = await api.enrollCourseParticipant.run(request("p", data));
    expect((await db.doc(`courseEnrollments/${booking.enrollmentId}`).get()).data())
      .toMatchObject({ userId: "u", createdBy: "p", paymentMode: "direct", state: "confirmed" });
    expect((await api.enrollCourseParticipant.run(request("p", data))).enrollmentId).toBe(booking.enrollmentId);
    await expect(api.enrollCourseParticipant.run(request("v", data))).rejects.toThrow("course_owner_required");
    await expect(api.enrollCourseParticipant.run(request("p", { ...data, paymentMode: "stripe" })))
      .rejects.toThrow("direct_payment_required");
  });
  it("keeps independent provider/user pairs and automatically links customer course bookings", async () => {
    const first = (await api.saveCourse.run(request("p", { course: { ...input, capacity: 2 } }))).courseId;
    await enroll(first, "u"); await enroll(first, "v");
    await db.doc("users/p2").set({ role: "provider", isActive: true });
    await db.doc("instructors/p2").set({ fullName: "Second", isActive: true,
      providerProfile: { isVerified: true }, applicationStatus: "approved" });
    const second = (await api.saveCourse.run(request("p2", { course: input }))).courseId;
    await enroll(second, "u", "series", "second-provider");
    expect((await db.collection("clients").where("providerId", "==", "p").get()).size).toBe(2);
    expect((await db.collection("clients").where("userId", "==", "u").get()).size).toBe(2);
  });
  it("does not create zero-cent refunds for annual low-priced series", async () => {
    const id = (await api.saveCourse.run(request("p", { course: {
      ...input, endDate: "2100-10-11", seriesPriceCents: 100 } }))).courseId;
    const booking = await enroll(id);
    await db.doc(`courseEnrollments/${booking.enrollmentId}`).update({ paymentMode: "stripe",
      paymentStatus: "paid", stripePaymentIntentId: "pi", providerAmountOwedCents: 100 });
    await api.cancelCourseEnrollment.run(request("u", { enrollmentId: booking.enrollmentId }));
    const refunds = await db.collection("courseRefunds").get();
    expect(refunds.size).toBe(100);
    expect(refunds.docs.every(d => d.data().amountCents === 1)).toBe(true);
    const sessions = await db.collection(`courses/${id}/sessions`).get();
    expect(sessions.docs.every(d => d.data().occupied === 0)).toBe(true);
  }, 60000);
  it("recovers an older Stripe refund beyond the first page without creating another", async () => {
    await db.doc("courseRefunds/older").set({ paymentMode: "stripe", status: "pending",
      paymentIntentId: "pi", amountCents: 1 });
    stripe.refunds.list.mockResolvedValueOnce({ data: [{ id: "newer", metadata: {} }], has_more: true })
      .mockResolvedValueOnce({ data: [{ id: "re_old", metadata: { courseRefundId: "older" },
        status: "succeeded" }], has_more: false });
    await checkout.processCourseRefund("older");
    expect(stripe.refunds.list).toHaveBeenLastCalledWith({ payment_intent: "pi", limit: 100,
      starting_after: "newer" });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect((await db.doc("courseRefunds/older").get()).data()?.status).toBe("completed");
  });
  it("books and refunds every daily lesson of an annual course atomically", async () => {
    const course = { ...input, startDate: "2099-10-12", endDate: "2100-10-11", seriesPriceCents: 60000 };
    const id = (await api.saveCourse.run(request("p", { course }))).courseId;
    const results = await Promise.allSettled([enroll(id), enroll(id, "v")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const booking = results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof enroll>>>;
    const enrollmentId = booking.value.enrollmentId;
    const enrollment = (await db.doc(`courseEnrollments/${enrollmentId}`).get()).data()!;
    expect(enrollment.sessionIds).toHaveLength(365);
    await api.recordCoursePayment.run(request("p", { enrollmentId, method: "cash" }));
    await api.cancelCourseEnrollment.run(request(enrollment.userId, { enrollmentId, sessionIds: enrollment.sessionIds }));
    const sessions = await db.collection(`courses/${id}/sessions`).get();
    expect(sessions.docs.every(d => d.data().occupied === 0)).toBe(true);
    const refunds = await db.collection("courseRefunds").get();
    expect(refunds.size).toBe(365);
    expect(refunds.docs.reduce((sum, doc) => sum + doc.data().amountCents, 0)).toBe(60000);
    expect((await db.collection("courseNotifications").get()).docs.every(d => Buffer.byteLength(d.id) <= 1500))
      .toBe(true);
  }, 60000);
  it.each([
    [{ lessonPriceCents: null, seriesPriceCents: null }, ["lessonPriceCents", "seriesPriceCents"]],
    [{ recurrence: "weekly", weekdays: [] }, ["weekdays"]],
    [{ timezone: "invalid" }, ["timezone"]],
    [{ startDate: "2027-03-28", startTime: "02:30", recurrence: "none" },
      ["startDate", "startTime", "timezone"]],
  ])("returns field guidance for timetable and pricing errors (%j)", async (changes, fields) => {
    await expect(api.previewCourse.run(request("p", { course: { ...input, ...changes } })))
      .rejects.toMatchObject({ code: "failed-precondition", details: { fields } });
  });
  it("returns structured field validation instead of raw JSON for previews", async () => {
    await expect(api.previewCourse.run(request("p", { course: { ...input, categoryId: "" } })))
      .rejects.toMatchObject({ code: "invalid-argument", message: "course_validation_failed",
        details: { fields: ["categoryId"] } });
  });
  it("archives a fully cancelled course so it leaves discovery", async () => {
    const id = await create();
    await api.cancelRemainingCourse.run(request("p", { courseId: id, reason: "Course cancelled" }));
    expect((await db.doc(`courses/${id}`).get()).data()).toMatchObject({ state: "archived", enrollmentClosed: true });
    expect((await db.collection(`courses/${id}/sessions`).get()).docs.every(d => d.data().state === "cancelled")).toBe(true);
  });
  it("admits exactly one competing customer for the last series seat", async () => {
    const id = await create();
    const results = await Promise.allSettled([enroll(id), enroll(id, "v")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const sessions = await db.collection(`courses/${id}/sessions`).get();
    expect(sessions.docs.map(d => d.data().occupied)).toEqual([1, 1, 1]);
    expect((await db.collection("courseEnrollments").get()).size).toBe(1);
  });
  it("retries idempotently and rejects lesson/series duplicate membership", async () => {
    const id = await create();
    const a = await enroll(id); const b = await enroll(id);
    expect(a.enrollmentId).toBe(b.enrollmentId);
    await expect(enroll(id, "u", "lesson", "r2")).rejects.toThrow("already_enrolled");
    expect((await db.doc(`courses/${id}/sessions/2099-10-12`).get()).data()?.occupied).toBe(1);
  });
  it("creates no partial series if one lesson is full", async () => {
    const id = await create(); await enroll(id, "u", "lesson");
    await expect(enroll(id, "v")).rejects.toThrow("lesson_full");
    expect((await db.doc(`courses/${id}/sessions/2099-10-13`).get()).data()?.occupied).toBe(0);
  });
  it("records advance direct payment and releases/refunds once", async () => {
    const id = await create(); const e = await enroll(id);
    await expect(api.recordCoursePayment.run(request("v", { enrollmentId: e.enrollmentId, method: "cash" }))).rejects.toThrow();
    await api.recordCoursePayment.run(request("p", { enrollmentId: e.enrollmentId, method: "cash" }));
    for (let i = 0; i < 2; i++) await api.cancelCourseEnrollment.run(request("u", { enrollmentId: e.enrollmentId }));
    const refunds = await db.collection("courseRefunds").get();
    expect(refunds.size).toBe(3);
    expect(refunds.docs.reduce((sum, d) => sum + d.data().amountCents, 0)).toBe(4000);
    expect(refunds.docs.every(d => d.data().courseId === id && d.data().venueId === null)).toBe(true);
    expect((await db.doc(`courses/${id}/sessions/2099-10-12`).get()).data()?.occupied).toBe(0);
  });
  it("locks booked schedules and rejects reducing capacity below occupancy", async () => {
    const id = await create(); await enroll(id);
    await expect(api.saveCourse.run(request("p", { courseId: id, course: { ...input, startTime: "19:00" } }))).rejects.toThrow("booked_schedule_locked");
    await expect(api.saveCourse.run(request("v", { courseId: id, course: input }))).rejects.toThrow();
  });
  it("rejects online booking and checkout while switches are off", async () => {
    const id = await create();
    await db.doc("systemSettings/payments").set({ stripePaymentsEnabled: false, courseCheckoutEnabled: false });
    await expect(api.enrollInCourse.run(request("u", { courseId: id, scope: "series", requestId: "stripe", paymentMode: "stripe" }))).rejects.toThrow("not enabled");
    await expect(api.createCourseCheckout.run(request("u", { enrollmentId: "missing" }))).rejects.toThrow("not enabled");
  });
  it("keeps Stripe checkout parameters stable after saving the response fails", async () => {
    const id = await create();
    await db.doc("systemSettings/payments").set({ stripePaymentsEnabled: true, courseCheckoutEnabled: true });
    (await import("../lib/cachedDoc")).invalidateCachedDoc("systemSettings/payments");
    const e = await api.enrollInCourse.run(request("u", { courseId: id, scope: "series", requestId: "stripe", paymentMode: "stripe",
      ...await quoted(id, "series") }));
    stripe.checkout.sessions.create.mockResolvedValue({ id: "cs", url: "https://checkout.stripe.com/test" });
    const ref = db.doc(`courseEnrollments/${e.enrollmentId}`);
    const prototype = Object.getPrototypeOf(ref);
    const update = vi.spyOn(prototype, "update").mockRejectedValueOnce(new Error("Firestore unavailable"));
    await expect(api.createCourseCheckout.run(request("u", { enrollmentId: e.enrollmentId }))).rejects.toThrow();
    update.mockRestore();
    await new Promise(resolve => setTimeout(resolve, 1100));
    await api.createCourseCheckout.run(request("u", { enrollmentId: e.enrollmentId }));
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toEqual(stripe.checkout.sessions.create.mock.calls[1][0]);
  });
  it("refuses a checkout for a hold below Stripe's minimum", async () => {
    const id = await create();
    await db.doc("systemSettings/payments").set({ stripePaymentsEnabled: true, courseCheckoutEnabled: true });
    (await import("../lib/cachedDoc")).invalidateCachedDoc("systemSettings/payments");
    const e = await api.enrollInCourse.run(request("u", { courseId: id, scope: "series", requestId: "low", paymentMode: "stripe",
      ...await quoted(id, "series") }));
    await db.doc(`courseEnrollments/${e.enrollmentId}`).update({ totalCents: 45 });
    await expect(api.createCourseCheckout.run(request("u", { enrollmentId: e.enrollmentId }))).rejects.toMatchObject(
      { code: "failed-precondition", message: "checkout_amount_too_low" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("reduces provider liability once when paid Stripe lessons are cancelled", async () => {
    const id = await create(); const result = await enroll(id);
    const ref = db.doc(`courseEnrollments/${result.enrollmentId}`);
    await ref.update({ paymentMode: "stripe", paymentStatus: "paid", stripePaymentIntentId: "pi", providerAmountOwedCents: 4000 });
    await api.cancelCourseEnrollment.run(request("u", { enrollmentId: result.enrollmentId, sessionIds: ["2099-10-12"] }));
    await api.cancelCourseEnrollment.run(request("u", { enrollmentId: result.enrollmentId, sessionIds: ["2099-10-12"] }));
    expect((await ref.get()).data()?.providerAmountOwedCents).toBe(2666);
  });
  it("retrieves persisted refunds and cannot regress a completed refund", async () => {
    const ref = db.doc("courseRefunds/refund_retry");
    await ref.set({ paymentMode: "stripe", status: "processing", amountCents: 1000, stripeRefundId: "re_1", paymentIntentId: "pi" });
    stripe.refunds.retrieve.mockImplementation(async () => {
      await ref.update({ status: "completed" });
      return { id: "re_1", status: "pending" };
    });
    await checkout.processCourseRefund("refund_retry");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect((await ref.get()).data()?.status).toBe("completed");
  });
  it("does not double refund duplicate cancellation IDs", async () => {
    const id = await create(); const result = await enroll(id);
    const ref = db.doc(`courseEnrollments/${result.enrollmentId}`);
    await ref.update({ paymentMode: "stripe", paymentStatus: "paid", stripePaymentIntentId: "pi", providerAmountOwedCents: 4000 });
    await api.cancelCourseEnrollment.run(request("u", { enrollmentId: result.enrollmentId, sessionIds: ["2099-10-12", "2099-10-12"] }));
    const e = (await ref.get()).data();
    expect(e?.refundCents).toBe(1334);
    expect(e?.providerAmountOwedCents).toBe(2666);
  });
  it("updates the series boundary to the actual rescheduled first lesson", async () => {
    const id = await create();
    await api.manageCourseSession.run(request("p", { courseId: id, sessionId: "2099-10-12", action: "reschedule", reason: "New timetable", startsAt: "2099-10-15T18:00Z" }));
    expect((await db.doc(`courses/${id}`).get()).data()?.firstStartsAt.toDate().toISOString()).toBe("2099-10-13T16:00:00.000Z");
  });
  it("processes refunds beyond a first page of long-pending refunds", async () => {
    const batch = db.batch();
    for (let i = 0; i < 101; i++) batch.set(db.doc(`courseRefunds/processing_${String(i).padStart(3, "0")}`), {
      paymentMode: "stripe", status: "processing", stripeRefundId: `re_${i}`, paymentIntentId: "pi", amountCents: 100 });
    await batch.commit();
    stripe.refunds.retrieve.mockImplementation(async (id: string) => ({ id, status: "pending" }));
    await api.maintainCourseEnrollments.run({ scheduleTime: new Date().toISOString(), jobName: "test" });
    expect(stripe.refunds.retrieve).toHaveBeenCalledTimes(101);
  });
  it("reconciles cancellations beyond the first 100 sessions", async () => {
    const batch = db.batch();
    for (let i = 0; i < 101; i++) {
      const courseId = `bulk_${i}`;
      batch.set(db.doc(`courses/${courseId}`), { nextSessionId: "s", nextAvailableSeats: 0, state: "archived", providerId: "p" });
      batch.set(db.doc(`courses/${courseId}/sessions/s`), { state: "cancelled", occupied: 1, held: 0,
        startsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 86400000), cancellationReconciled: false });
      batch.set(db.doc(`courses/${courseId}/sessions/s/participants/u`), { enrollmentId: courseId });
      batch.set(db.doc(`courseEnrollments/${courseId}`), { courseId, userId: "u", providerId: "p", courseName: "Bulk",
        state: "confirmed", paymentMode: "direct", paymentStatus: "pending", activeSessionIds: ["s"],
        sessionIds: ["s"], cancelledSessionIds: [], refundCents: 0 });
    }
    await batch.commit();
    for (let i = 0; i < 2; i++) await api.maintainCourseEnrollments.run({ scheduleTime: new Date().toISOString(), jobName: "test" });
    expect((await db.collectionGroup("sessions").where("cancellationReconciled", "==", false).get()).empty).toBe(true);
    const enrollments = await db.collection("courseEnrollments").get();
    expect(enrollments.docs.every(d => d.data().state === "cancelled")).toBe(true);
  });
  it("queues reminders beyond the first 200 lessons", async () => {
    for (let i = 0; i < 201; i++) {
      const courseId = `reminder_${i}`;
      const batch = db.batch();
      batch.set(db.doc(`courses/${courseId}`), { name: "Reminder", providerName: "Anna" });
      batch.set(db.doc(`courses/${courseId}/sessions/s`), { state: "scheduled", startsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3600000) });
      batch.set(db.doc(`courses/${courseId}/sessions/s/participants/u`), { enrollmentId: courseId, state: "confirmed" });
      batch.set(db.doc(`courseEnrollments/${courseId}`), { activeSessionIds: ["s"] });
      await batch.commit();
    }
    await api.remindCourseParticipants.run({ scheduleTime: new Date().toISOString(), jobName: "test" });
    expect((await db.collection("courseNotifications").get()).size).toBe(201);
  });
  it("handles late paid webhook retries without reopening completed refunds", async () => {
    const id = await create(); const result = await enroll(id);
    const ref = db.doc(`courseEnrollments/${result.enrollmentId}`);
    // Convert fixture into an expired Stripe attempt without calling Stripe.
    await ref.update({ paymentMode: "stripe", state: "expired", activeSessionIds: [],
      holdExpiresAt: admin.firestore.Timestamp.fromMillis(1), checkoutSessionId: "cs" });
    const session = { id: "cs", payment_intent: "pi", payment_status: "paid", currency: "eur", amount_total: 4000,
      metadata: { courseEnrollmentId: result.enrollmentId, userId: "u" } } as unknown as Stripe.Checkout.Session;
    await checkout.fulfillCourseCheckout(session);
    const refund = db.doc(`courseRefunds/${result.enrollmentId}_late`);
    expect((await refund.get()).data()).toMatchObject({ courseId: id, venueId: null, amountCents: 4000 });
    await refund.update({ status: "completed" });
    await checkout.fulfillCourseCheckout(session);
    expect((await refund.get()).data()?.status).toBe("completed");
  });
});

describe("checkout and release rules", () => {
  const first = "2099-10-12";
  const sessionRef = (courseId: string) => db.doc(`courses/${courseId}/sessions/${first}`);
  const startingIn = (hours: number) => admin.firestore.Timestamp.fromMillis(Date.now() + hours * 3600000);
  it("never sends a zero-amount session to Stripe", async () => {
    const id = await create();
    await db.doc("systemSettings/payments").set({ stripePaymentsEnabled: true, courseCheckoutEnabled: true });
    (await import("../lib/cachedDoc")).invalidateCachedDoc("systemSettings/payments");
    await db.doc("courseEnrollments/zero").set({ userId: "u", courseId: id, courseName: "Karate", paymentMode: "stripe",
      state: "held", totalCents: 0, holdExpiresAt: startingIn(1) });
    await expect(api.createCourseCheckout.run(request("u", { enrollmentId: "zero" })))
      .rejects.toThrow("checkout_hold_unavailable");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("books a free lesson as paid direct without any checkout, whatever mode was requested", async () => {
    const id = (await api.saveCourse.run(request("p", { course: { ...input, lessonPriceCents: 0, seriesPriceCents: 0 } }))).courseId;
    await db.doc("systemSettings/payments").set({ stripePaymentsEnabled: true, courseCheckoutEnabled: true });
    (await import("../lib/cachedDoc")).invalidateCachedDoc("systemSettings/payments");
    const booking = await api.enrollInCourse.run(request("u", { courseId: id, scope: "lesson", sessionId: first,
      requestId: "free", paymentMode: "stripe", ...await quoted(id, "lesson") }));
    expect(booking).toMatchObject({ state: "confirmed", totalCents: 0 });
    expect((await db.doc(`courseEnrollments/${booking.enrollmentId}`).get()).data())
      .toMatchObject({ paymentMode: "direct", paymentStatus: "paid" });
    expect((await sessionRef(id).get()).data()).toMatchObject({ occupied: 1, held: 0 });
  });
  it("refuses a manager releasing a lesson that has already started", async () => {
    const id = await create(); const e = await enroll(id, "u", "lesson");
    await sessionRef(id).update({ startsAt: startingIn(-1) });
    await expect(api.cancelCourseEnrollment.run(request("p", { enrollmentId: e.enrollmentId })))
      .rejects.toThrow("cannot_cancel_past_lesson");
    expect((await sessionRef(id).get()).data()?.occupied).toBe(1);
    expect((await db.doc(`courseEnrollments/${e.enrollmentId}`).get()).data()?.state).toBe("confirmed");
  });
  it("refuses a customer cancelling inside the cancellation deadline", async () => {
    const id = await create(); const e = await enroll(id, "u", "lesson");
    await sessionRef(id).update({ startsAt: startingIn(23) });
    await expect(api.cancelCourseEnrollment.run(request("u", { enrollmentId: e.enrollmentId })))
      .rejects.toThrow("cancellation_deadline");
    expect((await sessionRef(id).get()).data()?.occupied).toBe(1);
  });
  it("lets a customer cancel outside the cancellation deadline", async () => {
    const id = await create(); const e = await enroll(id, "u", "lesson");
    await sessionRef(id).update({ startsAt: startingIn(25) });
    await api.cancelCourseEnrollment.run(request("u", { enrollmentId: e.enrollmentId }));
    expect((await sessionRef(id).get()).data()?.occupied).toBe(0);
    expect((await db.doc(`courseEnrollments/${e.enrollmentId}`).get()).data()?.state).toBe("cancelled");
  });
});
describe("priced enrollment", () => {
  const first = "2099-10-12";
  const lessonRequest = async (id: string, uid: string, requestId: string, over: Record<string, unknown> = {}) =>
    ({ courseId: id, scope: "lesson", sessionId: first, requestId, ...await quoted(id, "lesson"), ...over });
  const nothingWritten = async (id: string, occupied = 0) => {
    expect((await db.collection("courseEnrollments").get()).empty).toBe(true);
    expect((await db.doc(`courses/${id}/sessions/${first}`).get()).data()?.occupied).toBe(occupied);
  };
  it("requires the price and revisions a customer reviewed", async () => {
    const id = await create();
    const data = await lessonRequest(id, "u", "r");
    for (const missing of [{ expectedFinalCents: undefined }, { expectedRevisions: undefined }, { expectedFinalCents: 1.5 },
      { expectedRevisions: { [first]: "1" } }, { expectedRevisions: [1] }]) {
      await expect(api.enrollInCourse.run(request("u", { ...data, ...missing }))).rejects.toThrow("expected_price_required");
    }
    await nothingWritten(id);
  });
  it("reports price_changed with reason price when the lesson price is edited after the quote", async () => {
    const id = await create();
    const data = await lessonRequest(id, "u", "r");
    await api.saveCourse.run(request("p", { courseId: id, course: { ...input, lessonPriceCents: 1600 } }));
    await expect(api.enrollInCourse.run(request("u", data))).rejects.toMatchObject(
      { code: "failed-precondition", message: "price_changed", details: { reason: "price" } });
    await nothingWritten(id);
    // The re-reviewed quote goes through.
    const again = await api.enrollInCourse.run(request("u", await lessonRequest(id, "u", "r2")));
    expect(again.totalCents).toBe(1600);
  });
  it("reports price_changed with reason availability when only the capacity was edited", async () => {
    const id = await create();
    const data = await lessonRequest(id, "u", "r");
    await api.saveCourse.run(request("p", { courseId: id, course: { ...input, capacity: 2 } }));
    await expect(api.enrollInCourse.run(request("u", data))).rejects.toMatchObject(
      { code: "failed-precondition", message: "price_changed", details: { reason: "availability" } });
    await nothingWritten(id);
  });
  it("replays an accepted request without comparing the quote again", async () => {
    const id = await create();
    const data = await lessonRequest(id, "u", "r");
    const booking = await api.enrollInCourse.run(request("u", data));
    await db.doc(`courses/${id}`).update({ lessonPriceCents: 1600 });
    await db.doc(`courses/${id}/sessions/${first}`).update({ revision: 7 });
    expect(await api.enrollInCourse.run(request("u", data))).toEqual({ ...booking, replay: true });
    expect((await db.doc(`courses/${id}/sessions/${first}`).get()).data()?.occupied).toBe(1);
  });
  it("snapshots an undiscounted unlinked booking", async () => {
    const id = await create();
    const booking = await enroll(id, "u", "lesson");
    expect((await db.doc(`courseEnrollments/${booking.enrollmentId}`).get()).data()).toMatchObject({
      venueId: null, regularCents: 1500, discountCents: 0, discountPercent: 0, gymPercent: 0, instructorPercent: 0,
      totalCents: 1500, allocations: { [first]: 1500 }, sessionRevisions: { [first]: 1 }, promotedFromWaitlist: false });
  });
  it.each([
    ["a single lesson with the waitlist on", {}, "lesson", true],
    ["a series", {}, "series", false],
    ["a lesson of a course without a waitlist", { waitlistEnabled: false }, "lesson", false],
  ])("reports lesson_full with waitlistAvailable for %s", async (_name, course, scope, expected) => {
    const id = await create();
    await db.doc(`courses/${id}`).set(course, { merge: true });
    await enroll(id, "u", "lesson");
    const data = { ...await lessonRequest(id, "v", "rv"), scope, ...await quoted(id, scope as string) };
    await expect(api.enrollInCourse.run(request("v", data))).rejects.toMatchObject(
      { code: "failed-precondition", message: "lesson_full", details: { waitlistAvailable: expected } });
  });
  it("offers no waitlist for a full lesson inside the notice window", async () => {
    const id = await create();
    await enroll(id, "u", "lesson");
    await db.doc(`courses/${id}/sessions/${first}`).update({ startsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3600000) });
    await expect(api.enrollInCourse.run(request("v", await lessonRequest(id, "v", "rv")))).rejects.toMatchObject(
      { message: "lesson_full", details: { waitlistAvailable: false } });
  });
  it("lets the course owner add a participant without an expected price", async () => {
    const id = await create();
    await db.doc("clients/p_u").set({ providerId: "p", userId: "u" });
    await db.doc(`courses/${id}`).update({ lessonPriceCents: 1700 });
    const booking = await api.enrollCourseParticipant.run(request("p", { courseId: id, userId: "u", scope: "lesson",
      sessionId: first, requestId: "staff" }));
    expect(booking.totalCents).toBe(1700);
  });
});
describe("participant invitations and account activation", () => {
  async function linked() {
    await db.doc("users/u").update({ email: "recipient@example.com", fullName: "Anna User", accountStatus: "invited" });
    await db.doc("clients/p_u").set({ providerId: "p", userId: "u", phone: "+393331234567", accountStatus: "invited" });
  }
  it("sends private setup credentials only to the linked recipient and never returns them", async () => {
    await linked(); mail.mockResolvedValue(true);
    const courseId = await create();
    auth.generatePasswordResetLink.mockResolvedValue("https://private.example/?oobCode=secret");
    const result = await api.notifyCourseParticipant.run(request("p", { courseId, userId: "u", channel: "email", email: "attacker@example.com" }));
    expect(result).toEqual({ status: "sent" });
    expect(mail).toHaveBeenCalledWith(expect.objectContaining({ to: "recipient@example.com",
      action: expect.objectContaining({ url: "https://private.example/?oobCode=secret" }) }));
    expect(JSON.stringify(result)).not.toContain("secret");
    await expect(api.notifyCourseParticipant.run(request("p", { courseId, userId: "v", channel: "email" })))
      .rejects.toThrow("provider_client_required");
  });
  it("shares only a public registration landing page by phone and reports email failures", async () => {
    await linked();
    const courseId = await create();
    const result = await api.notifyCourseParticipant.run(request("p", { courseId, userId: "u", channel: "phone" }));
    expect(result).toMatchObject({ status: "ready", url: expect.stringContaining("/auth/participant?email=") });
    expect(JSON.stringify(result)).not.toContain("oobCode");
    expect(auth.generatePasswordResetLink).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
    auth.generatePasswordResetLink.mockResolvedValue("private-link"); mail.mockResolvedValue(false);
    expect(await api.notifyCourseParticipant.run(request("p", { courseId, userId: "u", channel: "email" }))).toEqual({ status: "failed" });
  });
  it("activates the same invited identity across every linked provider without losing enrollment", async () => {
    await linked();
    await db.doc("clients/p2_u").set({ providerId: "p2", userId: "u", accountStatus: "invited" });
    const id = await create();
    const enrollment = await api.enrollCourseParticipant.run(request("p", { courseId: id, userId: "u", scope: "series", requestId: "invite" }));
    const { activateInvitedAccount } = await import("../users/invitedAccount");
    expect(await activateInvitedAccount("u")).toBe(true);
    expect((await db.doc("users/u").get()).get("accountStatus")).toBe("active");
    for (const pair of ["p_u", "p2_u"]) expect((await db.doc(`clients/${pair}`).get()).get("accountStatus")).toBe("active");
    expect((await db.doc(`courseEnrollments/${enrollment.enrollmentId}`).get()).get("userId")).toBe("u");
    expect(await activateInvitedAccount("u")).toBe(false);
  });
});

describe("inline participant account creation", () => {
  it("requires only name/email, reserves one identity without sending an unsolicited email, and reuses it for another provider", async () => {
    auth.getUserByEmail.mockRejectedValue(Object.assign(new Error("missing"), { code: "auth/user-not-found" }));
    auth.createUser.mockResolvedValue({ uid: "invited-new" });
    const { createClientAccount } = await import("../bookings/createClientAccount");
    const data = { fullName: "Anna Smith", email: "anna@example.com", notifyByEmail: false };
    const first = await createClientAccount.run(request("p", data));
    expect(first).toMatchObject({ status: "created", emailSent: false, client: { userId: "invited-new" } });
    expect(mail).not.toHaveBeenCalled();
    expect(auth.generatePasswordResetLink).not.toHaveBeenCalled();
    expect((await db.doc("users/invited-new").get()).data()).toMatchObject({ accountStatus: "invited", email: "anna@example.com", fullName: "Anna Smith" });
    await db.doc("users/p2").set({ role: "provider", isActive: true });
    await db.doc("instructors/p2").set({ fullName: "Second", isActive: true, providerProfile: { isVerified: true }, applicationStatus: "approved" });
    auth.getUserByEmail.mockResolvedValue({ uid: "invited-new" });
    const second = await createClientAccount.run(request("p2", data));
    expect(second).toMatchObject({ status: "added", alreadyExisted: true, client: { userId: "invited-new" } });
    expect(auth.createUser).toHaveBeenCalledTimes(1);
    expect((await db.doc(`clients/${second.client.id}`).get()).get("accountStatus")).toBe("invited");
    expect((await db.collection("clients").where("userId", "==", "invited-new").get()).size).toBe(2);
  });
});

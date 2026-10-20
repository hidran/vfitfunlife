import { describe, it, expect } from "vitest";
import { validateCourse, generateSessions, assertReservable, allocatePrice, checkoutActive, paymentDecision, localInstant, courseRevisionBumped, sessionRevisionBumped } from "./core";
const input = { name: "Karate", categoryId: "martial_arts", description: "Beginners", location: "Torino", instructor: "Anna", capacity: 8, durationMinutes: 60, startDate: "2026-10-12", startTime: "18:00", timezone: "Europe/Rome", recurrence: "weekly", interval: 1, weekdays: [1, 3], endDate: "2026-10-26", lessonPriceCents: 1500, seriesPriceCents: 6500, bookingNoticeHours: 2, cancellationHours: 24, level: "Beginner", equipment: "", state: "published" };
describe("course rules", () => {
  it("accepts annual courses with one, two or all selected weekdays", () => {
    const annual = { ...input, startDate: "2026-10-08", endDate: "2027-10-07", weekdays: [1] };
    expect(generateSessions(validateCourse(annual))).toHaveLength(52);
    expect(generateSessions(validateCourse({ ...annual, weekdays: [4] }))).toHaveLength(53);
    expect(generateSessions(validateCourse({ ...annual, weekdays: [1, 3] }))).toHaveLength(104);
    expect(generateSessions(validateCourse({ ...annual, weekdays: [0, 1, 2, 3, 4, 5, 6] }))).toHaveLength(365);
  });
  it("generates selected weekdays including the end date", () => {
    const sessions = generateSessions(validateCourse(input));
    expect(sessions).toHaveLength(5);
    expect(sessions[0].startsAt.toISOString()).toBe("2026-10-12T16:00:00.000Z");
    expect(sessions[4].startsAt.toISOString()).toBe("2026-10-26T17:00:00.000Z");
  });
  it("rejects invalid calendar dates and daylight saving gaps and ambiguity", () => {
    for (const startDate of ["2026-02-30", "2026-03-29", "2026-10-25"]) {
      expect(() => generateSessions(validateCourse({ ...input, recurrence: "none", startDate, startTime: "02:30" }))).toThrow();
    }
  });
  it("rejects capacity, unbounded recurrence, missing pricing and fractional money", () => {
    for (const patch of [{ capacity: 0 }, { endDate: "" }, { lessonPriceCents: null, seriesPriceCents: null }, { lessonPriceCents: 12.5 }]) {
      expect(() => validateCourse({ ...input, ...patch })).toThrow();
    }
  });
  it("accepts free prices but rejects negative ones and still requires one price", () => {
    const free = validateCourse({ ...input, lessonPriceCents: 0, seriesPriceCents: 0 });
    expect(free.lessonPriceCents).toBe(0);
    expect(free.seriesPriceCents).toBe(0);
    expect(() => validateCourse({ ...input, lessonPriceCents: -1 })).toThrow();
    expect(() => validateCourse({ ...input, lessonPriceCents: null, seriesPriceCents: null })).toThrow("pricing_required");
  });
  it("defaults the venue room, instructor and waitlist fields", () => {
    const course = validateCourse(input);
    expect(course.waitlistEnabled).toBe(true);
    expect([course.locationId, course.roomId, course.instructorId]).toEqual([null, null, null]);
  });
  it("converts a wall time to an instant and rejects DST gaps and ambiguity", () => {
    expect(() => localInstant("2026-03-29", "02:30", "Europe/Rome")).toThrow("invalid_local_time");
    expect(() => localInstant("2026-10-25", "02:30", "Europe/Rome")).toThrow("ambiguous_local_time");
    expect(localInstant("2026-10-12", "18:00", "Europe/Rome").toISOString()).toBe("2026-10-12T16:00:00.000Z");
  });
  it("reports a full lesson as lesson_full", () => {
    const course = validateCourse(input);
    const sessions = [{ startsAt: new Date("2026-10-12T16:00Z"), occupied: 8, held: 0, state: "scheduled" }];
    expect(() => assertReservable(course, sessions, [], new Date("2026-10-01"))).toThrow("lesson_full");
  });
  it("reports a full lesson as lesson_full even inside the notice window", () => {
    const course = validateCourse(input);
    const sessions = [{ startsAt: new Date("2026-10-12T16:00Z"), occupied: 8, held: 0, state: "scheduled" }];
    expect(() => assertReservable(course, sessions, [], new Date("2026-10-12T15:00Z"))).toThrow("lesson_full");
  });
  it("supports daily annual courses and leap years", () => {
    expect(generateSessions(validateCourse({ ...input, recurrence: "daily", endDate: "2027-10-11" }))).toHaveLength(365);
    expect(generateSessions(validateCourse({ ...input, recurrence: "daily", startDate: "2028-01-01", endDate: "2028-12-31" }))).toHaveLength(366);
  });
  it("checks all capacities including held seats before series reservation", () => {
    const course = validateCourse(input);
    const sessions = generateSessions(course).map(s => ({ ...s, occupied: 0, held: 0, state: "scheduled" }));
    assertReservable(course, sessions, [], new Date("2026-10-01"));
    sessions[2].held = 8;
    expect(() => assertReservable(course, sessions, [], new Date("2026-10-01"))).toThrow("full");
  });
  it("rejects duplicates and late bookings", () => {
    const course = validateCourse(input);
    const sessions = generateSessions(course).map(s => ({ ...s, occupied: 0, held: 0, state: "scheduled" }));
    expect(() => assertReservable(course, sessions, [true], new Date("2026-10-01"))).toThrow("already");
    expect(() => assertReservable(course, sessions, [], new Date("2026-10-12T15:00Z"))).toThrow("deadline");
  });
  it("allocates the complete price exactly with deterministic rounding", () => {
    expect(allocatePrice(1000, 3)).toEqual([334, 333, 333]);
  });
  it("requires both payment flags to enable course checkout", () => {
    expect(checkoutActive({ stripePaymentsEnabled: true })).toBe(false);
    expect(checkoutActive({ stripePaymentsEnabled: false, courseCheckoutEnabled: true })).toBe(false);
    expect(checkoutActive({ stripePaymentsEnabled: true, courseCheckoutEnabled: true })).toBe(true);
  });
  it("fulfills only matching, paid, unexpired holds; late success gets refunded", () => {
    const enrollment = { state: "held", totalCents: 1500, holdExpiresAt: new Date("2026-10-01T10:30Z"), userId: "u", checkoutSessionId: "cs" };
    const event = { id: "cs", amount_total: 1500, currency: "eur", payment_status: "paid", metadata: { userId: "u" } };
    expect(paymentDecision(enrollment, event, new Date("2026-10-01T10:00Z"))).toBe("confirm");
    expect(paymentDecision(enrollment, event, new Date("2026-10-01T11:00Z"))).toBe("refund");
    expect(() => paymentDecision(enrollment, { ...event, amount_total: 1 }, new Date())).toThrow("mismatch");
    expect(paymentDecision({ ...enrollment, state: "confirmed" }, event, new Date())).toBe("ignore");
  });
});

describe("revision matrix", () => {
  const course = { lessonPriceCents: 1500 as number | null, seriesPriceCents: 6500 as number | null, capacity: 8 };
  it.each([
    ["lesson price", { lessonPriceCents: 1600 }, true], ["series price", { seriesPriceCents: 6000 }, true],
    ["capacity", { capacity: 10 }, true], ["free lesson", { lessonPriceCents: 0 }, true],
    ["a price going to null", { seriesPriceCents: null }, true], ["nothing", {}, false],
  ])("course: %s", (_name, patch, expected) => {
    expect(courseRevisionBumped(course, { ...course, ...patch })).toBe(expected);
  });
  it("course: both prices null stay unchanged", () => {
    const none = { lessonPriceCents: null, seriesPriceCents: null, capacity: 8 };
    expect(courseRevisionBumped(none, { ...none })).toBe(false);
  });
  const session = { startsAt: 1000, endsAt: 4600, roomId: "r1" as string | null, instructorId: "i1" as string | null };
  it.each([
    ["a time shift", { startsAt: 2000, endsAt: 5600 }, true], ["a longer lesson", { endsAt: 9000 }, true],
    ["a room change", { roomId: "r2" }, true], ["a room removed", { roomId: null }, true],
    ["an instructor change", { instructorId: "i2" }, true], ["an instructor removed", { instructorId: null }, true],
    ["nothing", {}, false],
  ])("session: %s", (_name, patch, expected) => {
    expect(sessionRevisionBumped(session, { ...session, ...patch })).toBe(expected);
  });
  it("session: an instructor added to an instructor-less lesson bumps", () => {
    expect(sessionRevisionBumped({ ...session, instructorId: null }, session)).toBe(true);
  });
});

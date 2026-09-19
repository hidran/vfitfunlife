import { describe, it, expect } from "vitest";
import { busyFrom, dayContextFrom, parseOverride, resolveRules } from "./dayContext";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe("resolveRules", () => {
  it("defaults to 15 / 24 / 8 when absent", () => {
    expect(resolveRules(undefined)).toEqual({ bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 });
  });

  it("keeps valid values and replaces out-of-range ones", () => {
    expect(resolveRules({ bufferMinutes: 0, minAdvanceNoticeHours: 2, maxBookingsPerDay: 0 }))
      .toEqual({ bufferMinutes: 0, minAdvanceNoticeHours: 2, maxBookingsPerDay: 8 });
  });
});

describe("parseOverride", () => {
  it("reads a closed day", () => {
    expect(parseOverride({ isAvailable: false, windows: [], reason: "Ferie" }))
      .toEqual({ isAvailable: false, windows: [] });
  });

  it("keeps only well-formed windows", () => {
    expect(parseOverride({
      isAvailable: true,
      windows: [{ start: "10:00", end: "12:00" }, { start: "13:00", end: "12:00" }, { start: "x" }],
    })).toEqual({ isAvailable: true, windows: [{ start: "10:00", end: "12:00" }] });
  });

  it("treats a missing or foreign-shaped doc as no override", () => {
    expect(parseOverride(undefined)).toBeNull();
    expect(parseOverride({ slots: [{ start: "09:00", isBooked: true }] })).toBeNull();
  });
});

describe("busyFrom", () => {
  it("counts only active bookings", () => {
    const busy = busyFrom([
      { status: "requested", scheduledAt: ts("2026-09-21T08:00:00Z"), scheduledEndAt: ts("2026-09-21T09:00:00Z") },
      { status: "accepted", scheduledAt: ts("2026-09-21T10:00:00Z"), scheduledEndAt: ts("2026-09-21T11:00:00Z") },
      { status: "payment_confirmed", scheduledAt: ts("2026-09-21T12:00:00Z"), scheduledEndAt: ts("2026-09-21T13:00:00Z") },
      { status: "declined", scheduledAt: ts("2026-09-21T14:00:00Z"), scheduledEndAt: ts("2026-09-21T15:00:00Z") },
      { status: "cancelled_by_client", scheduledAt: ts("2026-09-21T15:00:00Z") },
      { status: "completed", scheduledAt: ts("2026-09-21T16:00:00Z") },
    ]);
    expect(busy.map((b) => b.start.toISOString())).toEqual([
      "2026-09-21T08:00:00.000Z",
      "2026-09-21T10:00:00.000Z",
      "2026-09-21T12:00:00.000Z",
    ]);
  });

  it("falls back to start + durationMinutes when the end is missing", () => {
    const [b] = busyFrom([{ status: "accepted", scheduledAt: ts("2026-09-21T08:00:00Z"), durationMinutes: 45 }]);
    expect(b.end.toISOString()).toBe("2026-09-21T08:45:00.000Z");
  });
});

describe("dayContextFrom", () => {
  it("assembles schedule, override, rules and busy from the raw docs", () => {
    const ctx = dayContextFrom({
      instructor: {
        availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isAvailable: true }],
        bookingRules: { bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 3 },
      },
      override: undefined,
      bookings: [],
    });
    expect(ctx).toEqual({
      schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isAvailable: true }],
      override: null,
      rules: { bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 3 },
      busy: [],
    });
  });

  it("gives a provider with no instructor doc no hours", () => {
    expect(dayContextFrom({ instructor: undefined, override: undefined, bookings: [] }).schedule).toEqual([]);
  });
});

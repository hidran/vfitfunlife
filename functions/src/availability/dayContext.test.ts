import { describe, it, expect } from "vitest";
import {
  bookingDurationMinutes,
  bookingsStartingOn,
  busyFrom,
  dayContextFrom,
  parseOverride,
  parseSchedule,
  resolveRules,
} from "./dayContext";

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

describe("parseSchedule", () => {
  it("keeps only well-formed windows: HH:mm on both ends, start before end, day 0-6", () => {
    expect(parseSchedule([
      { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isAvailable: true },
      { dayOfWeek: 2, startTime: "bad", endTime: "12:00", isAvailable: true }, // malformed start
      { dayOfWeek: 3, startTime: "09:00", endTime: "18:00:00", isAvailable: true }, // non-canonical end
      { dayOfWeek: 4, startTime: "12:00", endTime: "09:00", isAvailable: true }, // end before start
    ])).toEqual([{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isAvailable: true }]);
  });

  it("gives nothing for garbage", () => {
    expect(parseSchedule(null)).toEqual([]);
    expect(parseSchedule(undefined)).toEqual([]);
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

  it("also holds the slot for legacy pre-migration statuses (a safety net for documents the status backfill may have missed)", () => {
    const busy = busyFrom([
      { status: "pending", scheduledAt: ts("2026-09-21T08:00:00Z"), scheduledEndAt: ts("2026-09-21T09:00:00Z") },
      { status: "confirmed", scheduledAt: ts("2026-09-21T10:00:00Z"), scheduledEndAt: ts("2026-09-21T11:00:00Z") },
      { status: "in_progress", scheduledAt: ts("2026-09-21T12:00:00Z"), scheduledEndAt: ts("2026-09-21T13:00:00Z") },
      { status: "cancelled", scheduledAt: ts("2026-09-21T14:00:00Z"), scheduledEndAt: ts("2026-09-21T15:00:00Z") },
      { status: "no_show", scheduledAt: ts("2026-09-21T16:00:00Z") },
      { status: "completed", scheduledAt: ts("2026-09-21T17:00:00Z") },
    ]);
    expect(busy.map((b) => b.start.toISOString())).toEqual([
      "2026-09-21T08:00:00.000Z",
      "2026-09-21T10:00:00.000Z",
      "2026-09-21T12:00:00.000Z",
    ]);
  });
});

describe("bookingDurationMinutes", () => {
  it("prefers durationMinutes, falls back to the legacy duration, then to an hour", () => {
    expect(bookingDurationMinutes({ durationMinutes: 45, duration: 90 })).toBe(45);
    expect(bookingDurationMinutes({ duration: 90 })).toBe(90);
    expect(bookingDurationMinutes({})).toBe(60);
  });

  it("coerces a stored numeric string, so the slot engine and the writer read it the same way", () => {
    expect(bookingDurationMinutes({ durationMinutes: "90" })).toBe(90);
  });

  it("falls back rather than returning a length that ends the session before it starts", () => {
    expect(bookingDurationMinutes({ durationMinutes: 0 })).toBe(60);
    expect(bookingDurationMinutes({ durationMinutes: -30 })).toBe(60);
    expect(bookingDurationMinutes({ durationMinutes: NaN })).toBe(60);
    expect(bookingDurationMinutes({ durationMinutes: "un'ora" })).toBe(60);
    expect(bookingDurationMinutes({ durationMinutes: null, duration: null })).toBe(60);
  });
});

describe("bookingsStartingOn", () => {
  it("counts only active bookings whose Rome date equals the target day", () => {
    const bookings = [
      // Rome is UTC+2 in September: 20:00 UTC on the 20th is 22:00 Rome, still the 20th.
      { status: "accepted", scheduledAt: ts("2026-09-20T20:00:00Z") },
      { status: "accepted", scheduledAt: ts("2026-09-21T08:00:00Z") },
      { status: "accepted", scheduledAt: ts("2026-09-21T20:30:00Z") }, // 22:30 Rome, still the 21st
      { status: "declined", scheduledAt: ts("2026-09-21T09:00:00Z") }, // inactive
    ];
    expect(bookingsStartingOn(bookings, "2026-09-21")).toBe(2);
    expect(bookingsStartingOn(bookings, "2026-09-20")).toBe(1);
  });
});

describe("dayContextFrom", () => {
  it("assembles schedule, override, rules, busy and bookingsToday from the raw docs", () => {
    const ctx = dayContextFrom({
      instructor: {
        availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isAvailable: true }],
        bookingRules: { bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 3 },
      },
      override: undefined,
      bookings: [],
    }, "2026-09-21");
    expect(ctx).toEqual({
      schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isAvailable: true }],
      override: null,
      rules: { bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 3 },
      busy: [],
      bookingsToday: 0,
    });
  });

  it("gives a provider with no instructor doc no hours", () => {
    expect(dayContextFrom({ instructor: undefined, override: undefined, bookings: [] }, "2026-09-21").schedule)
      .toEqual([]);
  });

  it("splits busy (blocks a slot) from bookingsToday (counts toward the cap): a booking spilling over from the previous day is one but not the other", () => {
    // 23:00 Rome on the 20th, 90 minutes — ends 00:30 Rome on the 21st.
    const bookings = [{
      status: "accepted",
      scheduledAt: ts("2026-09-20T21:00:00Z"),
      durationMinutes: 90,
    }];
    const ctx = dayContextFrom({ instructor: undefined, override: undefined, bookings }, "2026-09-21");
    expect(ctx.busy).toHaveLength(1);
    expect(ctx.bookingsToday).toBe(0);
  });
});

describe("excluding one booking from its own day", () => {
  // The booking being moved must not block itself, or it could never change time within its day.
  const bookings = [
    { id: "b1", status: "accepted", scheduledAt: ts("2026-09-21T08:00:00Z"), durationMinutes: 60 },
    { id: "b2", status: "accepted", scheduledAt: ts("2026-09-21T10:00:00Z"), durationMinutes: 60 },
  ];

  it("drops the excluded booking from busy but keeps the others", () => {
    expect(busyFrom(bookings, "b1").map((b) => b.start.toISOString()))
      .toEqual(["2026-09-21T10:00:00.000Z"]);
  });

  it("stops the excluded booking counting toward the per-day cap", () => {
    expect(bookingsStartingOn(bookings, "2026-09-21")).toBe(2);
    expect(bookingsStartingOn(bookings, "2026-09-21", "b1")).toBe(1);
  });

  it("changes nothing for an id that matches no booking, or no id at all", () => {
    expect(busyFrom(bookings, "nope")).toHaveLength(2);
    expect(busyFrom(bookings)).toHaveLength(2);
    expect(bookingsStartingOn(bookings, "2026-09-21", "nope")).toBe(2);
  });

  it("threads the exclusion through dayContextFrom", () => {
    const ctx = dayContextFrom({ instructor: undefined, override: undefined, bookings }, "2026-09-21", "b1");
    expect(ctx.busy).toHaveLength(1);
    expect(ctx.bookingsToday).toBe(1);
  });
});

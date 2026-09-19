import { describe, it, expect } from "vitest";
import {
  freeSlots,
  romeDayBounds,
  romeInstant,
  isDateKey,
  DEFAULT_BOOKING_RULES,
  type SlotQuery,
  type WeeklyWindow,
} from "./slots";

// 2026-09-21 is a Monday (dayOfWeek 1). Rome is UTC+2 in September.
const MONDAY = "2026-09-21";
const LONG_AGO = new Date("2026-01-01T00:00:00Z");
const NO_RULES = { bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 8 };

const mon = (startTime: string, endTime: string, isAvailable = true): WeeklyWindow =>
  ({ dayOfWeek: 1, startTime, endTime, isAvailable });

function q(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    schedule: [mon("09:00", "12:00")],
    override: null,
    rules: NO_RULES,
    busy: [],
    durationMinutes: 60,
    date: MONDAY,
    now: LONG_AGO,
    ...overrides,
  };
}

const at = (time: string, date = MONDAY) => romeInstant(date, time);

describe("freeSlots", () => {
  it("offers every 30-minute start whose session ends inside the window", () => {
    expect(freeSlots(q())).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("merges several windows on one day", () => {
    const schedule = [mon("09:00", "10:00"), mon("14:00", "15:30")];
    expect(freeSlots(q({ schedule }))).toEqual(["09:00", "14:00", "14:30"]);
  });

  it("ignores windows marked unavailable and other weekdays", () => {
    const schedule = [mon("09:00", "12:00", false), { dayOfWeek: 2, startTime: "09:00", endTime: "12:00" }];
    expect(freeSlots(q({ schedule }))).toEqual([]);
  });

  it("is empty when the provider has no hours at all", () => {
    expect(freeSlots(q({ schedule: [] }))).toEqual([]);
  });

  it("drops starts inside the minimum advance notice", () => {
    const now = new Date("2026-09-20T08:00:00Z"); // Sunday 10:00 Rome; +24h = Monday 10:00
    const rules = { ...NO_RULES, minAdvanceNoticeHours: 24 };
    expect(freeSlots(q({ now, rules }))).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("keeps a buffer on both sides of an existing booking", () => {
    const busy = [{ start: at("10:00"), end: at("11:00") }];
    const rules = { ...NO_RULES, bufferMinutes: 15 };
    // 09:00 would end at 10:00 — within 15' of the booking; 11:00 would start 0' after it.
    expect(freeSlots(q({ busy, rules, schedule: [mon("08:00", "13:00")] })))
      .toEqual(["08:00", "08:30", "11:30", "12:00"]);
  });

  it("lets back-to-back sessions touch when there is no buffer", () => {
    const busy = [{ start: at("10:00"), end: at("11:00") }];
    expect(freeSlots(q({ busy }))).toEqual(["09:00", "11:00"]);
  });

  it("offers nothing once the day holds maxBookingsPerDay active bookings", () => {
    const busy = [{ start: at("07:00"), end: at("08:00") }];
    expect(freeSlots(q({ busy, rules: { ...NO_RULES, maxBookingsPerDay: 1 } }))).toEqual([]);
  });

  it("an override that closes the day wins over the weekly hours", () => {
    expect(freeSlots(q({ override: { isAvailable: false, windows: [] } }))).toEqual([]);
  });

  it("an override with custom hours replaces the weekly hours", () => {
    const override = { isAvailable: true, windows: [{ start: "15:00", end: "16:30" }] };
    expect(freeSlots(q({ override }))).toEqual(["15:00", "15:30"]);
  });

  it("an override opens a day the weekly schedule keeps closed", () => {
    const override = { isAvailable: true, windows: [{ start: "10:00", end: "11:00" }] };
    expect(freeSlots(q({ date: "2026-09-20", override }))).toEqual(["10:00"]);
  });

  it("uses the service duration: a 90-minute session needs 90 free minutes", () => {
    expect(freeSlots(q({ durationMinutes: 90 }))).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("returns nothing for a non-positive duration", () => {
    expect(freeSlots(q({ durationMinutes: 0 }))).toEqual([]);
  });

  it("skips the hour that does not exist when clocks go forward (2026-03-29)", () => {
    // Sunday 01:00–04:00 wall clock is only two real hours: 02:00–02:59 never happens.
    const schedule = [{ dayOfWeek: 0, startTime: "01:00", endTime: "04:00" }];
    expect(freeSlots(q({ schedule, date: "2026-03-29" }))).toEqual(["01:00", "01:30", "03:00"]);
  });

  it("measures a session in real time when clocks go back (2026-10-25)", () => {
    // Sunday 01:00–03:00 wall clock lasts three real hours (02:xx happens twice), so a
    // 120-minute session also fits from 01:30. Wall-clock arithmetic would allow only 01:00.
    const schedule = [{ dayOfWeek: 0, startTime: "01:00", endTime: "03:00" }];
    expect(freeSlots(q({ schedule, date: "2026-10-25", durationMinutes: 120 })))
      .toEqual(["01:00", "01:30"]);
  });
});

describe("date helpers", () => {
  it("knows a real calendar date from a lookalike", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-9-1")).toBe(false);
  });

  it("gives DST days their real length", () => {
    const spring = romeDayBounds("2026-03-29");
    const autumn = romeDayBounds("2026-10-25");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(25);
  });

  it("has the documented defaults", () => {
    expect(DEFAULT_BOOKING_RULES).toEqual({ bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 });
  });
});

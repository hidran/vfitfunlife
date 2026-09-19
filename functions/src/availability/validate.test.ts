import { describe, it, expect } from "vitest";
import {
  canManageOwnAvailability,
  validateAvailabilityUpdate,
  validateSlotsRequest,
  MAX_OVERRIDE_WRITES,
} from "./validate";

const RULES = { bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 };
const mon = (startTime: string, endTime: string) => ({ dayOfWeek: 1, startTime, endTime, isAvailable: true });

function payload(overrides: Record<string, unknown> = {}) {
  return { schedule: [mon("09:00", "12:00")], bookingRules: RULES, overrides: { upsert: [], delete: [] }, ...overrides };
}

describe("validateAvailabilityUpdate", () => {
  it("accepts a well-formed update and normalizes it", () => {
    const out = validateAvailabilityUpdate(payload({
      schedule: [mon("09:00", "12:00"), mon("14:00", "18:00"), { dayOfWeek: 6, startTime: "10:00", endTime: "12:00" }],
      overrides: {
        upsert: [{ date: "2026-12-24", isAvailable: false, windows: [], reason: "  Vigilia  " }],
        delete: ["2026-11-01"],
      },
    }));
    expect(out.schedule).toHaveLength(3);
    expect(out.schedule[2]).toEqual({ dayOfWeek: 6, startTime: "10:00", endTime: "12:00", isAvailable: true });
    expect(out.bookingRules).toEqual(RULES);
    expect(out.upserts).toEqual([{ date: "2026-12-24", isAvailable: false, windows: [], reason: "Vigilia" }]);
    expect(out.deletes).toEqual(["2026-11-01"]);
  });

  it("accepts an empty schedule — the provider is then simply not bookable", () => {
    expect(validateAvailabilityUpdate(payload({ schedule: [] })).schedule).toEqual([]);
  });

  it("rejects malformed times and a start that is not before the end", () => {
    expect(() => validateAvailabilityUpdate(payload({ schedule: [mon("9:00", "12:00")] }))).toThrow(/HH:mm/);
    expect(() => validateAvailabilityUpdate(payload({ schedule: [mon("12:00", "12:00")] }))).toThrow(/before end/);
    expect(() => validateAvailabilityUpdate(payload({ schedule: [mon("24:00", "25:00")] }))).toThrow(/HH:mm/);
  });

  it("rejects overlapping windows on one day but allows touching ones", () => {
    expect(() => validateAvailabilityUpdate(payload({ schedule: [mon("09:00", "12:00"), mon("11:00", "13:00")] })))
      .toThrow(/overlap/);
    expect(validateAvailabilityUpdate(payload({ schedule: [mon("09:00", "12:00"), mon("12:00", "13:00")] }))
      .schedule).toHaveLength(2);
  });

  it("does not hold a switched-off day's windows against the others", () => {
    const off = { ...mon("10:00", "11:00"), isAvailable: false };
    expect(validateAvailabilityUpdate(payload({ schedule: [mon("09:00", "12:00"), off] })).schedule[1].isAvailable)
      .toBe(false);
  });

  it("rejects a dayOfWeek outside 0–6", () => {
    expect(() => validateAvailabilityUpdate(payload({ schedule: [{ ...mon("09:00", "10:00"), dayOfWeek: 7 }] })))
      .toThrow(/dayOfWeek/);
  });

  it("rejects booking rules out of range", () => {
    expect(() => validateAvailabilityUpdate(payload({ bookingRules: { ...RULES, maxBookingsPerDay: 0 } })))
      .toThrow(/maxBookingsPerDay/);
    expect(() => validateAvailabilityUpdate(payload({ bookingRules: { ...RULES, bufferMinutes: 7.5 } })))
      .toThrow(/bufferMinutes/);
    expect(() => validateAvailabilityUpdate(payload({ bookingRules: { ...RULES, minAdvanceNoticeHours: 500 } })))
      .toThrow(/minAdvanceNoticeHours/);
  });

  it("rejects bad override dates, duplicates and a date both kept and deleted", () => {
    const day = (date: string) => ({ date, isAvailable: false, windows: [] });
    expect(() => validateAvailabilityUpdate(payload({ overrides: { upsert: [day("2026-02-30")], delete: [] } })))
      .toThrow(/YYYY-MM-DD/);
    expect(() => validateAvailabilityUpdate(payload({
      overrides: { upsert: [day("2026-12-24"), day("2026-12-24")], delete: [] },
    }))).toThrow(/twice/);
    expect(() => validateAvailabilityUpdate(payload({
      overrides: { upsert: [day("2026-12-24")], delete: ["2026-12-24"] },
    }))).toThrow(/both/);
  });

  it("validates custom-hours windows and drops windows from a closed day", () => {
    const custom = { date: "2026-12-24", isAvailable: true, windows: [{ start: "10:00", end: "09:00" }] };
    expect(() => validateAvailabilityUpdate(payload({ overrides: { upsert: [custom], delete: [] } })))
      .toThrow(/before end/);
    const closed = { date: "2026-12-24", isAvailable: false, windows: [{ start: "10:00", end: "11:00" }] };
    expect(validateAvailabilityUpdate(payload({ overrides: { upsert: [closed], delete: [] } })).upserts[0].windows)
      .toEqual([]);
  });

  it(`caps a save at ${MAX_OVERRIDE_WRITES} date exceptions`, () => {
    const deletes = Array.from({ length: MAX_OVERRIDE_WRITES + 1 }, (_, i) =>
      new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
    expect(() => validateAvailabilityUpdate(payload({ overrides: { upsert: [], delete: deletes } })))
      .toThrow(/at most/);
  });

  it("rejects a payload that is not an object", () => {
    expect(() => validateAvailabilityUpdate(null)).toThrow(/payload/);
    expect(() => validateAvailabilityUpdate(payload({ schedule: "mon 9-5" }))).toThrow(/schedule/);
  });
});

describe("validateSlotsRequest", () => {
  it("accepts ids and a date", () => {
    expect(validateSlotsRequest({ instructorId: "i1", serviceId: "s1", date: "2026-09-21" }))
      .toEqual({ instructorId: "i1", serviceId: "s1", date: "2026-09-21" });
  });

  it("rejects path-like ids and bad dates", () => {
    expect(() => validateSlotsRequest({ instructorId: "a/b", serviceId: "s1", date: "2026-09-21" }))
      .toThrow(/instructorId/);
    expect(() => validateSlotsRequest({ instructorId: "i1", serviceId: "", date: "2026-09-21" }))
      .toThrow(/serviceId/);
    expect(() => validateSlotsRequest({ instructorId: "i1", serviceId: "s1", date: "21/09/2026" }))
      .toThrow(/date/);
  });
});

describe("canManageOwnAvailability", () => {
  it("lets verified and pending providers and staff in", () => {
    expect(canManageOwnAvailability({ providerStatus: "verified" })).toBe(true);
    expect(canManageOwnAvailability({ providerStatus: "pending", role: "customer" })).toBe(true);
    expect(canManageOwnAvailability({ role: "admin" })).toBe(true);
    expect(canManageOwnAvailability({ role: "superadmin" })).toBe(true);
  });

  it("keeps everyone else out", () => {
    expect(canManageOwnAvailability(undefined)).toBe(false);
    expect(canManageOwnAvailability({ role: "customer" })).toBe(false);
    expect(canManageOwnAvailability({ role: "provider", providerStatus: "rejected" })).toBe(false);
    expect(canManageOwnAvailability({ providerStatus: "verified", isDeleted: true })).toBe(false);
  });
});

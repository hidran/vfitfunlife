import { describe, it, expect } from "vitest";
import { normalizeAvailability } from "./normalize";

describe("normalizeAvailability", () => {
  it("passes through an already-canonical array (keeping well-formed entries)", () => {
    const input = [
      { dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true },
      { dayOfWeek: 2, startTime: "09:00", endTime: "12:00" },
    ];
    expect(normalizeAvailability(input)).toEqual([
      { dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true },
      { dayOfWeek: 2, startTime: "09:00", endTime: "12:00", isAvailable: true },
    ]);
  });

  it("drops array entries missing dayOfWeek/startTime/endTime", () => {
    const input = [
      { dayOfWeek: 1, startTime: "14:00", endTime: "18:00" },
      { startTime: "09:00", endTime: "12:00" }, // no dayOfWeek
      { dayOfWeek: 3, startTime: "10:00" }, // no endTime
    ];
    expect(normalizeAvailability(input)).toEqual([
      { dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true },
    ]);
  });

  it("converts a weekday-keyed object to an array (monday with two slots -> two entries, dayOfWeek 1)", () => {
    const input = {
      monday: {
        isAvailable: true,
        slots: [
          { start: "09:00", end: "12:00" },
          { start: "14:00", end: "18:00" },
        ],
      },
    };
    expect(normalizeAvailability(input)).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isAvailable: true },
      { dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true },
    ]);
  });

  it("preserves isAvailable:false from a weekday-keyed object", () => {
    const input = {
      tuesday: { isAvailable: false, slots: [{ start: "09:00", end: "12:00" }] },
    };
    expect(normalizeAvailability(input)).toEqual([
      { dayOfWeek: 2, startTime: "09:00", endTime: "12:00", isAvailable: false },
    ]);
  });

  it("ignores unknown day keys and missing slots", () => {
    const input = {
      notaday: { isAvailable: true, slots: [{ start: "09:00", end: "12:00" }] },
      friday: { isAvailable: true },
    };
    expect(normalizeAvailability(input)).toEqual([]);
  });

  it("returns [] for empty / garbage input", () => {
    expect(normalizeAvailability(null)).toEqual([]);
    expect(normalizeAvailability(undefined)).toEqual([]);
    expect(normalizeAvailability("nope")).toEqual([]);
    expect(normalizeAvailability(42)).toEqual([]);
    expect(normalizeAvailability({})).toEqual([]);
    expect(normalizeAvailability([])).toEqual([]);
  });
});

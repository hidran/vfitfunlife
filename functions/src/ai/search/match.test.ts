import { describe, it, expect } from "vitest";
import { hhmmToMinutes, slotCovers, matchesAvailability, formatSlotLabel } from "./match";

describe("hhmmToMinutes", () => {
  it("parses HH:MM to minutes", () => {
    expect(hhmmToMinutes("15:00")).toBe(900);
    expect(hhmmToMinutes("09:30")).toBe(570);
  });
});

describe("slotCovers", () => {
  it("true when slot fully covers requested window", () => {
    expect(slotCovers({ startTime: "14:00", endTime: "18:00" }, "15:00", "17:00")).toBe(true);
  });
  it("false when slot does not cover the window", () => {
    expect(slotCovers({ startTime: "16:00", endTime: "18:00" }, "15:00", "17:00")).toBe(false);
  });
});

describe("matchesAvailability", () => {
  const schedule = [
    { dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true },
    { dayOfWeek: 2, startTime: "09:00", endTime: "12:00", isAvailable: true },
  ];
  it("matches Monday 15:00-17:00", () => {
    expect(matchesAvailability(schedule, 1, "15:00", "17:00")).toBe(true);
  });
  it("rejects when day has no covering slot", () => {
    expect(matchesAvailability(schedule, 2, "15:00", "17:00")).toBe(false);
  });
  it("matches on day-only when no time window given", () => {
    expect(matchesAvailability(schedule, 1)).toBe(true);
  });
  it("ignores unavailable slots", () => {
    expect(matchesAvailability([{ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: false }], 1, "15:00", "16:00")).toBe(false);
  });
});

describe("formatSlotLabel", () => {
  it("formats a readable slot", () => {
    expect(formatSlotLabel(1, "15:00", "17:00")).toBe("Mon 15:00–17:00");
  });
});

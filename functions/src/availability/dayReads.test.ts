import { describe, it, expect } from "vitest";
import { bookingReadWindow } from "./dayReads";
import { romeDayBounds } from "./slots";

describe("bookingReadWindow", () => {
  it("starts 24h before the day and ends where the day ends, so a booking spilling over from the previous day is not missed", () => {
    const day = romeDayBounds("2026-09-21");
    const read = bookingReadWindow("2026-09-21");
    expect(read.end.getTime()).toBe(day.end.getTime());
    expect(read.start.getTime()).toBe(day.start.getTime() - 24 * 60 * 60 * 1000);
  });

  it("still widens by a flat 24h across the spring-forward day (23 real hours)", () => {
    const day = romeDayBounds("2026-03-29");
    const read = bookingReadWindow("2026-03-29");
    expect(read.start.getTime()).toBe(day.start.getTime() - 24 * 60 * 60 * 1000);
    expect(read.end.getTime()).toBe(day.end.getTime());
  });
});

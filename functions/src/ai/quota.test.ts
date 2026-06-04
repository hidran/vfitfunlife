import { describe, it, expect } from "vitest";
import { usageDocPath, nextCountOrThrow } from "./quota";

describe("usageDocPath", () => {
  it("builds a per-user per-day path", () => {
    expect(usageDocPath("u1", new Date("2026-06-04T10:00:00Z"))).toBe("users/u1/ai_usage/2026-06-04");
  });
});

describe("nextCountOrThrow", () => {
  it("increments under quota", () => {
    expect(nextCountOrThrow(0, 30)).toBe(1);
    expect(nextCountOrThrow(29, 30)).toBe(30);
  });
  it("throws at quota", () => {
    expect(() => nextCountOrThrow(30, 30)).toThrow(/quota/i);
  });
});

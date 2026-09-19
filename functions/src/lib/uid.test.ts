import { describe, it, expect } from "vitest";
import { isValidUid, MAX_UID_LENGTH } from "./uid";

describe("isValidUid", () => {
  it("accepts an ordinary uid", () => {
    expect(isValidUid("abc123")).toBe(true);
  });

  it("accepts a uid that merely contains dots or underscores", () => {
    expect(isValidUid("a.b_c")).toBe(true);
  });

  it("rejects non-strings", () => {
    expect(isValidUid(42)).toBe(false);
    expect(isValidUid(undefined)).toBe(false);
    expect(isValidUid(null)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidUid("")).toBe(false);
  });

  it("rejects a uid containing '/'", () => {
    expect(isValidUid("a/b")).toBe(false);
  });

  it("rejects a uid longer than 128 characters", () => {
    expect(isValidUid("u".repeat(129))).toBe(false);
    expect(isValidUid("u".repeat(MAX_UID_LENGTH))).toBe(true);
  });

  it('rejects "." and ".." exactly', () => {
    expect(isValidUid(".")).toBe(false);
    expect(isValidUid("..")).toBe(false);
  });

  it("rejects reserved __x__-style ids", () => {
    expect(isValidUid("__proto__")).toBe(false);
    expect(isValidUid("__x__")).toBe(false);
  });
});

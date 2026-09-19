import { describe, it, expect } from "vitest";
import { validateBulkDeleteInput, MAX_BULK_DELETE, MAX_ATTEMPTS, decideAfterRun } from "./bulkDelete";

describe("validateBulkDeleteInput", () => {
  it("accepts uids and a reason, de-duplicating and trimming", () => {
    expect(validateBulkDeleteInput({ uids: ["a", "b", "a"], reason: "  demo  " })).toEqual({ uids: ["a", "b"], reason: "demo" });
  });

  it("requires at least one uid", () => {
    expect(() => validateBulkDeleteInput({ uids: [], reason: "x" })).toThrow(/uids/);
    expect(() => validateBulkDeleteInput({ reason: "x" })).toThrow(/uids/);
  });

  it("requires a reason", () => {
    expect(() => validateBulkDeleteInput({ uids: ["a"], reason: "   " })).toThrow(/reason/);
  });

  it("rejects malformed uids", () => {
    expect(() => validateBulkDeleteInput({ uids: ["a/b"], reason: "x" })).toThrow(/uid/);
    expect(() => validateBulkDeleteInput({ uids: [42], reason: "x" })).toThrow(/uid/);
  });

  it(`caps a job at ${MAX_BULK_DELETE} users`, () => {
    const uids = Array.from({ length: MAX_BULK_DELETE + 1 }, (_, i) => `u${i}`);
    expect(() => validateBulkDeleteInput({ uids, reason: "x" })).toThrow(/500/);
  });

  it("rejects a uid longer than 128 characters", () => {
    expect(() => validateBulkDeleteInput({ uids: ["u".repeat(129)], reason: "x" })).toThrow(/uid/);
  });

  it('rejects "." and ".." as uids', () => {
    expect(() => validateBulkDeleteInput({ uids: ["."], reason: "x" })).toThrow(/uid/);
    expect(() => validateBulkDeleteInput({ uids: [".."], reason: "x" })).toThrow(/uid/);
  });

  it("rejects reserved __x__-style ids", () => {
    expect(() => validateBulkDeleteInput({ uids: ["__proto__"], reason: "x" })).toThrow(/uid/);
    expect(() => validateBulkDeleteInput({ uids: ["__x__"], reason: "x" })).toThrow(/uid/);
  });

  it("still accepts an ordinary uid that merely contains dots or underscores", () => {
    expect(validateBulkDeleteInput({ uids: ["a.b_c"], reason: "x" })).toEqual({ uids: ["a.b_c"], reason: "x" });
  });
});

describe("decideAfterRun", () => {
  it("retries when users failed and this was not the final attempt", () => {
    expect(decideAfterRun({ finalAttempt: false, summary: { failed: 2 } })).toBe("retry");
  });

  it("finishes when nothing failed, even mid-attempts", () => {
    expect(decideAfterRun({ finalAttempt: false, summary: { failed: 0 } })).toBe("finish");
  });

  it("finishes on the final attempt even if users are still failing", () => {
    expect(decideAfterRun({ finalAttempt: true, summary: { failed: 3 } })).toBe("finish");
  });
});

describe("MAX_ATTEMPTS", () => {
  it("is 3", () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });
});

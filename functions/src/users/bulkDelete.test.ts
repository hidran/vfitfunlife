import { describe, it, expect } from "vitest";
import { validateBulkDeleteInput, MAX_BULK_DELETE } from "./bulkDelete";

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
});

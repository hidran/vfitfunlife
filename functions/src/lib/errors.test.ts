import { describe, it, expect } from "vitest";
import { truncateError, MAX_ERROR_LENGTH } from "./errors";

describe("truncateError", () => {
  it("truncates long messages to MAX_ERROR_LENGTH characters", () => {
    const result = truncateError(new Error("x".repeat(400)));
    expect(result.length).toBe(MAX_ERROR_LENGTH);
  });

  it("prefers `${code}: ${message}` when the error carries a code", () => {
    const err = Object.assign(new Error("boom"), { code: 7 });
    expect(truncateError(err)).toBe("7: boom");
  });

  it("uses the LAST Caused-by stack line for a BulkWriter-style failure with a nested cause", () => {
    // recursiveDelete's real errors (firebase-admin/@google-cloud/firestore 7.11.6) carry two
    // "Caused by" lines: a bare call-site frame first, then the actual underlying error.
    const err = Object.assign(new Error("A write batch operation failed with: "), {
      stack: [
        "Error: A write batch operation failed with: ",
        "    at x",
        "Caused by: Error",
        "    at BulkWriter.<anonymous>",
        "Caused by: Error: 7 PERMISSION_DENIED: Missing or insufficient permissions.",
        "    at callErrorFromStatus",
      ].join("\n"),
    });
    expect(truncateError(err)).toBe("Caused by: Error: 7 PERMISSION_DENIED: Missing or insufficient permissions.");
  });

  it("uses the only Caused-by line when there is just one", () => {
    const err = Object.assign(new Error("A write batch operation failed with: "), {
      stack: "Error: A write batch operation failed with: \n    at x\nCaused by: Error: permission denied\n    at y",
    });
    expect(truncateError(err)).toBe("Caused by: Error: permission denied");
  });

  it("falls back to the plain message when there is no Caused-by line", () => {
    const err = Object.assign(new Error("A write batch operation failed with: "), {
      stack: "Error: A write batch operation failed with: \n    at x",
    });
    expect(truncateError(err)).toBe("A write batch operation failed with: ");
  });

  it("falls back to String(err) for a non-object throw", () => {
    expect(truncateError("just a string")).toBe("just a string");
  });

  it("truncates a combined code+message that exceeds the cap", () => {
    const err = Object.assign(new Error("x".repeat(400)), { code: "some/code" });
    const result = truncateError(err);
    expect(result.length).toBe(MAX_ERROR_LENGTH);
    expect(result.startsWith("some/code: ")).toBe(true);
  });
});

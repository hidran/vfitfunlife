import { describe, it, expect } from "vitest";
import {
  MAX_NAME_LENGTH,
  accountConfirmContinueUrl,
  normalizeFullName,
  normalizePhone,
  stagingAllowlistNote,
  validateCreateClientAccountRequest,
  validateResendRequest,
} from "./createClientAccountCore";

describe("normalizeFullName", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeFullName("  Luca   Rossi ")).toBe("Luca Rossi");
  });
  it("enforces 2..80 characters", () => {
    expect(normalizeFullName("L")).toBeNull();
    expect(normalizeFullName("Lu")).toBe("Lu");
    expect(normalizeFullName("a".repeat(MAX_NAME_LENGTH))).toHaveLength(MAX_NAME_LENGTH);
    expect(normalizeFullName("a".repeat(MAX_NAME_LENGTH + 1))).toBeNull();
  });
  it("rejects non-strings and blanks", () => {
    expect(normalizeFullName(undefined)).toBeNull();
    expect(normalizeFullName(42)).toBeNull();
    expect(normalizeFullName("   ")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("treats absent or blank as no phone", () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("  ")).toBeNull();
  });
  it("drops separators and keeps a leading +", () => {
    expect(normalizePhone("+39 333 123-4567")).toBe("+393331234567");
    expect(normalizePhone("(02) 1234.5678")).toBe("0212345678");
  });
  it("rewrites a 00 international prefix to +", () => {
    expect(normalizePhone("0039 333 1234567")).toBe("+393331234567");
  });
  it("returns undefined for something that is not a phone number", () => {
    expect(normalizePhone("call me")).toBeUndefined();
    expect(normalizePhone("12345")).toBeUndefined();
    expect(normalizePhone("+1234567890123456")).toBeUndefined();
    expect(normalizePhone(3331234567)).toBeUndefined();
  });
});

describe("validateCreateClientAccountRequest", () => {
  it("normalizes a valid payload", () => {
    expect(validateCreateClientAccountRequest({
      email: " Luca@Example.com ", fullName: " Luca  Rossi", phone: "+39 333 1234567",
    })).toEqual({ email: "luca@example.com", fullName: "Luca Rossi", phone: "+393331234567" });
  });
  it("accepts a missing phone", () => {
    expect(validateCreateClientAccountRequest({ email: "a@b.it", fullName: "Anna" }).phone).toBeNull();
  });
  it("names the invalid field", () => {
    expect(() => validateCreateClientAccountRequest({ email: "nope", fullName: "Anna" })).toThrow("invalid_email");
    expect(() => validateCreateClientAccountRequest({ email: "a@b.it", fullName: "A" })).toThrow("invalid_name");
    expect(() => validateCreateClientAccountRequest({ email: "a@b.it", fullName: "Anna", phone: "x" }))
      .toThrow("invalid_phone");
    expect(() => validateCreateClientAccountRequest(null)).toThrow("invalid_email");
    expect(() => validateCreateClientAccountRequest(["a@b.it"])).toThrow("invalid_email");
  });
});

describe("validateResendRequest", () => {
  it("accepts a uid-like id", () => {
    expect(validateResendRequest({ userId: "abc_DEF-123" })).toEqual({ userId: "abc_DEF-123" });
  });
  it("rejects anything else", () => {
    expect(() => validateResendRequest({ userId: "" })).toThrow("invalid_user");
    expect(() => validateResendRequest({ userId: "a/b" })).toThrow("invalid_user");
    expect(() => validateResendRequest({})).toThrow("invalid_user");
    expect(() => validateResendRequest(undefined)).toThrow("invalid_user");
  });
});

describe("accountConfirmContinueUrl", () => {
  it("points at the login page of the configured app", () => {
    expect(accountConfirmContinueUrl({ APP_URL: "https://app.example.com/" } as NodeJS.ProcessEnv))
      .toBe("https://app.example.com/auth/login");
  });
  it("falls back to the project's hosting site", () => {
    expect(accountConfirmContinueUrl({ GCLOUD_PROJECT: "vfit-app-staging" } as NodeJS.ProcessEnv))
      .toBe("https://vfit-app-staging.web.app/auth/login");
  });
});

describe("stagingAllowlistNote", () => {
  it("names the trainer and their uid", () => {
    expect(stagingAllowlistNote("Marco Bianchi", "t1")).toBe("added by trainer Marco Bianchi (t1)");
  });
  it("falls back to the uid and stays within the note limit", () => {
    expect(stagingAllowlistNote(null, "t1")).toBe("added by trainer t1");
    expect(stagingAllowlistNote("x".repeat(300), "t1").length).toBeLessThanOrEqual(200);
  });
});

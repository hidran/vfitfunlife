import { describe, it, expect } from "vitest";
import { PROTECTED_SUPERADMIN_UIDS, mayHoldSuperadmin, isProtectedSuperadmin } from "./superadmins";

describe("PROTECTED_SUPERADMIN_UIDS", () => {
  it("contains exactly the two designated accounts", () => {
    expect(PROTECTED_SUPERADMIN_UIDS).toEqual([
      "7MK6TgATIbhl3BkUksLNdGi7cMg1",
      "KTNK3mIMHqg8JNOQiVyKioulORs1",
    ]);
  });
});

describe("mayHoldSuperadmin", () => {
  it("accepts the two allowlisted uids", () => {
    expect(mayHoldSuperadmin("7MK6TgATIbhl3BkUksLNdGi7cMg1")).toBe(true);
    expect(mayHoldSuperadmin("KTNK3mIMHqg8JNOQiVyKioulORs1")).toBe(true);
  });

  it("rejects any other uid", () => {
    expect(mayHoldSuperadmin("someOtherUid")).toBe(false);
    expect(mayHoldSuperadmin("")).toBe(false);
  });
});

describe("isProtectedSuperadmin", () => {
  it("is true for a doc whose current role is superadmin", () => {
    expect(isProtectedSuperadmin({ role: "superadmin" })).toBe(true);
  });

  it("is false for a non-superadmin doc", () => {
    expect(isProtectedSuperadmin({ role: "admin" })).toBe(false);
    expect(isProtectedSuperadmin({ role: "customer" })).toBe(false);
    expect(isProtectedSuperadmin({ role: "provider" })).toBe(false);
  });

  it("is false for a missing doc, undefined doc, or doc with no role", () => {
    expect(isProtectedSuperadmin(null)).toBe(false);
    expect(isProtectedSuperadmin(undefined)).toBe(false);
    expect(isProtectedSuperadmin({})).toBe(false);
  });
});

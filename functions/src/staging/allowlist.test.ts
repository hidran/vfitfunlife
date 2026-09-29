import { describe, it, expect, vi } from "vitest";
import {
  isStagingAccessAllowed,
  normalizeAllowlistEmail,
  normalizeAllowlistNote,
  stagingAllowlistEnabled,
  MAX_NOTE_LENGTH,
} from "./allowlist";

describe("stagingAllowlistEnabled", () => {
  it("is on for a deploy/runtime targeting staging", () => {
    expect(stagingAllowlistEnabled({ GCLOUD_PROJECT: "vfit-app-staging" })).toBe(true);
  });

  it("is off for production — blocking functions cannot exist there", () => {
    expect(stagingAllowlistEnabled({ GCLOUD_PROJECT: "vfit-funlife" })).toBe(false);
  });

  it("is off when no project is known", () => {
    expect(stagingAllowlistEnabled({})).toBe(false);
  });

  it("is off in the emulator even for the staging project, unless opted in", () => {
    expect(
      stagingAllowlistEnabled({ GCLOUD_PROJECT: "vfit-app-staging", FUNCTIONS_EMULATOR: "true" })
    ).toBe(false);
    expect(
      stagingAllowlistEnabled({
        GCLOUD_PROJECT: "vfit-funlife",
        FUNCTIONS_EMULATOR: "true",
        STAGING_ALLOWLIST_IN_EMULATOR: "true",
      })
    ).toBe(true);
  });
});

describe("normalizeAllowlistEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeAllowlistEmail("  Hidran@Gmail.COM ")).toBe("hidran@gmail.com");
  });

  it.each([undefined, null, 42, "", "   ", "no-at-sign", "a@b", "a b@c.de", "a/b@c.de", "a@b@c.de"])(
    "rejects %s",
    (raw) => {
      expect(normalizeAllowlistEmail(raw)).toBeNull();
    }
  );

  it("rejects absurdly long input", () => {
    expect(normalizeAllowlistEmail(`${"a".repeat(250)}@x.io`)).toBeNull();
  });
});

describe("normalizeAllowlistNote", () => {
  it("treats absent and blank as no note", () => {
    expect(normalizeAllowlistNote(undefined)).toBeUndefined();
    expect(normalizeAllowlistNote(null)).toBeUndefined();
    expect(normalizeAllowlistNote("   ")).toBeUndefined();
  });

  it("trims", () => {
    expect(normalizeAllowlistNote("  QA team ")).toBe("QA team");
  });

  it("rejects non-strings and over-long notes", () => {
    expect(() => normalizeAllowlistNote(5)).toThrow();
    expect(() => normalizeAllowlistNote("x".repeat(MAX_NOTE_LENGTH + 1))).toThrow();
  });
});

describe("isStagingAccessAllowed", () => {
  function lookups(entries: string[], roles: Record<string, string> = {}) {
    return {
      hasAllowlistEntry: vi.fn(async (email: string) => entries.includes(email)),
      getRole: vi.fn(async (uid: string) => roles[uid]),
    };
  }

  it("allows an allowlisted email, matching case-insensitively", async () => {
    const l = lookups(["demo.customer@vitfitdemo.dev"]);
    await expect(
      isStagingAccessAllowed({ uid: "u1", email: "Demo.Customer@VitFitDemo.dev" }, l)
    ).resolves.toBe(true);
    expect(l.hasAllowlistEntry).toHaveBeenCalledWith("demo.customer@vitfitdemo.dev");
    // Short-circuits: no profile read needed.
    expect(l.getRole).not.toHaveBeenCalled();
  });

  it("allows a superadmin without an allowlist entry", async () => {
    const l = lookups([], { su: "superadmin" });
    await expect(isStagingAccessAllowed({ uid: "su", email: "boss@vfit.com" }, l)).resolves.toBe(true);
  });

  it("denies an admin that is not allowlisted — only superadmin bypasses", async () => {
    const l = lookups([], { a: "admin" });
    await expect(isStagingAccessAllowed({ uid: "a", email: "a@vfit.com" }, l)).resolves.toBe(false);
  });

  it("denies a stranger", async () => {
    const l = lookups(["someone@else.com"]);
    await expect(isStagingAccessAllowed({ uid: "x", email: "x@y.com" }, l)).resolves.toBe(false);
  });

  it("denies an account with no email and no superadmin profile (e.g. phone auth)", async () => {
    const l = lookups([]);
    await expect(isStagingAccessAllowed({ uid: "p", email: null }, l)).resolves.toBe(false);
    expect(l.hasAllowlistEntry).not.toHaveBeenCalled();
  });

  it("denies a brand-new user (no uid profile) that is not allowlisted", async () => {
    const l = lookups([]);
    await expect(isStagingAccessAllowed({ email: "new@user.com" }, l)).resolves.toBe(false);
    expect(l.getRole).not.toHaveBeenCalled();
  });
});

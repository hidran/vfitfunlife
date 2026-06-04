import { describe, it, expect, vi } from "vitest";

// admin.ts transitively imports ../utils/roles, which calls admin.firestore()
// at module scope. Stub it so the module loads without an initialized Firebase
// app — validateSettingsPatch is pure and touches neither Firestore nor the AI SDK.
vi.mock("firebase-admin", () => ({ firestore: () => ({}) }));

import { validateSettingsPatch } from "./admin";

describe("validateSettingsPatch", () => {
  it("accepts a valid patch", () => {
    const v = validateSettingsPatch({
      enabled: true,
      provider: "google",
      model: "gemini-2.5-flash",
      temperature: 0.5,
      dailyMessageQuota: 50,
    });
    expect(v.provider).toBe("google");
    expect(v.temperature).toBe(0.5);
  });

  it("rejects unknown provider", () => {
    expect(() => validateSettingsPatch({ provider: "bogus" })).toThrow();
  });

  it("clamps/rejects out-of-range numbers", () => {
    expect(() => validateSettingsPatch({ temperature: 5 })).toThrow();
    expect(() => validateSettingsPatch({ dailyMessageQuota: -1 })).toThrow();
  });
});

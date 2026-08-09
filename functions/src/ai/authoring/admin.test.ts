import { describe, it, expect, vi } from "vitest";

// admin.ts transitively imports ../../utils/roles, which calls admin.firestore()
// at module scope. Stub it so the module loads without an initialized Firebase
// app — validateAuthoringPatch is pure and touches neither Firestore nor the AI SDK.
vi.mock("firebase-admin", () => ({ firestore: () => ({}) }));

import { validateAuthoringPatch } from "./admin";

describe("validateAuthoringPatch", () => {
  it("accepts a valid patch", () => {
    const v = validateAuthoringPatch({
      enabled: true,
      provider: "google",
      model: "gemini-2.5-flash",
      temperature: 0.4,
      maxOutputTokens: 4096,
      dailyQuota: 20,
      recipeClientDailyQuota: 3,
      systemPromptOverride: "Be concise.",
    });
    expect(v.provider).toBe("google");
    expect(v.maxOutputTokens).toBe(4096);
    expect(v.dailyQuota).toBe(20);
    expect(v.recipeClientDailyQuota).toBe(3);
  });

  it("rejects unknown provider", () => {
    expect(() => validateAuthoringPatch({ provider: "bogus" })).toThrow();
  });

  it("rejects out-of-range numbers", () => {
    expect(() => validateAuthoringPatch({ temperature: 5 })).toThrow();
    expect(() => validateAuthoringPatch({ maxOutputTokens: 100 })).toThrow();
    expect(() => validateAuthoringPatch({ maxOutputTokens: 9000 })).toThrow();
    expect(() => validateAuthoringPatch({ dailyQuota: -1 })).toThrow();
    expect(() => validateAuthoringPatch({ dailyQuota: 1000 })).toThrow();
    expect(() => validateAuthoringPatch({ recipeClientDailyQuota: -1 })).toThrow();
    expect(() => validateAuthoringPatch({ recipeClientDailyQuota: 200 })).toThrow();
  });

  it("rejects an over-long systemPromptOverride", () => {
    expect(() => validateAuthoringPatch({ systemPromptOverride: "x".repeat(4001) })).toThrow();
  });
});

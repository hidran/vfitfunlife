import { describe, it, expect } from "vitest";
import { DEFAULT_AI_SETTINGS, mergeAiSettings } from "./settings";

describe("DEFAULT_AI_SETTINGS", () => {
  it("defaults to cheap Gemini Flash and is disabled by default", () => {
    expect(DEFAULT_AI_SETTINGS.provider).toBe("google");
    expect(DEFAULT_AI_SETTINGS.model).toBe("gemini-2.5-flash");
    expect(DEFAULT_AI_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_AI_SETTINGS.dailyMessageQuota).toBeGreaterThan(0);
    expect(DEFAULT_AI_SETTINGS.availableModels.google).toContain("gemini-2.5-flash");
  });
});

describe("mergeAiSettings", () => {
  it("fills missing fields from defaults but keeps stored values", () => {
    const merged = mergeAiSettings({ enabled: true, model: "gpt-4o-mini", provider: "openai" });
    expect(merged.enabled).toBe(true);
    expect(merged.provider).toBe("openai");
    expect(merged.model).toBe("gpt-4o-mini");
    expect(merged.temperature).toBe(DEFAULT_AI_SETTINGS.temperature);
  });

  it("preserves default provider lists when only one is overridden", () => {
    const merged = mergeAiSettings({ availableModels: { openai: ["gpt-4o"] } } as any);
    expect(merged.availableModels.openai).toEqual(["gpt-4o"]);
    expect(merged.availableModels.google).toEqual(DEFAULT_AI_SETTINGS.availableModels.google);
  });
});

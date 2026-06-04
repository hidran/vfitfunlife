import { describe, it, expect, beforeEach } from "vitest";
import { keyPresence, getProviderApiKey } from "./providers";

describe("keyPresence", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GENAI_API_KEY;
    delete process.env.OPENAI_COMPAT_API_KEY;
  });

  it("reports false for all providers when no keys set", () => {
    const p = keyPresence();
    expect(p.anthropic).toBe(false);
    expect(p.openai).toBe(false);
    expect(p.google).toBe(false);
    expect(p["openai-compatible"]).toBe(false);
  });

  it("reports true only for providers with a key", () => {
    process.env.GOOGLE_GENAI_API_KEY = "x";
    const p = keyPresence();
    expect(p.google).toBe(true);
    expect(p.openai).toBe(false);
  });
});

describe("getProviderApiKey", () => {
  it("throws a clear error when the active provider has no key", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getProviderApiKey("openai")).toThrow(/OPENAI_API_KEY/);
  });
});

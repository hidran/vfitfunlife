import { describe, it, expect, beforeEach } from "vitest";
import { keyPresence, getProviderApiKey, buildModel } from "./providers";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.OPENAI_COMPAT_API_KEY;
  delete process.env.OPENAI_COMPAT_BASE_URL;
});

describe("keyPresence", () => {
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

  it("returns the key when it is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(getProviderApiKey("openai")).toBe("sk-test");
  });
});

describe("buildModel", () => {
  it("throws when openai-compatible baseURL is missing", () => {
    process.env.OPENAI_COMPAT_API_KEY = "key";
    delete process.env.OPENAI_COMPAT_BASE_URL;
    expect(() => buildModel("openai-compatible", "llama3")).toThrow(/OPENAI_COMPAT_BASE_URL/);
  });
});

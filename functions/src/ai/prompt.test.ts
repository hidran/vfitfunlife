import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt";

describe("buildSystemPrompt", () => {
  it("includes scope, locale, date, and refusal instruction", () => {
    const p = buildSystemPrompt({ locale: "it", todayISO: "2026-06-04", city: "Torino" });
    expect(p).toMatch(/VFit|VFun|VLife/);
    expect(p).toContain("2026-06-04");
    expect(p).toContain("Torino");
    expect(p.toLowerCase()).toContain("italian"); // respond in user's language
    expect(p.toLowerCase()).toMatch(/decline|refuse|only/);
  });

  it("appends a superadmin override when provided", () => {
    const p = buildSystemPrompt({ locale: "en", todayISO: "2026-06-04", override: "Be extra concise." });
    expect(p).toContain("Be extra concise.");
  });
});

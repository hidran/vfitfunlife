import { describe, it, expect } from "vitest";
import { buildTrainingPrompt } from "./prompts";

const DISCLAIMER = "not medical advice";

describe("buildTrainingPrompt", () => {
  it("includes locale language, focus, goals, sessions, and disclaimer", () => {
    const prompt = buildTrainingPrompt({
      locale: "it",
      params: { focus: "upper body strength", durationWeeks: 4, daysPerWeek: 3, level: "beginner" },
      goals: [{ type: "muscle_gain", description: "build upper-body mass" }],
      recentSessions: ["Personal training session"],
    });
    expect(prompt).toContain("Italian");
    expect(prompt).toContain("upper body strength");
    expect(prompt).toContain("build upper-body mass");
    expect(prompt).toContain("Personal training session");
    expect(prompt).toContain(DISCLAIMER);
  });
});

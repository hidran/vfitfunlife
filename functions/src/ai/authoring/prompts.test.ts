import { describe, it, expect } from "vitest";
import { buildTrainingPrompt, buildDietPrompt, buildRecipePrompt } from "./prompts";

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

describe("buildDietPrompt", () => {
  it("includes locale language, restrictions, and disclaimer", () => {
    const prompt = buildDietPrompt({
      locale: "en",
      params: { durationDays: 7, mealsPerDay: 3, restrictions: "vegetarian, no nuts" },
      goals: [],
      recentSessions: [],
    });
    expect(prompt).toContain("English");
    expect(prompt).toContain("vegetarian, no nuts");
    expect(prompt).toContain(DISCLAIMER);
  });
});

describe("buildRecipePrompt", () => {
  it("includes locale language, constraints, and disclaimer", () => {
    const prompt = buildRecipePrompt({
      locale: "es",
      params: { servings: 2, constraints: "gluten free", mealType: "dinner" },
      goals: [],
      recentSessions: [],
    });
    expect(prompt).toContain("Spanish");
    expect(prompt).toContain("gluten free");
    expect(prompt).toContain(DISCLAIMER);
  });
});

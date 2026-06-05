import { describe, it, expect } from "vitest";
import {
  trainingProgramSchema,
  dietPlanSchema,
  recipeSchema,
  trainingParamsSchema,
  dietParamsSchema,
  recipeParamsSchema,
} from "./schemas";

describe("trainingProgramSchema", () => {
  const valid = {
    title: "Hypertrophy Base",
    durationWeeks: 4,
    daysPerWeek: 3,
    weeks: [
      {
        weekNumber: 1,
        days: [
          {
            label: "Day 1",
            focus: "Push",
            exercises: [{ name: "Bench Press", sets: 4, reps: "8-10", restSec: 90 }],
          },
        ],
      },
    ],
  };

  it("parses a valid training object", () => {
    expect(trainingProgramSchema.parse(valid)).toEqual(valid);
  });

  it("throws when title is missing", () => {
    const { title, ...rest } = valid;
    void title;
    expect(() => trainingProgramSchema.parse(rest)).toThrow();
  });
});

describe("dietPlanSchema", () => {
  it("parses a valid diet object", () => {
    const valid = {
      title: "Cutting Plan",
      durationDays: 7,
      targets: { kcal: 2000, protein: 150 },
      days: [
        { label: "Day 1", meals: [{ name: "Breakfast", items: [{ food: "Oats", quantity: "80g" }] }] },
      ],
    };
    expect(dietPlanSchema.parse(valid)).toEqual(valid);
  });
});

describe("recipeSchema", () => {
  it("parses a valid recipe object", () => {
    const valid = {
      title: "Protein Pancakes",
      servings: 2,
      ingredients: [{ item: "Oats", quantity: "100g" }],
      steps: ["Mix", "Cook"],
    };
    expect(recipeSchema.parse(valid)).toEqual(valid);
  });
});

describe("param schemas reject out-of-range values", () => {
  it("trainingParamsSchema rejects durationWeeks: 0", () => {
    expect(() => trainingParamsSchema.parse({ durationWeeks: 0, daysPerWeek: 3 })).toThrow();
  });

  it("trainingParamsSchema accepts a valid payload", () => {
    expect(trainingParamsSchema.parse({ durationWeeks: 8, daysPerWeek: 4, level: "intermediate" }))
      .toMatchObject({ durationWeeks: 8, daysPerWeek: 4, level: "intermediate" });
  });

  it("dietParamsSchema rejects mealsPerDay: 1", () => {
    expect(() => dietParamsSchema.parse({ durationDays: 7, mealsPerDay: 1 })).toThrow();
  });

  it("recipeParamsSchema rejects servings: 0", () => {
    expect(() => recipeParamsSchema.parse({ servings: 0 })).toThrow();
  });
});

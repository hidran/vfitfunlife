import { describe, it, expect } from "vitest";
import { trainingProgramSchema, trainingParamsSchema } from "./schemas";

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

describe("param schemas reject out-of-range values", () => {
  it("trainingParamsSchema rejects durationWeeks: 0", () => {
    expect(() => trainingParamsSchema.parse({ durationWeeks: 0, daysPerWeek: 3 })).toThrow();
  });

  it("trainingParamsSchema accepts a valid payload", () => {
    expect(trainingParamsSchema.parse({ durationWeeks: 8, daysPerWeek: 4, level: "intermediate" }))
      .toMatchObject({ durationWeeks: 8, daysPerWeek: 4, level: "intermediate" });
  });
});

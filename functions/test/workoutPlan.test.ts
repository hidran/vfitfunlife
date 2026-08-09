import { describe, it, expect } from "vitest";
import {
  candidateExercises,
  reconcileWithCatalog,
  workoutPlanParamsSchema,
  type RawWorkoutPlan,
  type WorkoutPlanParams,
} from "../src/ai/authoring/workoutPlan";
import { EXERCISE_CATALOG, exercisesFor } from "../src/exercises/catalog";

const base: WorkoutPlanParams = {
  goal: "tonificazione",
  level: "beginner",
  durationWeeks: 4,
  daysPerWeek: 3,
  equipment: ["bodyweight", "dumbbells", "mat", "bench", "barbell", "machine", "cable"],
};

function plan(exerciseIds: string[]): RawWorkoutPlan {
  return {
    title: "Test", goal: "tonificazione",
    weeks: [{
      weekNumber: 1,
      days: [{ label: "Giorno 1", exercises: exerciseIds.map((id) => ({ exerciseId: id, sets: 3, reps: "10" })) }],
    }],
  };
}

describe("catalog integrity", () => {
  it("has unique ids — a duplicate would make remapping ambiguous", () => {
    const ids = EXERCISE_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every exercise at least one equipment option", () => {
    for (const e of EXERCISE_CATALOG) expect(e.equipment.length).toBeGreaterThan(0);
  });

  it("gives every exercise Italian instructions — the pilot language", () => {
    for (const e of EXERCISE_CATALOG) expect(e.instructions.it.length).toBeGreaterThan(10);
  });
});

describe("injury filtering", () => {
  it("removes knee-contraindicated movements when a knee is flagged", () => {
    const safe = exercisesFor(["knee"]);
    expect(safe.some((e) => e.id === "bodyweight_squat")).toBe(false);
    expect(safe.some((e) => e.id === "burpee")).toBe(false);
    // Something non-loading for the knee must survive, or the plan cannot be built.
    expect(safe.some((e) => e.id === "seated_row_cable")).toBe(true);
  });

  it("removes lower-back-contraindicated movements when the back is flagged", () => {
    const safe = exercisesFor(["lower_back"]);
    expect(safe.some((e) => e.id === "deadlift")).toBe(false);
    expect(safe.some((e) => e.id === "romanian_deadlift")).toBe(false);
  });

  it("applies multiple injuries together", () => {
    const safe = exercisesFor(["knee", "shoulder"]);
    expect(safe.some((e) => e.id === "bodyweight_squat")).toBe(false);
    expect(safe.some((e) => e.id === "bench_press_bb")).toBe(false);
  });

  it("returns the whole catalog when nothing is flagged", () => {
    expect(exercisesFor([])).toHaveLength(EXERCISE_CATALOG.length);
  });
});

describe("candidateExercises", () => {
  it("keeps only what the available equipment supports", () => {
    const bodyweightOnly = candidateExercises({ ...base, equipment: ["bodyweight"] });
    expect(bodyweightOnly.every((e) => e.equipment.includes("bodyweight"))).toBe(true);
    expect(bodyweightOnly.some((e) => e.id === "bench_press_bb")).toBe(false);
    expect(bodyweightOnly.some((e) => e.id === "push_up")).toBe(true);
  });

  it("applies equipment and injury filtering together", () => {
    const c = candidateExercises({ ...base, equipment: ["bodyweight"], injuryAreas: ["knee"] });
    expect(c.some((e) => e.id === "bodyweight_squat")).toBe(false);
    expect(c.some((e) => e.id === "push_up")).toBe(true);
  });
});

describe("reconcileWithCatalog", () => {
  const candidates = candidateExercises(base);

  it("passes through ids that are already valid", () => {
    const r = reconcileWithCatalog(plan(["push_up", "goblet_squat"]), candidates);
    expect(r.plan.weeks[0].days[0].exercises.map((e) => e.exerciseId))
      .toEqual(["push_up", "goblet_squat"]);
    expect(r.dropped).toBe(0);
  });

  it("never persists an invented exercise", () => {
    const r = reconcileWithCatalog(plan(["hyper_mega_blaster_curl"]), candidates);
    const ids = r.plan.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    expect(ids).not.toContain("hyper_mega_blaster_curl");
    expect(r.unknown).toContain("hyper_mega_blaster_curl");
  });

  it("maps an invented id back by name when it matches a real exercise", () => {
    const r = reconcileWithCatalog(plan(["push up"]), candidates);
    expect(r.plan.weeks[0].days[0].exercises[0].exerciseId).toBe("push_up");
    expect(r.remapped).toBe(1);
  });

  it("remaps a known-but-excluded exercise to a safe alternative rather than smuggling it in", () => {
    // Knee flagged: the model still asks for squats. It must not survive as-is.
    const kneeCandidates = candidateExercises({ ...base, injuryAreas: ["knee"] });
    const r = reconcileWithCatalog(plan(["bodyweight_squat"]), kneeCandidates);
    const ids = r.plan.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    expect(ids).not.toContain("bodyweight_squat");
    for (const id of ids) {
      expect(kneeCandidates.some((c) => c.id === id)).toBe(true);
    }
  });

  it("drops a day that filtering emptied, rather than shipping an empty day", () => {
    const r = reconcileWithCatalog(plan(["totally_made_up"]), candidates);
    expect(r.plan.weeks).toHaveLength(0);
    expect(r.dropped).toBe(1);
  });

  it("preserves sets, reps and notes while remapping", () => {
    const p = plan(["push up"]);
    p.weeks[0].days[0].exercises[0].sets = 5;
    p.weeks[0].days[0].exercises[0].reps = "8-12";
    p.weeks[0].days[0].exercises[0].notes = "tempo lento";
    const r = reconcileWithCatalog(p, candidates);
    const e = r.plan.weeks[0].days[0].exercises[0];
    expect(e.sets).toBe(5);
    expect(e.reps).toBe("8-12");
    expect(e.notes).toBe("tempo lento");
  });
});

describe("anamnesi schema is non-medical", () => {
  it("accepts a valid form", () => {
    expect(workoutPlanParamsSchema.safeParse(base).success).toBe(true);
  });

  it("rejects unknown fields such as body weight or medical conditions", () => {
    // Zod strips unknown keys by default; assert they never reach the parsed output, so a
    // client cannot smuggle health data into the prompt.
    const parsed = workoutPlanParamsSchema.parse({
      ...base, weightKg: 82, condition: "diabete", bodyFat: 18,
    } as unknown as WorkoutPlanParams);
    expect('weightKg' in parsed).toBe(false);
    expect('condition' in parsed).toBe(false);
    expect('bodyFat' in parsed).toBe(false);
  });

  it("requires at least one equipment option", () => {
    expect(workoutPlanParamsSchema.safeParse({ ...base, equipment: [] }).success).toBe(false);
  });

  it("caps free-text injury notes", () => {
    const long = "x".repeat(600);
    expect(workoutPlanParamsSchema.safeParse({ ...base, injuryNotes: long }).success).toBe(false);
  });
});

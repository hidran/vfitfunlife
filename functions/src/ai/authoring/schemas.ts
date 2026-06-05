import { z } from "zod";

export const trainingProgramSchema = z.object({
  title: z.string(),
  durationWeeks: z.number().int().min(1).max(16),
  daysPerWeek: z.number().int().min(1).max(7),
  weeks: z.array(z.object({
    weekNumber: z.number().int(),
    days: z.array(z.object({
      label: z.string(),
      focus: z.string().optional(),
      exercises: z.array(z.object({
        name: z.string(), sets: z.number().int(), reps: z.string(),
        restSec: z.number().int().optional(), notes: z.string().optional(),
      })),
    })),
  })),
});

const macro = z.object({
  kcal: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
});

export const dietPlanSchema = z.object({
  title: z.string(),
  durationDays: z.number().int().min(1).max(30),
  targets: macro.optional(),
  days: z.array(z.object({
    label: z.string(),
    meals: z.array(z.object({
      name: z.string(), time: z.string().optional(),
      items: z.array(z.object({
        food: z.string(), quantity: z.string(),
        kcal: z.number().optional(), protein: z.number().optional(),
        carbs: z.number().optional(), fat: z.number().optional(),
      })),
    })),
  })),
});

export const recipeSchema = z.object({
  title: z.string(),
  servings: z.number().int().min(1).max(12),
  prepMinutes: z.number().int().optional(),
  cookMinutes: z.number().int().optional(),
  ingredients: z.array(z.object({ item: z.string(), quantity: z.string() })),
  steps: z.array(z.string()),
  nutrition: macro.optional(),
  tags: z.array(z.string()).optional(),
});

export const trainingParamsSchema = z.object({
  focus: z.string().optional(),
  durationWeeks: z.number().int().min(1).max(16),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  equipment: z.string().optional(),
  constraints: z.string().optional(),
});
export const dietParamsSchema = z.object({
  durationDays: z.number().int().min(1).max(30),
  kcalTarget: z.number().int().min(800).max(6000).optional(),
  mealsPerDay: z.number().int().min(2).max(6),
  restrictions: z.string().optional(),
  notes: z.string().optional(),
});
export const recipeParamsSchema = z.object({
  mealType: z.string().optional(),
  servings: z.number().int().min(1).max(12),
  constraints: z.string().optional(),
  targetMacros: macro.optional(),
  mustUse: z.string().optional(),
  avoid: z.string().optional(),
});

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

export const trainingParamsSchema = z.object({
  focus: z.string().optional(),
  durationWeeks: z.number().int().min(1).max(16),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  equipment: z.string().optional(),
  constraints: z.string().optional(),
});

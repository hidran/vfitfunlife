// src/types/clientPlans.ts (client) — mirrored server-side in functions/src/ai/authoring/schemas.ts
export type PlanSource = "ai" | "manual";
/**
 * P2-5: AI-generated plans always start as `draft` and must be published by a trainer.
 * `active` is retained for plans created before the draft/publish lifecycle existed.
 */
export type PlanStatus = "draft" | "published" | "active" | "archived";

/** Body areas a client can flag. Coarse and non-medical by design. */
export type InjuryArea = "knee" | "lower_back" | "shoulder" | "wrist" | "ankle" | "neck" | "hip";

export interface MacroTargets { kcal?: number; protein?: number; carbs?: number; fat?: number; }

export type GoalType = "weight_loss" | "muscle_gain" | "endurance" | "mobility" | "nutrition" | "other";
export type GoalStatus = "active" | "achieved" | "paused";
export interface ClientGoal {
  id: string;
  type: GoalType;
  description: string;
  targetValue?: number;
  unit?: string;
  targetDate?: string | null;   // ISO date string on the client; Timestamp in Firestore
  status: GoalStatus;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TrainingExercise {
  /** Present on P2-5 plans: references the shared /exercises library. Absent on legacy
   *  free-text plans, which is why `name` stays optional-but-supported. */
  exerciseId?: string;
  name?: string;
  sets: number;
  reps: string;
  restSec?: number;
  tempo?: string;
  loadNote?: string;
  notes?: string;
}

export interface Exercise {
  id: string;
  name: { it: string; en: string };
  primary: string;
  secondary?: string[];
  equipment: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  contraindicatedFor: InjuryArea[];
  instructions: { it: string };
  videoUrl?: string;
}

/** One client's record of actually doing a day. Written by the client, not the trainer. */
export interface PlanProgressEntry {
  id: string;
  planId: string;
  weekNumber: number;
  dayLabel: string;
  completedAt?: string;
  /** Per-exercise actuals, keyed by index within the day. */
  exercises: Record<string, {
    done: boolean;
    actualLoad?: string;
    actualReps?: string;
  }>;
  /** Rate of perceived exertion, 1-10. */
  rpe?: number;
  notes?: string;
}
export interface TrainingDay { label: string; focus?: string; exercises: TrainingExercise[]; }
export interface TrainingWeek { weekNumber: number; days: TrainingDay[]; }
export interface TrainingProgram {
  id: string;
  title: string;
  durationWeeks: number;
  daysPerWeek: number;
  weeks: TrainingWeek[];
  source: PlanSource;
  model?: string;
  status: PlanStatus;
  /** True for plans produced by generateWorkoutPlan. */
  generatedByAi?: boolean;
  /** The exact prompt used, kept for audit if a plan is ever questioned. */
  aiPromptSnapshot?: string;
  /** Set when the client flagged an injury: shown prominently in both apps. */
  medicalClearanceNote?: string | null;
  goal?: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DietItem { food: string; quantity: string; kcal?: number; protein?: number; carbs?: number; fat?: number; }
export interface DietMeal { name: string; time?: string; items: DietItem[]; }
export interface DietDay { label: string; meals: DietMeal[]; }
export interface DietPlan {
  id: string;
  title: string;
  durationDays: number;
  targets?: MacroTargets;
  days: DietDay[];
  source: PlanSource;
  model?: string;
  status: PlanStatus;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipeIngredient { item: string; quantity: string; }
export interface Recipe {
  id: string;
  title: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  nutrition?: MacroTargets;
  tags?: string[];
  source: PlanSource;
  model?: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

// AI generation params (provider-supplied)
export interface TrainingParams { focus?: string; durationWeeks: number; daysPerWeek: number; sessionMinutes?: number; level?: "beginner" | "intermediate" | "advanced"; equipment?: string; constraints?: string; }
export interface DietParams { durationDays: number; kcalTarget?: number; mealsPerDay: number; restrictions?: string; notes?: string; }
export interface RecipeParams { mealType?: string; servings: number; constraints?: string; targetMacros?: MacroTargets; mustUse?: string; avoid?: string; }

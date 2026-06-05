// src/types/clientPlans.ts (client) — mirrored server-side in functions/src/ai/authoring/schemas.ts
export type PlanSource = "ai" | "manual";
export type PlanStatus = "active" | "archived";

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

export interface TrainingExercise { name: string; sets: number; reps: string; restSec?: number; notes?: string; }
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

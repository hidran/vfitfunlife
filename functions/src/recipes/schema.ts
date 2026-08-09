/**
 * Recipe suggestion schemas — P2-6.
 *
 * Two things here are load-bearing for the legal constraint in the spec (§2):
 *  - `recipeParamsSchema` is `.strict()`, so kcalTarget/weightKg/condition/clientId are
 *    REJECTED, not stripped. A caller sending them is doing the forbidden thing on purpose.
 *  - `recipeBatchSchema` has no day, week, or per-person target field. A model instructed to
 *    produce a "dieta" physically cannot return one through this interface.
 */
import { z } from "zod";

export const DIET_STYLES = ["onnivora", "vegetariana", "vegana", "pescetariana"] as const;
export const EXCLUSIONS = ["glutine", "lattosio", "frutta_secca", "uova", "crostacei", "soia"] as const;
export const ORIENTATIONS = [
  "ricche_di_proteine", "piatti_leggeri", "piatto_unico",
  "colazione", "spuntino", "pre_allenamento", "post_allenamento",
] as const;
export const CUISINES = ["italiana", "mediterranea", "asiatica", "mediorientale", "messicana", "qualsiasi"] as const;
export const BUDGETS = ["economico", "medio", "qualsiasi"] as const;
export const MAX_PREP_MINUTES = [15, 30, 45, 60] as const;

export type DietStyle = (typeof DIET_STYLES)[number];
export type Exclusion = (typeof EXCLUSIONS)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type Cuisine = (typeof CUISINES)[number];
export type Budget = (typeof BUDGETS)[number];

/** Max length of one free-text ingredient entry. Also enforced by the regex in screening.ts. */
export const INGREDIENT_MAX_LENGTH = 30;
export const INGREDIENTS_MAX_ITEMS = 6;

export const recipeParamsSchema = z.object({
  count: z.number().int().min(1).max(3),
  servings: z.number().int().min(1).max(8),
  dietStyle: z.enum(DIET_STYLES),
  excludes: z.array(z.enum(EXCLUSIONS)).max(4).default([]),
  orientation: z.enum(ORIENTATIONS),
  cuisine: z.enum(CUISINES),
  maxPrepMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  budget: z.enum(BUDGETS),
  ingredientsOnHand: z.array(z.string()).max(INGREDIENTS_MAX_ITEMS).optional(),
}).strict();

export type RecipeParams = z.infer<typeof recipeParamsSchema>;

const nutritionPerServing = z.object({
  kcal: z.number().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
});

export const generatedRecipeSchema = z.object({
  title: z.string().min(3).max(120),
  servings: z.number().int().min(1).max(8),
  prepMinutes: z.number().int().min(1).max(180),
  cookMinutes: z.number().int().min(0).max(240).optional(),
  ingredients: z.array(z.object({
    item: z.string().min(1).max(80),
    quantity: z.string().min(1).max(40),
  })).min(2).max(20),
  steps: z.array(z.string().min(3).max(400)).min(2).max(15),
  nutritionPerServing: nutritionPerServing.optional(),
  tags: z.array(z.string().max(24)).max(6).optional(),
});

export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;

export const recipeBatchSchema = z.object({
  recipes: z.array(generatedRecipeSchema).min(1).max(3),
});

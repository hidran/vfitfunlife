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
  maxPrepMinutes: z.literal(MAX_PREP_MINUTES),
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

/**
 * The shape a recipe is STORED in. Enforced by `normalizeRecipe`, never by the model.
 *
 * These were once maxima on the generation schema, and that was a bug: `generateObject` is
 * all-or-nothing, so one recipe with a seventh tag threw away the entire batch — including
 * perfectly good recipes — and the user saw "generation failed". Observed in production on
 * 2026-08-10: gemini-2.5-flash returned 7 tags and a complete, correct recipe was discarded.
 *
 * The model is never told these numbers by the schema, only asked politely in the prompt, so
 * violations are the expected case rather than an edge case. Clamp, don't reject.
 */
export const RECIPE_LIMITS = {
  titleMax: 120,
  servingsMin: 1, servingsMax: 8,
  prepMax: 180, cookMax: 240,
  ingredientsMin: 2, ingredientsMax: 20, itemMax: 80, quantityMax: 40,
  stepsMin: 2, stepsMax: 15, stepMax: 400,
  tagsMax: 6, tagMax: 24,
} as const;

/**
 * The GENERATION schema. Structural only — which fields may exist, and their types.
 *
 * It carries no maximum of any kind, on purpose (see RECIPE_LIMITS). What it still guarantees
 * is the thing that matters legally: there is no day, no week, no per-person target field, and
 * Zod strips every key not listed here. A model instructed to produce a "dieta" cannot return
 * one through this interface no matter how permissive the ranges are.
 *
 * Numbers are coerced because a model that writes `"servings": "2"` is giving a usable answer
 * in a slightly wrong wrapper, and that is not worth failing a generation over.
 */
export const generatedRecipeSchema = z.object({
  title: z.string(),
  servings: z.coerce.number(),
  prepMinutes: z.coerce.number(),
  cookMinutes: z.coerce.number().optional(),
  ingredients: z.array(z.object({
    item: z.string(),
    quantity: z.string(),
  })).min(1),
  steps: z.array(z.string()).min(1),
  nutritionPerServing: nutritionPerServing.optional(),
  tags: z.array(z.string()).optional(),
});

export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;

/** A recipe that has passed `normalizeRecipe`: within RECIPE_LIMITS, `tags` always present. */
export type StoredRecipe = Omit<GeneratedRecipe, "tags"> & { tags: string[] };

/** No `.max()` here either — an over-long batch is sliced by `partitionRecipes`, not rejected. */
export const recipeBatchSchema = z.object({
  recipes: z.array(generatedRecipeSchema).min(1),
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Force one generated recipe into RECIPE_LIMITS.
 *
 * Returns null when the recipe cannot meet the quality FLOORS — fewer than two ingredients or
 * two steps, or no usable title. Those cannot be fixed by truncation, so the recipe is dropped
 * individually. Its siblings in the same batch survive, which is the entire point.
 *
 * Must run AFTER `screenRecipe`, so screening reads the model's full text rather than the
 * truncated version. Truncation must never be able to hide a term from the denylist.
 */
export function normalizeRecipe(raw: GeneratedRecipe): StoredRecipe | null {
  const L = RECIPE_LIMITS;

  const title = raw.title.trim().slice(0, L.titleMax);
  if (title.length < 3) return null;

  const ingredients = raw.ingredients
    .map((i) => ({
      item: i.item.trim().slice(0, L.itemMax),
      quantity: i.quantity.trim().slice(0, L.quantityMax),
    }))
    .filter((i) => i.item.length > 0)
    .slice(0, L.ingredientsMax);
  if (ingredients.length < L.ingredientsMin) return null;

  const steps = raw.steps
    .map((s) => s.trim().slice(0, L.stepMax))
    .filter((s) => s.length > 0)
    .slice(0, L.stepsMax);
  if (steps.length < L.stepsMin) return null;

  if (!Number.isFinite(raw.servings) || !Number.isFinite(raw.prepMinutes)) return null;

  return {
    title,
    servings: clamp(raw.servings, L.servingsMin, L.servingsMax),
    prepMinutes: clamp(raw.prepMinutes, 1, L.prepMax),
    ...(raw.cookMinutes !== undefined && Number.isFinite(raw.cookMinutes) ?
      { cookMinutes: clamp(raw.cookMinutes, 0, L.cookMax) } : {}),
    ingredients,
    steps,
    ...(raw.nutritionPerServing ? { nutritionPerServing: raw.nutritionPerServing } : {}),
    tags: (raw.tags ?? [])
      .map((t) => t.trim().slice(0, L.tagMax))
      .filter((t) => t.length > 0)
      .slice(0, L.tagsMax),
  };
}

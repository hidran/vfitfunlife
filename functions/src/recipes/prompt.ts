/**
 * The recipe prompt is a PURE FUNCTION of the enum selections plus the sanitized ingredient
 * list. It takes no client, no goals, no booking history, no name — unlike
 * `ai/authoring/prompts.ts`, which injects all of those. That difference is the feature.
 *
 * The prohibitions below are belt. The braces are `recipeBatchSchema` (which cannot express a
 * meal plan) and the absence of any clientId parameter on the callable.
 */
import { localeLanguage } from "../lib/locale";
import type { RecipeParams } from "./schema";

const DIET_STYLE_TEXT: Record<string, string> = {
  onnivora: "omnivore",
  vegetariana: "vegetarian",
  vegana: "vegan",
  pescetariana: "pescatarian",
};

const EXCLUSION_TEXT: Record<string, string> = {
  glutine: "gluten", lattosio: "lactose", frutta_secca: "nuts",
  uova: "eggs", crostacei: "shellfish", soia: "soy",
};

const ORIENTATION_TEXT: Record<string, string> = {
  ricche_di_proteine: "protein-rich dishes",
  piatti_leggeri: "light dishes",
  piatto_unico: "one-plate complete dishes",
  colazione: "breakfast dishes",
  spuntino: "snacks",
  pre_allenamento: "easily digestible dishes to eat before training",
  post_allenamento: "dishes to eat after training",
};

const CUISINE_TEXT: Record<string, string> = {
  italiana: "Italian", mediterranea: "Mediterranean", asiatica: "Asian",
  mediorientale: "Middle Eastern", messicana: "Mexican", qualsiasi: "any",
};

const BUDGET_TEXT: Record<string, string> = {
  economico: "low-cost, everyday supermarket ingredients",
  medio: "a moderate budget",
  qualsiasi: "any budget",
};

export interface RecipePromptContext {
  params: RecipeParams;
  /** Already validated by validateIngredients(). Never raw user text. */
  ingredients: string[];
  locale: string;
}

export function buildRecipesPrompt(ctx: RecipePromptContext): string {
  const { params, ingredients } = ctx;
  const excludes = (params.excludes ?? []).map((e) => EXCLUSION_TEXT[e] ?? e);

  return [
    "You are a cookbook author writing general, healthy recipes for a fitness app.",
    `Write the entire output in ${localeLanguage(ctx.locale)}.`,
    "",
    `Produce exactly ${params.count} distinct recipe(s) as JSON matching the provided schema.`,
    "",
    "Requested style:",
    `- Diet style: ${DIET_STYLE_TEXT[params.dietStyle] ?? params.dietStyle}`,
    excludes.length ?
      `- Avoid these ingredients as a matter of TASTE PREFERENCE, not health: ${excludes.join(", ")}` :
      "",
    `- Orientation: ${ORIENTATION_TEXT[params.orientation] ?? params.orientation}`,
    `- Cuisine: ${CUISINE_TEXT[params.cuisine] ?? params.cuisine}`,
    `- Maximum preparation time: ${params.maxPrepMinutes} minutes`,
    `- Budget: ${BUDGET_TEXT[params.budget] ?? params.budget}`,
    `- Servings: ${params.servings}`,
    ingredients.length ? `- Try to use these ingredients if they fit: ${ingredients.join(", ")}` : "",
    "",
    "Hard rules — output that breaks any of these is discarded:",
    "- Write GENERAL recipes. They are not addressed to any particular person.",
    "- Do NOT produce a meal plan, a daily or weekly schedule, or anything resembling a diet.",
    "- Do NOT state a calorie target for a person, or reference anyone's weight, body",
    "  measurements, or nutritional requirements.",
    "- Do NOT reference any medical condition, and do NOT claim a recipe treats, prevents,",
    "  or is indicated for one. No medical or therapeutic claims of any kind.",
    "- Treat every dietary exclusion as a preference. Never describe it as an intolerance,",
    "  an allergy, or a diagnosis.",
    "- Nutritional values, if given, are indicative and PER SERVING only.",
    "",
    // Asked for, not enforced here: the schema carries no maxima, because a violation used to
    // fail the whole batch. Anything over these limits is truncated after parsing, so the only
    // cost of ignoring them is a clipped recipe. Stating them keeps that rare.
    "Keep each recipe compact: at most 20 ingredients, at most 15 steps, one or two sentences",
    "per step, and at most 6 short tags.",
  ].filter((line) => line !== "").join("\n");
}

/** The two decisions in generateRecipes worth testing without a callable harness. */
import { screenRecipe } from "./screening";
import { normalizeRecipe } from "./schema";
import type { GeneratedRecipe, StoredRecipe } from "./schema";

export type OwnerRole = "provider" | "admin" | "client";

/**
 * Trainers and staff draw on the authoring quota; everyone else gets the lower client quota.
 * A client generating recipes for themselves is an intended use, not an exception.
 */
export function quotaForRole(
  role: string,
  settings: { dailyQuota: number; recipeClientDailyQuota: number },
): { quota: number; ownerRole: OwnerRole } {
  if (role === "provider") return { quota: settings.dailyQuota, ownerRole: "provider" };
  if (role === "admin" || role === "superadmin") return { quota: settings.dailyQuota, ownerRole: "admin" };
  return { quota: settings.recipeClientDailyQuota, ownerRole: "client" };
}

/**
 * Split a generated batch into what may be persisted and the reasons the rest were dropped.
 *
 * Three ways to lose a recipe, all per-recipe so a bad one never takes the batch with it:
 *  - it hits the output denylist (the reason recorded is the offending term)
 *  - it cannot be forced into RECIPE_LIMITS — "malformed"
 *  - the model returned more recipes than were asked for — "excess"
 *
 * ORDER MATTERS: screen the raw recipe, then normalize. Normalizing first would truncate the
 * text that screening reads, so a denied term sitting past a length limit would slip through.
 *
 * @param recipes - Parsed model output.
 * @param limit - How many recipes were actually requested. Extras are dropped, not an error.
 */
export function partitionRecipes(recipes: GeneratedRecipe[], limit?: number): {
  kept: StoredRecipe[]; dropped: string[];
} {
  const kept: StoredRecipe[] = [];
  const dropped: string[] = [];
  for (const recipe of recipes) {
    const hit = screenRecipe(recipe);
    if (hit) {
      dropped.push(hit);
      continue;
    }
    const normalized = normalizeRecipe(recipe);
    if (!normalized) {
      dropped.push("malformed");
      continue;
    }
    if (limit !== undefined && kept.length >= limit) {
      dropped.push("excess");
      continue;
    }
    kept.push(normalized);
  }
  return { kept, dropped };
}

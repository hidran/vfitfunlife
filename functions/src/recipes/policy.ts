/** The two decisions in generateRecipes worth testing without a callable harness. */
import { screenRecipe } from "./screening";
import type { GeneratedRecipe } from "./schema";

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

/** Split a generated batch into what may be persisted and the terms that got the rest dropped. */
export function partitionRecipes(recipes: GeneratedRecipe[]): {
  kept: GeneratedRecipe[]; dropped: string[];
} {
  const kept: GeneratedRecipe[] = [];
  const dropped: string[] = [];
  for (const recipe of recipes) {
    const hit = screenRecipe(recipe);
    if (hit) dropped.push(hit);
    else kept.push(recipe);
  }
  return { kept, dropped };
}

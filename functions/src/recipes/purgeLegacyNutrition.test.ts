import { describe, it, expect, vi } from "vitest";

// purgeLegacyNutrition transitively imports ../utils/roles, which calls admin.firestore()
// at module scope. Stub it so the module loads without an initialized Firebase app —
// isLegacyNutritionPath is pure and touches neither Firestore nor Storage.
vi.mock("firebase-admin", () => ({ firestore: () => ({}) }));

import { isLegacyNutritionPath } from "./purgeLegacyNutrition";

describe("isLegacyNutritionPath", () => {
  // The reason this function exists. collectionGroup("recipes") matches the top-level
  // `recipes` collection that P2-6 created; purging those would destroy the feature's own
  // data. If this test ever fails, the purge callable is deleting live recipes.
  it("never matches a top-level recipes document", () => {
    expect(isLegacyNutritionPath("recipes/abc123")).toBe(false);
    expect(isLegacyNutritionPath("recipes/abc123/revisions/v1")).toBe(false);
  });

  it("matches per-client legacy nutrition documents", () => {
    expect(isLegacyNutritionPath("clients/c1/recipes/r1")).toBe(true);
    expect(isLegacyNutritionPath("clients/c1/dietPlans/p1")).toBe(true);
  });

  it("does not match a collection whose name merely starts with 'clients'", () => {
    expect(isLegacyNutritionPath("clientsArchive/c1/recipes/r1")).toBe(false);
  });

  it("does not match recipes nested under any other root collection", () => {
    expect(isLegacyNutritionPath("users/u1/recipes/r1")).toBe(false);
    expect(isLegacyNutritionPath("providers/p1/recipes/r1")).toBe(false);
  });
});

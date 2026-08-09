import { describe, it, expect } from "vitest";
import { recipeParamsSchema, recipeBatchSchema } from "../src/recipes/schema";

const validParams = {
  count: 2,
  servings: 2,
  dietStyle: "onnivora",
  excludes: ["lattosio"],
  orientation: "ricche_di_proteine",
  cuisine: "italiana",
  maxPrepMinutes: 30,
  budget: "medio",
};

describe("recipeParamsSchema", () => {
  it("accepts a valid params object", () => {
    expect(recipeParamsSchema.parse(validParams).count).toBe(2);
  });

  it("REJECTS unknown fields rather than stripping them", () => {
    // P2-5 stripped unknown keys because a stray key was probably noise. Here a caller
    // sending kcalTarget is attempting the forbidden thing on purpose. Spec §7.3.
    for (const bad of [
      { kcalTarget: 1500 },
      { weightKg: 82 },
      { condition: "diabete" },
      { clientId: "demo-client-1" },
      { measurements: { waist: 90 } },
    ]) {
      expect(() => recipeParamsSchema.parse({ ...validParams, ...bad })).toThrow();
    }
  });

  it("rejects out-of-range count and servings", () => {
    expect(() => recipeParamsSchema.parse({ ...validParams, count: 0 })).toThrow();
    expect(() => recipeParamsSchema.parse({ ...validParams, count: 4 })).toThrow();
    expect(() => recipeParamsSchema.parse({ ...validParams, servings: 9 })).toThrow();
  });

  it("rejects values outside the enums", () => {
    expect(() => recipeParamsSchema.parse({ ...validParams, dietStyle: "chetogenica" })).toThrow();
    expect(() => recipeParamsSchema.parse({ ...validParams, maxPrepMinutes: 20 })).toThrow();
    expect(() => recipeParamsSchema.parse({ ...validParams, excludes: ["zucchero"] })).toThrow();
  });

  it("caps excludes at four", () => {
    expect(() => recipeParamsSchema.parse({
      ...validParams,
      excludes: ["glutine", "lattosio", "uova", "soia", "crostacei"],
    })).toThrow();
  });
});

describe("recipeBatchSchema", () => {
  const recipe = {
    title: "Pollo al limone",
    servings: 2,
    prepMinutes: 15,
    ingredients: [{ item: "pollo", quantity: "300 g" }, { item: "limone", quantity: "1" }],
    steps: ["Marinare il pollo.", "Cuocere 15 minuti."],
  };

  it("accepts a batch of recipes", () => {
    expect(recipeBatchSchema.parse({ recipes: [recipe] }).recipes).toHaveLength(1);
  });

  it("has no field that can express a diet plan", () => {
    // The structural guardrail: a model told to return a meal plan cannot do so
    // through this interface. Spec §8.5.
    const parsed = recipeBatchSchema.parse({
      recipes: [{ ...recipe, days: [{ label: "Giorno 1" }], kcalTarget: 1500, durationDays: 7 }],
    });
    expect(parsed.recipes[0]).not.toHaveProperty("days");
    expect(parsed.recipes[0]).not.toHaveProperty("kcalTarget");
    expect(parsed.recipes[0]).not.toHaveProperty("durationDays");
  });

  it("rejects a batch of more than three", () => {
    expect(() => recipeBatchSchema.parse({ recipes: [recipe, recipe, recipe, recipe] })).toThrow();
  });
});

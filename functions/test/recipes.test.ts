import { describe, it, expect } from "vitest";
import { recipeParamsSchema, recipeBatchSchema } from "../src/recipes/schema";
import {
  validateIngredients, screenRecipe, ForbiddenInputError,
} from "../src/recipes/screening";
import { buildRecipesPrompt } from "../src/recipes/prompt";

/** U+0300 COMBINING GRAVE ACCENT, as an escape so it survives any reformatting. */
const COMBINING_GRAVE = "\u0300";

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

describe("validateIngredients (input)", () => {
  it("accepts ordinary ingredients", () => {
    expect(validateIngredients(["pollo", "zucchine", "olio d'oliva", "basilico"]))
      .toEqual(["pollo", "zucchine", "olio d'oliva", "basilico"]);
  });

  it("accepts undefined and empty", () => {
    expect(validateIngredients(undefined)).toEqual([]);
    expect(validateIngredients([])).toEqual([]);
  });

  it("rejects ANY digit, which is what kills numeric smuggling", () => {
    for (const bad of ["1500 kcal", "80 kg", "2000", "pollo 300g"]) {
      expect(() => validateIngredients([bad])).toThrow(ForbiddenInputError);
    }
  });

  it("rejects clinical and weight-loss terms, case- and accent-insensitively", () => {
    for (const bad of [
      "diabete", "Diabète", "DIABETICI", "per diabetici", "ipertensione",
      "dimagrire", "perdere peso", "deficit calorico", "dieta", "colesterolo",
      "gravidanza", "weight loss", "diabetes",
    ]) {
      expect(() => validateIngredients([bad])).toThrow(ForbiddenInputError);
    }
  });

  it("rejects over-long entries and too many entries, distinguishably", () => {
    // The UI has to explain which rule was broken, so "too long" must not surface as
    // "invalid characters".
    expect(() => validateIngredients(["x".repeat(31)])).toThrow(/forbidden-input:too-long/);
    expect(() => validateIngredients(new Array(7).fill("pollo")))
      .toThrow(/forbidden-input:too-many-items/);
  });

  it("accepts a decomposed (NFD) accented ingredient, as iOS and macOS may send it", () => {
    // Built from an escape rather than a pasted character: a literal combining mark here is
    // invisible and any editor that normalizes the file would silently defeat the test.
    const nfd = "ragu" + COMBINING_GRAVE;
    expect(nfd).toHaveLength(5);
    expect(validateIngredients([nfd])).toEqual([nfd.normalize("NFC")]);
  });

  it("trims and drops blanks", () => {
    expect(validateIngredients(["  pollo  ", "", "   "])).toEqual(["pollo"]);
  });
});

describe("screenRecipe (output)", () => {
  const base = {
    title: "Pollo al limone",
    servings: 2,
    prepMinutes: 15,
    ingredients: [{ item: "pollo", quantity: "300 g" }, { item: "limone", quantity: "1" }],
    steps: ["Marinare il pollo.", "Cuocere 15 minuti."],
  };

  it("keeps a normal recipe", () => {
    expect(screenRecipe(base)).toBeNull();
  });

  it("does NOT reuse the input denylist — permitted content survives", () => {
    // Spec §8.4: nutrition per portion is legal, and `mediterranea` is an offered cuisine.
    expect(screenRecipe({
      ...base,
      steps: [...base.steps, "Un piatto tipico della dieta mediterranea."],
      tags: ["300 calorie a porzione", "ricca di proteine"],
    })).toBeNull();
  });

  it("allows named eating styles, deliberately", () => {
    expect(screenRecipe({ ...base, tags: ["perfetta per la dieta chetogenica"] })).toBeNull();
  });

  it("drops a recipe naming a medical condition", () => {
    expect(screenRecipe({ ...base, steps: [...base.steps, "Indicato per chi soffre di diabete."] }))
      .toBe("diabet");
  });

  it("drops a recipe that prescribes to a person", () => {
    for (const bad of [
      "Calcolato sul tuo fabbisogno calorico.",
      "Ideale per il tuo deficit calorico.",
      "Parte del tuo piano alimentare settimanale.",
      "Perfetta per dimagrire.",
    ]) {
      expect(screenRecipe({ ...base, steps: [...base.steps, bad] })).not.toBeNull();
    }
  });

  it("keeps ordinary cooking idioms — the reason `cura per` is not on the list", () => {
    // "cura per" substring-matched all of these. Word boundaries would not have helped:
    // the boundaries in "con cura per" are real.
    for (const ok of [
      "Mescolare con cura per 5 minuti.",
      "Insaporire con cura per esaltare i sapori.",
      "Una ricetta sicura per i bambini.",
    ]) {
      expect(screenRecipe({ ...base, steps: [...base.steps, ok] })).toBeNull();
    }
  });

  it("drops the diagnosis framing of an exclusion but keeps the plain exclusion", () => {
    // Spec §7.1: an exclusion is a taste preference. Calling it an intolerance is the
    // medical claim the whole feature is shaped to avoid.
    expect(screenRecipe({
      ...base,
      steps: [...base.steps, "Adatta a chi ha una intolleranza al lattosio."],
    })).not.toBeNull();
    expect(screenRecipe({ ...base, tags: ["senza lattosio"] })).toBeNull();
    expect(screenRecipe({
      ...base,
      steps: [...base.steps, "Adatta a chi segue una dieta vegetariana."],
    })).toBeNull();
  });

  it("screens ingredient quantities, where a model can also put prose", () => {
    expect(screenRecipe({
      ...base,
      ingredients: [{ item: "riso", quantity: "1 dose terapeutica" }, ...base.ingredients],
    })).not.toBeNull();
  });

  it("screens the title and ingredient names too, not only the steps", () => {
    expect(screenRecipe({ ...base, title: "Ricetta per ipertensione" })).not.toBeNull();
    expect(screenRecipe({
      ...base,
      ingredients: [{ item: "integratore terapeutico", quantity: "1" }, { item: "riso", quantity: "80 g" }],
    })).not.toBeNull();
  });
});

describe("buildRecipesPrompt", () => {
  const params = {
    count: 2, servings: 4, dietStyle: "vegetariana" as const,
    excludes: ["lattosio" as const], orientation: "piatti_leggeri" as const,
    cuisine: "mediterranea" as const, maxPrepMinutes: 30 as const, budget: "economico" as const,
  };

  it("renders the enum selections as natural language", () => {
    // Per LINE, not per prompt: a bare toContain("2") passes even when count and servings
    // are rendered into each other's lines, which is the mistake worth catching here.
    const prompt = buildRecipesPrompt({ params, ingredients: [], locale: "it" });
    const line = (prefix: string) => prompt.split("\n").find((l) => l.startsWith(prefix));
    expect(prompt).toContain("Italian");
    expect(line("Produce exactly")).toContain("2 distinct recipe(s)");
    expect(line("- Diet style:")).toContain("vegetarian");
    expect(line("- Maximum preparation time:")).toContain("30 minutes");
    expect(line("- Servings:")).toContain("4");
  });

  it("includes sanitized ingredients when present", () => {
    const prompt = buildRecipesPrompt({ params, ingredients: ["pollo", "zucchine"], locale: "it" });
    expect(prompt).toContain("pollo");
    expect(prompt).toContain("zucchine");
  });

  it("states the prohibitions explicitly", () => {
    const prompt = buildRecipesPrompt({ params, ingredients: [], locale: "it" });
    expect(prompt.toLowerCase()).toContain("meal plan");
    expect(prompt.toLowerCase()).toContain("medical");
    expect(prompt.toLowerCase()).toContain("preference");
  });

  it("frames the exclusion list as a taste preference, not a health matter", () => {
    // Assert on the exclusion LINE, not on the whole prompt: the hard-rules block
    // legitimately contains the words "intolerance" and "allergy" while forbidding them
    // as framings. A whole-prompt `not.toContain` would force deleting that rule.
    const line = buildRecipesPrompt({ params, ingredients: [], locale: "it" })
      .split("\n").find((l) => l.includes("lactose"));
    expect(line).toContain("TASTE PREFERENCE");
    expect(line).not.toContain("intolerance");
  });
});

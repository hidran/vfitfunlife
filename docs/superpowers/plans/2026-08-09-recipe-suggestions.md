# P2-6 Recipe Suggestions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship AI-generated *generic recipe suggestions* that a trainer keeps in a private library and shares with named clients, and remove diet plans from the platform entirely.

**Architecture:** A new `functions/src/recipes/` module, deliberately independent of `functions/src/ai/authoring/`. Guardrails are structural: the callable has no `clientId` parameter, the output schema has no field that can hold a day or a per-person calorie target, and the single free-text input rejects digits outright. Recipes live in a new top-level `recipes` collection keyed by `ownerUid`, with read access granted through `sharedWithUserIds`.

**Tech Stack:** Firebase Cloud Functions v2 (Node 24, `europe-west1`), Vercel AI SDK `generateObject`, Zod, Firestore, Next.js App Router (static export), Tailwind v4, Vitest, `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-08-09-recipe-suggestions-design.md` — read §2 and §6.4 before starting. The legal constraint is not decoration; it is why several things are shaped oddly.

---

## Ground rules for every task

- Run `cd functions && npm test` for backend tasks, `npm test` at the repo root for frontend/i18n tasks.
- Commit after each task. Never bundle two tasks into one commit.
- Do not add features the spec's Non-Goals section excludes (§4).
- Italian is the source locale. `src/i18n/messages/it.ts` defines the key set; the other four must match exactly or `completeness.test.ts` fails.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `functions/src/lib/locale.ts` | `localeLanguage()` shared by the authoring and recipes prompt builders |
| `functions/src/recipes/schema.ts` | Enums, `.strict()` params schema, output batch schema |
| `functions/src/recipes/screening.ts` | Text normalization, input denylist, output denylist, `screenRecipe()` |
| `functions/src/recipes/prompt.ts` | `buildRecipesPrompt()` — pure function of enums + sanitized ingredients |
| `functions/src/recipes/generateRecipes.ts` | The callable |
| `functions/src/recipes/purgeLegacyNutrition.ts` | Superadmin export-then-delete callable |
| `functions/test/recipes.test.ts` | Domain tests |
| `functions/test/recipes-rules.test.ts` | Firestore rules tests (emulator) |
| `src/types/recipes.ts` | Client-side `Recipe`, enums, params |
| `src/lib/firebase/recipes.ts` | Queries, CRUD, share, callable wrapper |
| `src/app/(main)/provider/recipes/page.tsx` + `RecipesLibraryClient.tsx` | Trainer library |
| `src/components/recipes/RecipeGenerateModal.tsx` | The enum form, shared by both apps |
| `src/components/recipes/RecipeCard.tsx` | Card + expandable detail, shared by both apps |
| `src/components/recipes/RecipeDisclaimer.tsx` | The fixed legal banner |
| `src/components/recipes/ShareRecipeModal.tsx` | Trainer-only share picker |
| `src/app/(main)/recipes/page.tsx` + `RecipesClient.tsx` | Client-facing page |

**Modified:** `functions/src/ai/authoring/{schemas,prompts,generate,settings,admin}.ts`, their tests, `functions/src/lib/audit.ts`, `functions/src/index.ts`, `firestore.rules`, `firestore.indexes.json`, `src/types/clientPlans.ts`, `src/lib/firebase/{clientPlans,functions}.ts`, `src/app/(main)/provider/clients/detail/ClientDetailClient.tsx`, `.../tabs/RecipesTab.tsx`, `.../tabs/editors/RecipeEditor.tsx`, `src/components/layout/SideDrawer.tsx`, `src/i18n/messages/*.ts`, `src/app/admin/settings/page.tsx`, three docs.

**Deleted:** `.../tabs/DietTab.tsx`, `.../tabs/editors/DietPlanEditor.tsx`.

---

## Task 1: Shared locale helper

Extracting `localeLanguage` first so the recipes module never has to import from `ai/authoring`.

**Files:**
- Create: `functions/src/lib/locale.ts`
- Modify: `functions/src/ai/authoring/prompts.ts`

- [ ] **Step 1: Create the shared helper**

```ts
// functions/src/lib/locale.ts
const LOCALE_LANGUAGE: Record<string, string> = {
  it: "Italian",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
};

/** Map a locale code to a human-readable language name (falls back to the raw code). */
export function localeLanguage(locale: string): string {
  return LOCALE_LANGUAGE[locale] ?? locale;
}
```

- [ ] **Step 2: Re-export from the authoring prompts module**

In `functions/src/ai/authoring/prompts.ts`, delete the local `LOCALE_LANGUAGE` const and the `localeLanguage` function body, and replace with:

```ts
import { localeLanguage } from "../../lib/locale";
export { localeLanguage };
```

- [ ] **Step 3: Verify nothing broke**

Run: `cd functions && npm test`
Expected: PASS, same test count as before.

- [ ] **Step 4: Commit**

```bash
git add functions/src/lib/locale.ts functions/src/ai/authoring/prompts.ts
git commit -m "refactor(functions): extract localeLanguage to lib/locale"
```

---

## Task 2: Recipe schema and enums

**Files:**
- Create: `functions/src/recipes/schema.ts`
- Test: `functions/test/recipes.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// functions/test/recipes.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/recipes.test.ts`
Expected: FAIL — cannot resolve `../src/recipes/schema`.

- [ ] **Step 3: Implement the schema**

```ts
// functions/src/recipes/schema.ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd functions && npx vitest run test/recipes.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add functions/src/recipes/schema.ts functions/test/recipes.test.ts
git commit -m "feat(recipes): params and output schemas with structural guardrails"
```

---

## Task 3: Input and output screening

**The two denylists are different on purpose.** The input list bans `kcal`, `calorie` and `dieta`; the output list must not, because nutrition per portion is permitted content and `dieta mediterranea` is ordinary food writing. Getting this wrong turns correct generations into errors. Spec §7.2 and §8.4.

**Files:**
- Create: `functions/src/recipes/screening.ts`
- Test: `functions/test/recipes.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `functions/test/recipes.test.ts`:

```ts
import {
  validateIngredients, screenRecipe, ForbiddenInputError,
} from "../src/recipes/screening";

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

  it("rejects over-long entries and too many entries", () => {
    expect(() => validateIngredients(["x".repeat(31)])).toThrow(ForbiddenInputError);
    expect(() => validateIngredients(new Array(7).fill("pollo"))).toThrow(ForbiddenInputError);
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

  it("screens the title and ingredient names too, not only the steps", () => {
    expect(screenRecipe({ ...base, title: "Ricetta per ipertensione" })).not.toBeNull();
    expect(screenRecipe({
      ...base,
      ingredients: [{ item: "integratore terapeutico", quantity: "1" }, { item: "riso", quantity: "80 g" }],
    })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/recipes.test.ts`
Expected: FAIL — cannot resolve `../src/recipes/screening`.

- [ ] **Step 3: Implement screening**

```ts
// functions/src/recipes/screening.ts
/**
 * Text guardrails for recipe generation — P2-6, spec §7.2 and §8.4.
 *
 * TWO SEPARATE LISTS, TUNED DIFFERENTLY. Do not merge them.
 *
 * INPUT (`validateIngredients`) is strict: it bans kcal/calorie/dieta/dimagrire, because in a
 * request those words signal "write me a diet". It also rejects every digit, which kills
 * "1500 kcal" and "80 kg" without enumerating them.
 *
 * OUTPUT (`screenRecipe`) is narrower: nutrition per portion is permitted content (spec §2)
 * and `cuisine: mediterranea` is an offered enum, so "tipico della dieta mediterranea" and
 * "circa 300 calorie a porzione" MUST survive. Reusing the input list here would drop
 * ordinary recipes and turn a correct generation into `generation-unusable`.
 *
 * Both lists are the THIRD line of defence. The first is that no clientId exists anywhere in
 * this module; the second is an output schema that cannot hold a diet plan.
 */
import { INGREDIENT_MAX_LENGTH, INGREDIENTS_MAX_ITEMS } from "./schema";

export class ForbiddenInputError extends Error {
  constructor(public readonly term: string) {
    super(`forbidden-input:${term}`);
    this.name = "ForbiddenInputError";
  }
}

/** Lowercase and strip diacritics, so `Diabète` and `DIABETICI` match `diabet`. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Terms banned in a generation REQUEST. Substring match against normalized text. */
export const INPUT_DENYLIST = [
  // conditions
  "diabet", "ipertens", "colesterol", "tiroid", "celiac", "gastrit", "reflusso", "ulcera",
  "gravidanza", "incinta", "allattamento", "menopaus", "anoress", "bulim", "obes",
  "tumor", "oncolog", "renale", "epatic", "intolleran", "allerg", "patolog", "malatt", "farmac",
  // weight and regimes
  "dimagr", "ingrassare", "perdere peso", "massa grassa", "deficit calorico",
  "chetogenic", "keto", "digiuno", "bmi", "kcal", "calorie", "caloric", "dieta",
  // english
  "diet", "weight loss", "diabetes", "hypertension", "cholesterol", "pregnan",
  "allergy", "intolerance",
];

/**
 * Terms banned in generated OUTPUT. Narrower than INPUT_DENYLIST by design — see the module
 * comment. Bare `dieta`, `kcal`, `calorie` and `proteine` are ALLOWED here.
 *
 * Named protocols (`chetogenica`, `keto`, `digiuno`, `bmi`) are deliberately NOT screened:
 * describing a recipe as suiting a known eating style is food writing, whereas asking for one
 * on those terms is a request for a regime and is blocked on input. Anything that crosses into
 * prescription is caught by the per-person and clinical entries below regardless of the
 * protocol it names.
 */
export const OUTPUT_DENYLIST = [
  // medical conditions
  "diabet", "ipertens", "colesterol", "tiroid", "celiac", "gastrit", "reflusso", "ulcera",
  "tumor", "oncolog", "insufficienza renale", "epatic", "gravidanza", "allattamento",
  "menopaus", "anoress", "bulim", "obes", "patolog",
  "diabetes", "hypertension", "cholesterol",
  // per-person prescription
  "dieta personalizzata", "piano alimentare", "la tua dieta", "il tuo fabbisogno",
  "fabbisogno calorico", "deficit calorico", "dieta dimagrante", "per dimagrire",
  "perdere peso", "weight loss", "meal plan",
  // clinical framing
  "prescriv", "terapia", "terapeutic", "cura per", "indicato per chi soffre",
  "consigliato in caso di",
];

/** Letters, spaces, apostrophes and hyphens only. No digits, at all, ever. */
const INGREDIENT_PATTERN = new RegExp(`^[\\p{L}][\\p{L}\\s'’-]{1,${INGREDIENT_MAX_LENGTH - 1}}$`, "u");

/**
 * Validate the only free-text input this feature accepts.
 * Throws ForbiddenInputError — callers MUST call this before reserving quota, so a rejected
 * attempt costs the user nothing.
 */
export function validateIngredients(raw: string[] | undefined): string[] {
  const items = (raw ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  if (items.length > INGREDIENTS_MAX_ITEMS) throw new ForbiddenInputError("too-many-items");

  for (const item of items) {
    if (!INGREDIENT_PATTERN.test(item)) throw new ForbiddenInputError("invalid-characters");
    const normalized = normalize(item);
    const hit = INPUT_DENYLIST.find((term) => normalized.includes(term));
    if (hit) throw new ForbiddenInputError(hit);
  }
  return items;
}

interface ScreenableRecipe {
  title: string;
  steps: string[];
  tags?: string[];
  ingredients: { item: string; quantity: string }[];
}

/**
 * Screen one generated recipe. Returns the offending term, or null if the recipe is clean.
 * The caller drops matches rather than editing them — a recipe that needed editing to be
 * legal was not a recipe.
 */
export function screenRecipe(recipe: ScreenableRecipe): string | null {
  const haystack = normalize([
    recipe.title,
    ...recipe.steps,
    ...(recipe.tags ?? []),
    ...recipe.ingredients.map((i) => i.item),
  ].join(" \n "));

  return OUTPUT_DENYLIST.find((term) => haystack.includes(term)) ?? null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd functions && npx vitest run test/recipes.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add functions/src/recipes/screening.ts functions/test/recipes.test.ts
git commit -m "feat(recipes): input and output screening as two separate denylists"
```

---

## Task 4: Prompt builder

**Files:**
- Create: `functions/src/recipes/prompt.ts`
- Test: `functions/test/recipes.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

```ts
import { buildRecipesPrompt } from "../src/recipes/prompt";

describe("buildRecipesPrompt", () => {
  const params = {
    count: 2, servings: 4, dietStyle: "vegetariana" as const,
    excludes: ["lattosio" as const], orientation: "piatti_leggeri" as const,
    cuisine: "mediterranea" as const, maxPrepMinutes: 30 as const, budget: "economico" as const,
  };

  it("renders the enum selections as natural language", () => {
    const prompt = buildRecipesPrompt({ params, ingredients: [], locale: "it" });
    expect(prompt).toContain("Italian");
    expect(prompt).toContain("2");
    expect(prompt).toContain("vegetarian");
    expect(prompt).toContain("30");
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

  it("frames exclusions as preferences, never as intolerances", () => {
    const prompt = buildRecipesPrompt({ params, ingredients: [], locale: "it" }).toLowerCase();
    expect(prompt).not.toContain("intolerance");
    expect(prompt).not.toContain("allergy");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/recipes.test.ts`
Expected: FAIL — cannot resolve `../src/recipes/prompt`.

- [ ] **Step 3: Implement**

```ts
// functions/src/recipes/prompt.ts
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
  ].filter((line) => line !== "").join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd functions && npx vitest run test/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/recipes/prompt.ts functions/test/recipes.test.ts
git commit -m "feat(recipes): prompt builder with no client context"
```

---

## Task 5: Settings field and audit type

**Files:**
- Modify: `functions/src/ai/authoring/settings.ts`, `functions/src/ai/authoring/admin.ts`, `functions/src/ai/authoring/admin.test.ts`, `functions/src/lib/audit.ts`, `src/lib/firebase/functions.ts`, `src/app/admin/settings/page.tsx`

**Spec §8.2 warns this fails silently if any of the four places is missed.** `patchSchema` is a plain `z.object`, which strips unknown keys, and the client mirrors the interface rather than importing it.

- [ ] **Step 1: Add the field to the server settings**

`functions/src/ai/authoring/settings.ts`: add `recipeClientDailyQuota: number;` to the interface and `recipeClientDailyQuota: 3,` to `DEFAULT_AI_AUTHORING_SETTINGS`.

- [ ] **Step 2: Add it to the admin patch schema**

`functions/src/ai/authoring/admin.ts`, inside `patchSchema`:

```ts
  recipeClientDailyQuota: z.number().int().min(0).max(100).optional(),
```

- [ ] **Step 3: Add the test case**

In `functions/src/ai/authoring/admin.test.ts`, add to the "rejects out-of-range numbers" test:

```ts
    expect(() => validateAuthoringPatch({ recipeClientDailyQuota: -1 })).toThrow();
    expect(() => validateAuthoringPatch({ recipeClientDailyQuota: 200 })).toThrow();
```

and to the valid-patch test, pass `recipeClientDailyQuota: 3` and assert it survives.

- [ ] **Step 4: Widen the audit types**

`functions/src/lib/audit.ts`: add `"recipe"` to the `entityType` union, and widen `actorRole` to `"admin" | "superadmin" | "provider" | "client"`. A client generating their own recipe is a real actor and logging them as "admin" would be a lie.

- [ ] **Step 5: Mirror the setting client-side**

`src/lib/firebase/functions.ts:377` — add `recipeClientDailyQuota: number;` to the mirrored `AiAuthoringSettings` interface. Then add the input to `src/app/admin/settings/page.tsx` next to the existing `dailyQuota` field, labelled with a new i18n key `admin.aiAuthoring.recipeClientDailyQuota` (added in Task 11).

- [ ] **Step 6: Verify**

Run: `cd functions && npm test` — PASS.
Run: `npx tsc --noEmit` at the repo root — no new errors.

- [ ] **Step 7: Commit**

```bash
git add functions/src/ai/authoring/settings.ts functions/src/ai/authoring/admin.ts \
        functions/src/ai/authoring/admin.test.ts functions/src/lib/audit.ts \
        src/lib/firebase/functions.ts src/app/admin/settings/page.tsx
git commit -m "feat(recipes): recipeClientDailyQuota setting and recipe audit type"
```

---

## Task 6: The `generateRecipes` callable

**Files:**
- Create: `functions/src/recipes/generateRecipes.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Implement the callable**

```ts
// functions/src/recipes/generateRecipes.ts
/**
 * `generateRecipes` — P2-6 generic recipe suggestions.
 *
 * READ THIS BEFORE CHANGING THE SIGNATURE: there is no `clientId` parameter, and there must
 * never be one. A recipe generated "for" a named person, from their goals or measurements, is
 * a personalized diet, which an Italian personal trainer may not issue. The absence of that
 * parameter is the primary legal guardrail; the schemas and denylists are secondary.
 *
 * Spec: docs/superpowers/specs/2026-08-09-recipe-suggestions-design.md
 */
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { generateObject } from "ai";
import { buildModel, AI_SECRETS } from "../ai/providers";
import { getAiAuthoringSettings } from "../ai/authoring/settings";
import { reserveQuota, recordTokens, releaseQuota } from "../ai/quota";
import { writeAuditLog } from "../lib/audit";
import { getUserRoleInfo } from "../utils/roles";
import { recipeParamsSchema, recipeBatchSchema } from "./schema";
import { validateIngredients, screenRecipe, ForbiddenInputError } from "./screening";
import { buildRecipesPrompt } from "./prompt";

const region = process.env.FIREBASE_REGION || "europe-west1";

/** Separate from `ai_authoring_usage` so recipes cannot eat a trainer's workout-plan budget. */
const BUCKET = "ai_recipes_usage";

interface GenReq {
  locale?: string;
  params: unknown;
}

export const generateRecipes = onCall<GenReq>(
  { region, secrets: AI_SECRETS },
  async (request: CallableRequest<GenReq>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const uid = request.auth.uid;
    const db = admin.firestore();
    const now = new Date();

    const parsed = recipeParamsSchema.safeParse(request.data?.params);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", parsed.error.issues[0]?.message ?? "Invalid params");
    }
    const params = parsed.data;

    // Before quota: a rejected attempt must cost the user nothing.
    let ingredients: string[];
    try {
      ingredients = validateIngredients(params.ingredientsOnHand);
    } catch (e) {
      if (e instanceof ForbiddenInputError) {
        throw new HttpsError("invalid-argument", e.message);
      }
      throw e;
    }

    const role = await getUserRoleInfo(uid);
    if (!role) throw new HttpsError("permission-denied", "Unknown user");
    if (role.isActive === false) throw new HttpsError("permission-denied", "Account is deactivated");

    const isTrainerOrStaff =
      role.role === "provider" || role.role === "admin" || role.role === "superadmin";
    const ownerRole = role.role === "provider" ? "provider" :
      isTrainerOrStaff ? "admin" : "client";

    const settings = await getAiAuthoringSettings();
    if (!settings.enabled) throw new HttpsError("failed-precondition", "disabled");

    const quota = isTrainerOrStaff ? settings.dailyQuota : settings.recipeClientDailyQuota;
    try {
      await reserveQuota(uid, quota, now, BUCKET);
    } catch (e) {
      if ((e as { code?: string })?.code === "quota-exceeded") {
        throw new HttpsError("resource-exhausted", "quota-exceeded");
      }
      throw e;
    }

    const prompt = buildRecipesPrompt({ params, ingredients, locale: request.data?.locale ?? "it" });

    let batch;
    try {
      const res = await generateObject({
        model: buildModel(settings.provider, settings.model),
        schema: recipeBatchSchema,
        prompt,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
      });
      batch = res.object;
      const usage = (res as { usage?: Record<string, number> }).usage;
      await recordTokens(
        uid, now,
        usage?.inputTokens ?? usage?.promptTokens ?? 0,
        usage?.outputTokens ?? usage?.completionTokens ?? 0,
        BUCKET,
      );
    } catch (err) {
      logger.error("[recipes] generation failed", err);
      await releaseQuota(uid, now, BUCKET);
      throw new HttpsError("internal", "Generation failed");
    }

    const kept: typeof batch.recipes = [];
    const dropped: string[] = [];
    for (const recipe of batch.recipes) {
      const hit = screenRecipe(recipe);
      if (hit) dropped.push(hit);
      else kept.push(recipe);
    }

    if (dropped.length) {
      logger.warn("[recipes] screening dropped recipes", { dropped, kept: kept.length });
    }

    if (!kept.length) {
      // Everything the model produced was unusable. Fail loudly rather than saving nothing
      // and letting the user wonder where their recipes went.
      await releaseQuota(uid, now, BUCKET);
      throw new HttpsError("internal", "generation-unusable");
    }

    const writeBatch = db.batch();
    const created: { id: string }[] = [];
    for (const recipe of kept) {
      const ref = db.collection("recipes").doc();
      writeBatch.set(ref, {
        ...recipe,
        tags: recipe.tags ?? [],
        params: {
          dietStyle: params.dietStyle,
          excludes: params.excludes ?? [],
          orientation: params.orientation,
          cuisine: params.cuisine,
          maxPrepMinutes: params.maxPrepMinutes,
          budget: params.budget,
        },
        source: "ai",
        model: settings.model,
        aiPromptSnapshot: prompt.slice(0, 20000),
        screening: { droppedCount: dropped.length },
        ownerUid: uid,
        ownerRole,
        sharedWithUserIds: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created.push({ id: ref.id });
    }
    await writeBatch.commit();

    await writeAuditLog({
      actorUid: uid,
      actorEmail: request.auth.token?.email ?? "",
      actorRole: ownerRole === "provider" ? "provider" : ownerRole === "admin" ? "admin" : "client",
      action: "create",
      entityType: "recipe",
      entityId: created[0].id,
      after: { count: created.length, dropped: dropped.length, orientation: params.orientation },
    });

    return {
      recipes: kept.map((recipe, i) => ({ id: created[i].id, ...recipe })),
      dropped: dropped.length,
    };
  }
);
```

- [ ] **Step 2: Export it**

`functions/src/index.ts`, after line 22:

```ts
export * from "./recipes/generateRecipes";
```

Line 17's `export * from "./ai/authoring/generate"` **stays** — `generateTrainingProgram` survives.

- [ ] **Step 3: Verify it compiles**

Run: `cd functions && npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/recipes/generateRecipes.ts functions/src/index.ts
git commit -m "feat(recipes): generateRecipes callable with no clientId parameter"
```

---

## Task 7: Firestore rules, indexes and rules tests

**Read spec §6.4 first.** Firestore evaluates `list` rules against the query, not the results. The obvious per-client query is denied even for the owner, and the compound query is mandatory rather than an optimization.

**Files:**
- Modify: `firestore.rules`, `firestore.indexes.json`
- Create: `functions/test/recipes-rules.test.ts`

- [ ] **Step 1: Write the failing rules test**

Model the file on `functions/test/booking-rules.test.ts` (same imports, same emulator setup). Cases:

```
- owner reads their own recipe                                    → allowed
- uid present in sharedWithUserIds reads it                       → allowed
- unrelated uid reads it                                          → denied
- unrelated uid creates a recipe with someone else's ownerUid     → denied
- create with a non-empty sharedWithUserIds                       → denied
- owner updates sharedWithUserIds to 3 uids                       → allowed
- owner updates sharedWithUserIds to 51 uids                      → denied
- owner deletes their own recipe                                  → allowed
- non-owner deletes it                                            → denied
- LIST: owner queries ownerUid == uid                             → allowed
- LIST: client queries sharedWithUserIds array-contains own uid   → allowed
- LIST: trainer queries sharedWithUserIds array-contains clientUid alone → DENIED
- LIST: trainer queries ownerUid == uid AND array-contains clientUid    → allowed
```

The last two are the point of the task: they are what force the compound query in the UI.

- [ ] **Step 2: Run to verify it fails**

Run: `firebase emulators:exec --only firestore "cd functions && npx vitest run test/recipes-rules.test.ts"`
Expected: FAIL — no `recipes` rule exists, so everything is denied.

- [ ] **Step 3: Add the rules**

In `firestore.rules`, as a new top-level block near the other collections:

```js
    // ============================================
    // RECIPES (P2-6 — generic suggestions, owned, shareable)
    // ============================================
    // A recipe belongs to whoever generated it and is NOT addressed to any client: there is
    // deliberately no clientId field. Sharing grants read access to named users and is the
    // human review gate — P2-5 needed draft/publish because a plan was born attached to a
    // client; a recipe is born attached to nobody.
    //
    // NOTE ON QUERIES (spec §6.4): list rules are evaluated against the QUERY. A trainer
    // listing what they shared with a client MUST also constrain ownerUid == their own uid;
    // `sharedWithUserIds array-contains <clientUid>` alone is denied, because the array value
    // is the client's uid while this rule tests the caller's.
    match /recipes/{recipeId} {
      allow get, list: if isAdmin() ||
        (isAuthenticated() && resource.data.ownerUid == request.auth.uid) ||
        (isAuthenticated() && request.auth.uid in resource.data.sharedWithUserIds);

      allow create: if isAuthenticated() &&
        request.resource.data.ownerUid == request.auth.uid &&
        request.resource.data.sharedWithUserIds.size() == 0;

      allow update: if isAdmin() ||
        (isAuthenticated() &&
         resource.data.ownerUid == request.auth.uid &&
         request.resource.data.ownerUid == resource.data.ownerUid &&
         request.resource.data.sharedWithUserIds.size() <= 50);

      allow delete: if isAdmin() ||
        (isAuthenticated() && resource.data.ownerUid == request.auth.uid);
    }
```

- [ ] **Step 4: Remove the superseded blocks**

Delete the `match /dietPlans/{planId}` and `match /recipes/{recipeId}` blocks nested inside `match /clients/{clientId}` (around `firestore.rules:719-726`).

- [ ] **Step 5: Add the indexes**

In `firestore.indexes.json`, add three entries:

```json
    {
      "collectionGroup": "recipes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "ownerUid", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "recipes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "sharedWithUserIds", "arrayConfig": "CONTAINS" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "recipes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "ownerUid", "order": "ASCENDING" },
        { "fieldPath": "sharedWithUserIds", "arrayConfig": "CONTAINS" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
```

- [ ] **Step 6: Run to verify it passes**

Run: `firebase emulators:exec --only firestore "cd functions && npx vitest run test/recipes-rules.test.ts"`
Expected: PASS, all cases.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules firestore.indexes.json functions/test/recipes-rules.test.ts
git commit -m "feat(recipes): rules, indexes and the query shapes they authorize"
```

---

## Task 8: The purge callable

**Files:**
- Create: `functions/src/recipes/purgeLegacyNutrition.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Implement**

```ts
// functions/src/recipes/purgeLegacyNutrition.ts
/**
 * One-shot superadmin cleanup for P2-6: removes every `clients/{id}/dietPlans` and
 * `clients/{id}/recipes` document.
 *
 * As of 2026-08-09 the production database contains none of either — all four clients/*
 * documents have zero subcollections. This exists so that anything created between now and
 * deploy is caught, and so that deletion is evidenced if it is ever questioned.
 *
 * Exports before deleting, and aborts if the export fails. Dry run by default.
 */
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";

const region = process.env.FIREBASE_REGION || "europe-west1";
const GROUPS = ["dietPlans", "recipes"] as const;
const DELETE_BATCH_SIZE = 400;

interface PurgeReq { dryRun?: boolean }

export const purgeLegacyNutritionData = onCall<PurgeReq>({ region }, async (
  request: CallableRequest<PurgeReq>,
) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
  await requireSuperAdmin(request.auth.uid);

  const db = admin.firestore();
  const dryRun = request.data?.dryRun !== false;

  const found: { path: string; data: FirebaseFirestore.DocumentData }[] = [];
  for (const group of GROUPS) {
    const snap = await db.collectionGroup(group).get();
    for (const doc of snap.docs) {
      // collectionGroup('recipes') would also match the new TOP-LEVEL recipes collection.
      // Only sweep the per-client subcollections.
      if (!doc.ref.path.startsWith("clients/")) continue;
      found.push({ path: doc.ref.path, data: doc.data() });
    }
  }

  const counts = {
    dietPlans: found.filter((f) => f.path.includes("/dietPlans/")).length,
    recipes: found.filter((f) => f.path.includes("/recipes/")).length,
  };

  if (dryRun) {
    return { dryRun: true, counts, samplePaths: found.slice(0, 20).map((f) => f.path) };
  }

  let exportPath: string | null = null;
  if (found.length) {
    exportPath = `legal-purge/nutrition-${new Date().toISOString()}.json`;
    try {
      await admin.storage().bucket().file(exportPath)
        .save(JSON.stringify(found, null, 2), { contentType: "application/json" });
    } catch (err) {
      logger.error("[purge] export failed, aborting before any delete", err);
      throw new HttpsError("internal", "export-failed");
    }

    for (let i = 0; i < found.length; i += DELETE_BATCH_SIZE) {
      const batch = db.batch();
      for (const item of found.slice(i, i + DELETE_BATCH_SIZE)) batch.delete(db.doc(item.path));
      await batch.commit();
    }
  }

  await writeAuditLog({
    actorUid: request.auth.uid,
    actorEmail: request.auth.token?.email ?? "",
    actorRole: "superadmin",
    action: "delete",
    entityType: "migration",
    entityId: "purgeLegacyNutritionData",
    after: { counts, exportPath },
  });

  return { dryRun: false, counts, exportPath };
});
```

- [ ] **Step 2: Confirm `requireSuperAdmin` exists with that signature**

Run: `grep -n "export async function requireSuperAdmin" functions/src/utils/roles.ts`
If the signature differs, match the local one — do not invent a new helper.

- [ ] **Step 3: Export and build**

Add `export * from "./recipes/purgeLegacyNutrition";` to `functions/src/index.ts`.
Run: `cd functions && npm run build` — no errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/recipes/purgeLegacyNutrition.ts functions/src/index.ts
git commit -m "feat(recipes): purgeLegacyNutritionData with export-then-delete"
```

---

## Task 9: Remove diet plans from the backend

**Files:**
- Modify: `functions/src/ai/authoring/{schemas,prompts,generate}.ts` and `{schemas,prompts,generate}.test.ts`

- [ ] **Step 1: Delete the schemas**

From `functions/src/ai/authoring/schemas.ts` remove: `dietPlanSchema`, `recipeSchema`, `dietParamsSchema`, `recipeParamsSchema`, and the `macro` const if nothing else uses it. Keep `trainingProgramSchema` and `trainingParamsSchema`.

- [ ] **Step 2: Delete the prompts**

From `functions/src/ai/authoring/prompts.ts` remove: `buildDietPrompt`, `buildRecipePrompt`, `DietParams`, `RecipeParams`, and the now-unused imports.

- [ ] **Step 3: Delete the callables**

From `functions/src/ai/authoring/generate.ts` remove the `generateDietPlan` and `generateRecipe` exports, narrow the `subcollection` union on `runGeneration` to `"trainingPrograms"`, and drop the two `subcollection === "recipes"` conditionals that existed only for recipes.

- [ ] **Step 4: Fix the tests that now fail to compile**

`schemas.test.ts` imports all four deleted schemas (lines 4-8) with a `describe` for each — trim to training only. `prompts.test.ts:2` imports `buildDietPrompt` and `buildRecipePrompt` with `describe` blocks at lines 22 and 36 — same treatment. `generate.test.ts` covers only training and needs no change.

- [ ] **Step 5: Verify**

Run: `cd functions && npm test`
Expected: PASS. Test count drops by the removed cases; nothing should error.

Run: `cd functions && npm run build` — no errors.

- [ ] **Step 6: Commit**

```bash
git add functions/src/ai/authoring functions/src
git commit -m "feat(recipes)!: remove generateDietPlan and the legacy generateRecipe"
```

---

## Task 10: Client-side types and data layer

**Files:**
- Create: `src/types/recipes.ts`, `src/lib/firebase/recipes.ts`
- Modify: `src/types/clientPlans.ts`, `src/lib/firebase/clientPlans.ts`

- [ ] **Step 1: Create the recipe types**

```ts
// src/types/recipes.ts
// Mirrors functions/src/recipes/schema.ts. Keep the two in step.

export const DIET_STYLES = ['onnivora', 'vegetariana', 'vegana', 'pescetariana'] as const;
export const EXCLUSIONS = ['glutine', 'lattosio', 'frutta_secca', 'uova', 'crostacei', 'soia'] as const;
export const ORIENTATIONS = [
  'ricche_di_proteine', 'piatti_leggeri', 'piatto_unico',
  'colazione', 'spuntino', 'pre_allenamento', 'post_allenamento',
] as const;
export const CUISINES = ['italiana', 'mediterranea', 'asiatica', 'mediorientale', 'messicana', 'qualsiasi'] as const;
export const BUDGETS = ['economico', 'medio', 'qualsiasi'] as const;
export const PREP_TIMES = [15, 30, 45, 60] as const;

export type DietStyle = (typeof DIET_STYLES)[number];
export type Exclusion = (typeof EXCLUSIONS)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type Cuisine = (typeof CUISINES)[number];
export type Budget = (typeof BUDGETS)[number];
export type PrepTime = (typeof PREP_TIMES)[number];

export interface RecipeIngredient { item: string; quantity: string }
export interface NutritionPerServing { kcal?: number; protein?: number; carbs?: number; fat?: number }

export interface RecipeParams {
  count: number;
  servings: number;
  dietStyle: DietStyle;
  excludes: Exclusion[];
  orientation: Orientation;
  cuisine: Cuisine;
  maxPrepMinutes: PrepTime;
  budget: Budget;
  ingredientsOnHand?: string[];
}

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  prepMinutes: number;
  cookMinutes?: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  nutritionPerServing?: NutritionPerServing;
  tags: string[];
  params?: Omit<RecipeParams, 'count' | 'servings' | 'ingredientsOnHand'>;
  source: 'ai' | 'manual';
  model?: string;
  /** Who generated it. There is deliberately no clientId — a recipe is not addressed to anyone. */
  ownerUid: string;
  ownerRole: 'provider' | 'client' | 'admin';
  sharedWithUserIds: string[];
  createdAt?: string;
  updatedAt?: string;
}
```

- [ ] **Step 2: Create the data layer**

```ts
// src/lib/firebase/recipes.ts
/**
 * Recipe queries. Read the query shapes carefully — Firestore evaluates list rules against the
 * QUERY, so `listSharedWithClient` MUST constrain ownerUid as well as array-contains, or the
 * whole query is denied. See the spec §6.4.
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from './config';
import type { Recipe, RecipeParams } from '@/types/recipes';

const RECIPES = 'recipes';

function uid(): string {
  const u = auth.currentUser?.uid;
  if (!u) throw new Error('Not authenticated');
  return u;
}

function toIso(v: unknown): string | undefined {
  return v instanceof Timestamp ? v.toDate().toISOString() : undefined;
}

function mapDocs(snap: Awaited<ReturnType<typeof getDocs>>): Recipe[] {
  return snap.docs.map((d) => {
    const { createdAt, updatedAt, ...rest } = d.data();
    return {
      id: d.id, ...rest,
      tags: rest.tags ?? [],
      sharedWithUserIds: rest.sharedWithUserIds ?? [],
      createdAt: toIso(createdAt), updatedAt: toIso(updatedAt),
    } as Recipe;
  });
}

/** Everything I own — the trainer library, and the client's "Le mie ricette". */
export async function listMyRecipes(): Promise<Recipe[]> {
  return mapDocs(await getDocs(query(
    collection(db, RECIPES),
    where('ownerUid', '==', uid()),
    orderBy('createdAt', 'desc'),
  )));
}

/** Everything shared with me — the client's "Consigliate dal tuo trainer". */
export async function listSharedWithMe(): Promise<Recipe[]> {
  return mapDocs(await getDocs(query(
    collection(db, RECIPES),
    where('sharedWithUserIds', 'array-contains', uid()),
    orderBy('createdAt', 'desc'),
  )));
}

/**
 * What I have shared with one specific client.
 * The ownerUid constraint is MANDATORY: without it the rule cannot authorize the query and
 * Firestore denies it outright, even though every document returned would have been readable.
 */
export async function listSharedWithClient(clientUserId: string): Promise<Recipe[]> {
  return mapDocs(await getDocs(query(
    collection(db, RECIPES),
    where('ownerUid', '==', uid()),
    where('sharedWithUserIds', 'array-contains', clientUserId),
    orderBy('createdAt', 'desc'),
  )));
}

export async function createRecipe(
  data: Omit<Recipe, 'id' | 'source' | 'ownerUid' | 'ownerRole' | 'sharedWithUserIds' | 'createdAt' | 'updatedAt'>,
  ownerRole: Recipe['ownerRole'],
): Promise<string> {
  const ref = await addDoc(collection(db, RECIPES), {
    ...data,
    source: 'manual',
    ownerUid: uid(),
    ownerRole,
    sharedWithUserIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateRecipe(id: string, patch: Partial<Recipe>): Promise<void> {
  const { id: _i, ownerUid: _o, ownerRole: _r, source: _s, createdAt: _c, updatedAt: _u, ...rest } = patch;
  await updateDoc(doc(db, RECIPES, id), { ...rest, updatedAt: serverTimestamp() });
}

export async function deleteRecipe(id: string): Promise<void> {
  await deleteDoc(doc(db, RECIPES, id));
}

export async function shareRecipe(id: string, userId: string): Promise<void> {
  await updateDoc(doc(db, RECIPES, id), {
    sharedWithUserIds: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function unshareRecipe(id: string, userId: string): Promise<void> {
  await updateDoc(doc(db, RECIPES, id), {
    sharedWithUserIds: arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function aiGenerateRecipes(
  params: RecipeParams, locale: string,
): Promise<{ recipes: Recipe[]; dropped: number }> {
  const fn = httpsCallable<{ params: RecipeParams; locale: string }, { recipes: Recipe[]; dropped: number }>(
    functions, 'generateRecipes',
  );
  return (await fn({ params, locale })).data;
}
```

- [ ] **Step 3: Strip diet and recipes from `clientPlans`**

From `src/lib/firebase/clientPlans.ts` remove: the `dietPlans`/`recipes` members of `PlanKind`, all four `*DietPlan` exports, all four `*Recipe` exports, `aiGenerateDiet`, `aiGenerateRecipe`, and the now-unused imports.

From `src/types/clientPlans.ts` remove: `DietItem`, `DietMeal`, `DietDay`, `DietPlan`, `DietParams`, `Recipe`, `RecipeIngredient`, `RecipeParams`. Keep `MacroTargets` only if something still references it; otherwise delete it too and let `src/types/recipes.ts` own `NutritionPerServing`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `DietTab.tsx`, `DietPlanEditor.tsx`, `RecipesTab.tsx`, `RecipeEditor.tsx` and `ClientDetailClient.tsx` — those are fixed in Tasks 12 and 13. Note them and continue.

- [ ] **Step 5: Commit**

```bash
git add src/types/recipes.ts src/lib/firebase/recipes.ts src/types/clientPlans.ts src/lib/firebase/clientPlans.ts
git commit -m "feat(recipes): client-side types and data layer"
```

---

## Task 11: i18n

Roughly 60–80 new keys × 5 locales, and ~32 diet keys removed from each. `completeness.test.ts` is the safety net: it fails if any locale diverges from `it`.

**Files:**
- Modify: `src/i18n/messages/{it,en,es,fr,de}.ts`

- [ ] **Step 1: Remove the diet keys**

Delete every `clients.diet.*`, `clients.aiGenerate.diet.*` and `clientDetail.tab.diet` key from all five files. Find them with:

```bash
grep -n "clients\.diet\.\|aiGenerate\.diet\.\|clientDetail\.tab\.diet" src/i18n/messages/it.ts
```

- [ ] **Step 2: Add the legal copy — get this wording exactly right**

```ts
  'recipes.disclaimer': 'Suggerimenti a scopo informativo, non sostituiscono il parere di un professionista della nutrizione.',
  'recipes.trainerNotice': 'Non puoi prescrivere diete o piani alimentari. Qui trovi suggerimenti di ricette generiche da condividere con i tuoi clienti.',
  'recipes.forbiddenInput': 'Non è possibile richiedere ricette legate a condizioni di salute o obiettivi di peso. Rimuovi i riferimenti e riprova.',
```

- [ ] **Step 3: Add the rest of the namespace**

Page and library: `recipes.title`, `recipes.subtitle`, `recipes.myRecipes`, `recipes.sharedByTrainer`, `recipes.empty`, `recipes.emptyShared`, `recipes.generate`, `recipes.newManual`, `recipes.share`, `recipes.unshare`, `recipes.shared`, `recipes.aiBadge`, `recipes.manualBadge`, `recipes.servingsLabel`, `recipes.prepShort`, `recipes.cookShort`, `recipes.ingredients`, `recipes.steps`, `recipes.nutrition`, `recipes.nutritionNote` ("Valori indicativi per porzione"), `recipes.kcal`, `recipes.protein`, `recipes.carbs`, `recipes.fat`.

Generate form: `recipes.form.title`, `.count`, `.servings`, `.dietStyle`, `.excludes`, `.excludesHint` ("Preferenze, non intolleranze"), `.orientation`, `.cuisine`, `.maxPrepMinutes`, `.budget`, `.ingredients`, `.ingredientsHint`, `.generateButton`, `.generating`.

One key per enum value, e.g. `recipes.dietStyle.onnivora`, `recipes.orientation.ricche_di_proteine`, `recipes.cuisine.italiana`, `recipes.budget.economico`, `recipes.excludes.glutine`.

Errors: `recipes.error.quota`, `recipes.error.disabled`, `recipes.error.unusable`, `recipes.error.generic`.

Share modal: `recipes.shareModal.title`, `.noClients`, `.noAccount` ("Cliente senza account collegato"), `.done`.

Nav: `common.recipes` ('Ricette'), `common.myPlans` ('Le mie schede').

Admin: `admin.aiAuthoring.recipeClientDailyQuota` ('Quota giornaliera clienti (ricette)').

- [ ] **Step 4: Verify all five locales match**

Run: `npx vitest run src/i18n/messages/completeness.test.ts`
Expected: PASS — 4 tests, one per non-Italian locale.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages
git commit -m "feat(recipes): i18n for recipes across five locales, diet keys removed"
```

---

## Task 12: Shared recipe components

**Files:**
- Create: `src/components/recipes/{RecipeDisclaimer,RecipeCard,RecipeGenerateModal,ShareRecipeModal}.tsx`

Mirror the styling of `src/app/(main)/provider/clients/detail/tabs/RecipesTab.tsx` (card shells, `bg-surface-elevated rounded-xl border border-hairline p-5`, `Modal`, `Button`, `Spinner`) so the new pages look native to the app.

- [ ] **Step 1: `RecipeDisclaimer.tsx`**

A small always-visible banner rendering `t('recipes.disclaimer')` with an `Info` icon, muted styling. **It must appear on every screen that shows a recipe** — this is a legal requirement, not decoration.

- [ ] **Step 2: `RecipeCard.tsx`**

Props: `{ recipe: Recipe; onShare?: () => void; onEdit?: () => void; onDelete?: () => void; shared?: boolean }`. Collapsed: title, servings, prep/cook time, source badge, tags. Expanded: ingredients list, numbered steps, and — only when `nutritionPerServing` exists — the values with `t('recipes.nutritionNote')` beneath them. Action buttons render only when their handler is passed, which is how the client view stays read-only for shared recipes.

- [ ] **Step 3: `RecipeGenerateModal.tsx`**

Props: `{ open, onClose, onGenerated(recipes), locale }`. Renders one control per enum in `src/types/recipes.ts`, all labelled through i18n. `excludes` is a multi-select capped at 4 and **must** display `recipes.form.excludesHint` ("Preferenze, non intolleranze") — the distinction is legally load-bearing.

`ingredientsOnHand` is a chip input, max 6, each entry max 30 characters. Reject digits client-side with the same message the server uses, so the common case never costs a round trip.

Error mapping from the callable:
- message starts with `forbidden-input` → `recipes.forbiddenInput`
- `resource-exhausted` → `recipes.error.quota`
- `failed-precondition` → `recipes.error.disabled`
- message contains `generation-unusable` → `recipes.error.unusable`
- otherwise → `recipes.error.generic`

Follow `src/app/(main)/provider/clients/detail/tabs/aiGenerateError.ts` for the existing pattern.

- [ ] **Step 4: `ShareRecipeModal.tsx`**

Props: `{ recipe, clients, onClose }`. Lists the trainer's clients; a client without `userId` renders disabled with `recipes.shareModal.noAccount`. Toggling calls `shareRecipe` / `unshareRecipe` and updates local state optimistically.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — no errors in `src/components/recipes/`.

- [ ] **Step 6: Commit**

```bash
git add src/components/recipes
git commit -m "feat(recipes): shared recipe components"
```

---

## Task 13: Trainer library, client-detail tab, and diet removal

**Files:**
- Create: `src/app/(main)/provider/recipes/{page.tsx,RecipesLibraryClient.tsx}`
- Modify: `.../tabs/RecipesTab.tsx`, `.../tabs/editors/RecipeEditor.tsx`, `.../ClientDetailClient.tsx`
- Delete: `.../tabs/DietTab.tsx`, `.../tabs/editors/DietPlanEditor.tsx`

- [ ] **Step 1: Build the library page**

`page.tsx` follows `src/app/(main)/plans/page.tsx` exactly — a `Suspense` boundary around the client component, required by static export.

`RecipesLibraryClient.tsx`: header with `t('recipes.title')`, `RecipeDisclaimer`, and a prominent `t('recipes.trainerNotice')`; "Genera" and "Nuova ricetta" buttons; a grid of `RecipeCard` from `listMyRecipes()` with share/edit/delete wired; `RecipeGenerateModal` and `ShareRecipeModal`.

- [ ] **Step 2: Rewrite `RecipesTab`**

It becomes small: fetch the client's `userId` from the provider store, call `listSharedWithClient(userId)`, render read-only cards with an "unshare" action, and offer "condividi dalla libreria" which opens a picker over `listMyRecipes()`. **No generation here** — generation is not per-client, by design. Include `RecipeDisclaimer`.

- [ ] **Step 3: Adapt `RecipeEditor`**

Three changes: `nutrition` → `nutritionPerServing`, `prepMinutes` becomes required, and the inline `onSave` payload type (previously at `RecipesTab.tsx:100-109`) moves into the editor's own props. Remove any macro-*target* framing from labels — these are indicative per-portion values, not goals.

- [ ] **Step 4: Delete the diet UI**

```bash
git rm "src/app/(main)/provider/clients/detail/tabs/DietTab.tsx" \
       "src/app/(main)/provider/clients/detail/tabs/editors/DietPlanEditor.tsx"
```

In `ClientDetailClient.tsx`: remove the `DietTab` import (line 19), drop `'diet'` from the `TabId` union (line 22) and the `TABS` array (line 24), and delete the render line (line 190).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — clean.
Run: `npm run build` — succeeds, `/provider/recipes` appears in the route list.

- [ ] **Step 6: Commit**

```bash
git add -A "src/app/(main)/provider"
git commit -m "feat(recipes)!: trainer library, per-client sharing tab, diet UI removed"
```

---

## Task 14: Client-facing page and navigation

**Files:**
- Create: `src/app/(main)/recipes/{page.tsx,RecipesClient.tsx}`
- Modify: `src/components/layout/SideDrawer.tsx`

- [ ] **Step 1: Build the page**

Same `Suspense` shape as Task 13. `RecipesClient.tsx` renders `RecipeDisclaimer`, then two sections: `t('recipes.sharedByTrainer')` from `listSharedWithMe()` (read-only cards), and `t('recipes.myRecipes')` from `listMyRecipes()` with delete plus a "Genera" button opening `RecipeGenerateModal` with `ownerRole: 'client'`.

Empty states use `recipes.emptyShared` and `recipes.empty`.

- [ ] **Step 2: Add navigation**

In `src/components/layout/SideDrawer.tsx`, add to the `navItems` array (after `/bookings`, around line 61):

```tsx
  { href: '/recipes', icon: ChefHat, labelKey: 'common.recipes' },
  { href: '/plans', icon: Dumbbell, labelKey: 'common.myPlans' },
```

Import `ChefHat` and `Dumbbell` from `lucide-react`. **`/plans` is a P2-5 gap**: the page exists but has never been reachable from any navigation.

- [ ] **Step 3: Verify**

Run: `npm run build` — succeeds, `/recipes` in the route list.
Run: `npm test` — PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(main)/recipes" src/components/layout/SideDrawer.tsx
git commit -m "feat(recipes): client-facing page and the nav entries for it and /plans"
```

---

## Task 15: Documentation

**Files:**
- Modify: `docs/features.md`, `docs/database-schema.md`, `docs/backend/cloud-functions.md`

- [ ] **Step 1: Update all three**

- `features.md`: P2-6 entry describing the legal framing (suggestions, not diets); remove diet-plan entries.
- `database-schema.md`: document `recipes` per spec §6.1, including why there is no `clientId`; mark `clients/*/dietPlans` and `clients/*/recipes` removed on 2026-08-09 with the reason.
- `cloud-functions.md`: add `generateRecipes` and `purgeLegacyNutritionData`; remove `generateDietPlan` and `generateRecipe`.

- [ ] **Step 2: Commit**

```bash
git add docs
git commit -m "docs(recipes): document the recipes collection and the diet removal"
```

---

## Task 16: Deploy

- [ ] **Step 1: Full verification before deploying anything**

```bash
cd functions && npm test && npm run build && cd ..
npm test && npm run build
```
All must pass. Do not proceed on a failure.

- [ ] **Step 2: Deploy rules and indexes first**

```bash
npm run deploy:rules
firebase deploy --only firestore:indexes
```

Indexes must exist before the queries run, or the pages fail with a console link instead of data.

- [ ] **Step 3: Deploy functions**

```bash
npm run deploy:functions
```

- [ ] **Step 4: Delete the removed functions — DO NOT SKIP**

Removing the exports does not undeploy anything. `firebase deploy` only removes orphaned functions after an interactive confirmation that does not happen non-interactively, so without this step `generateDietPlan` stays live and invokable with its `clientId` + `kcalTarget` signature, and the spec's claim that the legal exposure is closed (§11) would be false.

```bash
firebase functions:delete generateDietPlan generateRecipe --region europe-west1 --force
firebase functions:list | grep -E "generateDietPlan|generateRecipe|generateRecipes"
```

Expected: `generateRecipes` present; `generateDietPlan` and `generateRecipe` absent. **Record this output.**

- [ ] **Step 5: Run the purge, dry run first**

Call `purgeLegacyNutritionData` with `{ dryRun: true }` as a superadmin. Expected: `{ counts: { dietPlans: 0, recipes: 0 } }`.

If both are zero, no live run is needed — say so rather than running a delete that does nothing. If either is non-zero, run with `{ dryRun: false }` and record the export path.

- [ ] **Step 6: Enable AI authoring if it is off**

`generateRecipes` throws `failed-precondition` when `systemSettings/aiAuthoring.enabled` is false. Check it before smoke testing, and set `recipeClientDailyQuota` if the document predates Task 5.

---

## Task 17: Smoke test

Browser-verify with Playwright MCP against the deployed app. A build that compiles is not a feature that works.

- [ ] **Step 1: Trainer library**

Sign in as a provider, go to `/provider/recipes`. Confirm the disclaimer and trainer notice both render. Generate 2 recipes with a plausible enum combination. Confirm they appear, with ingredients, steps and indicative nutrition.

- [ ] **Step 2: The guardrail actually fires**

In the ingredients box, enter `per diabetici`. Expected: the specific `recipes.forbiddenInput` message, **not** a generic error — and no quota consumed.

- [ ] **Step 3: Sharing round-trip**

Share a recipe with a client who has a linked account. Open the client detail → Ricette tab and confirm it appears there. Confirm the **Dieta tab is gone**.

- [ ] **Step 4: Client view**

Sign in as that client, go to `/recipes`. Confirm the shared recipe is under "Consigliate dal tuo trainer" and the disclaimer renders. Generate one as the client. Confirm the drawer shows both "Ricette" and "Le mie schede", and that `/plans` now opens from the drawer.

- [ ] **Step 5: Check the console and network**

No errors, and specifically **no `permission-denied` and no missing-index links** — those are the two failures the query shapes in §6.4 exist to prevent.

- [ ] **Step 6: Report**

Write up what was verified and what was not, with the `functions:list` output from Task 16 Step 4 and the purge counts from Step 5. If anything failed, say so plainly rather than reporting partial success as success.

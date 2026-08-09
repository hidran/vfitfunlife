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

/**
 * Lowercase and strip diacritics, so `Diabète` and `DIABETICI` match `diabet`.
 * The class is written with escapes on purpose — literal combining marks after a `[` are
 * invisible and get mangled by anything that reformats this file.
 */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Terms banned in a generation REQUEST.
 *
 * Substring match, deliberately — the spec writes these as `diabet*` wildcards, and for an
 * INPUT list over-matching is the safe direction: the cost of rejecting "diabetico" inside a
 * longer word is a retry, while the cost of missing it is the thing the feature exists to
 * prevent. Do not "fix" this to word-boundary matching.
 */
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
  // diagnosis framing — spec §7.1: an exclusion is a preference, never a medical fact.
  // The prompt forbids this framing; these two enforce it on the way back.
  //
  // "allergi" and NOT "allerg": EU food labelling makes "allergeni" standard vocabulary in
  // Italian recipe writing, so the shorter stem would drop "contiene allergeni: frutta a
  // guscio" — the same class of false positive that got "cura per" removed below. "allergi"
  // still catches allergia/allergico/allergie, which are the diagnosis words.
  "intolleran", "allergi",
  // clinical framing
  //
  // NOTE: "cura per" was here and was REMOVED. Do not add it back. It substring-matches the
  // everyday cooking idiom "mescolare con cura per 5 minuti" and "una ricetta sicura per i
  // bambini", dropping correct recipes — and word-boundary matching would not help, because
  // those boundaries are real. A genuine "cura per X" always names the condition it claims to
  // cure, which the medical-conditions entries above already catch.
  "prescriv", "terapia", "terapeutic", "indicato per chi soffre",
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
  // NFC first: iOS and macOS can send decomposed text, where the accent of "ragu`" is a
  // separate combining mark. Combining marks are \p{M}, not \p{L}, so the decomposed form
  // would fail INGREDIENT_PATTERN while the precomposed form passes. Compose, don't loosen
  // the character class — the class is what keeps digits out.
  const items = (raw ?? []).map((s) => s.trim().normalize("NFC")).filter((s) => s.length > 0);
  if (items.length > INGREDIENTS_MAX_ITEMS) throw new ForbiddenInputError("too-many-items");

  for (const item of items) {
    // Length is checked separately from the pattern so the UI can say which rule was broken.
    if (item.length > INGREDIENT_MAX_LENGTH) throw new ForbiddenInputError("too-long");
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
    // Both halves: a model that wants to editorialise will happily do it in `quantity`.
    ...recipe.ingredients.flatMap((i) => [i.item, i.quantity]),
  ].join(" \n "));

  return OUTPUT_DENYLIST.find((term) => haystack.includes(term)) ?? null;
}

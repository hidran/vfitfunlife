# Recipe Suggestions with AI — Design Spec

**Date:** 2026-08-09
**Status:** Approved (design) — pending implementation plan
**Author:** Hidran Arias (with Claude Code)
**Priority:** P2-6 — last of the six pilot features
**Related:** P2-5 workout plans (commits `7e8aaa0`, `d0f5f74`) — same guardrail philosophy, different
legal footing. Note that `generateWorkoutPlan.ts:10` cites a spec file
(`2026-08-09-workout-plans-design.md`) that was never written; P2-5's design lives in those
commit messages
**Closes:** the accepted diet-plan risk recorded 2026-08-08 (see §11)

## 1. Summary

Trainers and clients can generate **generic recipe suggestions** with AI. A trainer keeps a
private library and shares individual recipes with named clients; the client sees them under
"Consigliate dal tuo trainer" and can also generate their own at a lower daily quota.

The same change **removes diet plans from the platform entirely** — the callable, the schemas,
the types, the two UI screens, the rules, the i18n keys, and any documents already stored.

## 2. The legal constraint that shapes everything

Under Italian law, prescribing a personalized diet is an act reserved to *medici*, *biologi
nutrizionisti* and *dietisti*. A personal trainer who issues one commits *abuso di
professione*, and a platform that provides the tool facilitates it.

| | |
|---|---|
| ✅ Allowed | General healthy recipes filtered by preference (vegetarian/vegan, no-lactose/no-gluten *as a preference*, cuisine, prep time, budget) and by *generic* orientation ("ricche di proteine", "piatti leggeri"), with standard nutritional information **per portion** |
| ❌ Forbidden by design | Personalized calorie targets; anything structured per day or per week as a *dieta*; inputs describing medical conditions; weight-loss prescriptions tied to a client's data; body weight or body measurements anywhere in this feature |

Every recipe screen carries a fixed disclaimer. Trainer-facing UI states plainly that they
cannot issue diets.

**This is not primarily a prompt-engineering problem.** P2-5 established the house rule:
asking the model nicely is not a guardrail. Here the guardrail is that the forbidden thing
has nowhere to live — no `clientId` on the callable, no day/week field in the output schema,
no numeric input for a calorie target.

## 3. Decisions (from brainstorming, 2026-08-09)

| Decision | Choice |
|---|---|
| Library scope | **Per-trainer private, plus explicit share.** `ownerUid` owns; `sharedWithUserIds` grants read. No platform-wide pool, no moderation queue |
| Legacy diet documents | **Export to Storage, then purge.** Superadmin callable, dry-run first |
| Input strictness | **Closed enums + one policed free-text box** for ingredients on hand |
| Client self-service | **In this phase**, at a lower daily quota |
| Module placement | **`functions/src/recipes/`**, separate from AI authoring — different legal nature, different lifecycle |
| Human review gate | **The share action is the gate.** No draft/publish status |

## 4. Goals & Non-Goals

### Goals
- `generateRecipes` callable producing 1–3 generic recipes from closed-enum preferences.
- Top-level `recipes` collection, owner-scoped, shareable to named clients.
- Trainer library page, client-detail sharing tab, client-facing page.
- Complete removal of diet-plan code and data.
- Tests covering the guardrails, not just the happy path.

### Non-Goals (YAGNI for the pilot)
- No shopping list, no meal calendar, no "plan my week" — the second of those is the illegal
  feature wearing a different hat.
- No recipe photos or image generation.
- No push notification when a recipe is shared; the client sees it on next open.
- No ratings, favourites, or comments.
- No platform-wide recipe catalog and no admin curation screen.
- No Remote Config flag. `systemSettings/aiAuthoring.enabled` already kills all AI generation.

## 5. Current state (verified 2026-08-09)

`generateRecipe` (singular) already exists at `functions/src/ai/authoring/generate.ts:157`
and is **not** compliant with §2:

- it takes a `clientId` and stores under `clients/{clientId}/recipes`, framing the output as
  something prescribed to a named person;
- `recipeParamsSchema` accepts `targetMacros` (kcal, protein, carbs, fat) — a personalized
  caloric target;
- `runGeneration` injects the client's active goals and last five completed sessions into
  every prompt, including the recipe prompt.

`generateDietPlan` (`generate.ts:148`) produces per-day meal plans with a `kcalTarget` input.
This is the artifact §2 forbids outright.

**Production data: none.** All four `clients/*` documents in `vfit-funlife` have zero
subcollections — no `dietPlans`, no `recipes`, no `trainingPrograms`. The purge callable of
§10 will report zero on today's database. It is built as a safety net for anything created
between now and deploy, and so that deletion is evidenced if it is ever questioned.

## 6. Data model

### 6.1 `recipes/{recipeId}` (new, top-level)

```ts
{
  title: string;
  servings: number;                 // 1–8
  prepMinutes: number;
  cookMinutes?: number;
  ingredients: { item: string; quantity: string }[];
  steps: string[];
  nutritionPerServing?: { kcal?: number; protein?: number; carbs?: number; fat?: number };
  tags: string[];

  // The enum selections that produced it — used for filtering and re-generation.
  params: {
    dietStyle: DietStyle;
    excludes: Exclusion[];
    orientation: Orientation;
    cuisine: Cuisine;
    maxPrepMinutes: 15 | 30 | 45 | 60;
    budget: Budget;
  };

  source: 'ai' | 'manual';
  model?: string;
  aiPromptSnapshot?: string;        // ≤ 20000 chars, audit trail
  screening?: { droppedCount: number };  // recipes discarded by §8.4, for observability

  ownerUid: string;
  ownerRole: 'provider' | 'client' | 'admin';
  sharedWithUserIds: string[];      // auth uids; [] on create; max 50

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**There is no `clientId` field, and that absence is the design.** A recipe cannot be "for
Marco" because the document has nowhere to record Marco. `nutritionPerServing` is per portion
— standard food labelling, which §2 permits. There is no `targets`, no `kcalTarget`, no
`durationDays`, no `days[]`.

### 6.2 Collections removed

| Path | Fate |
|---|---|
| `clients/{id}/dietPlans` | Exported, then deleted (§10). Rules block removed |
| `clients/{id}/recipes` | Exported, then deleted (§10). Superseded by top-level `recipes`. Not migrated: those documents were generated with the client's goals in the prompt and macro targets in the params, so they are exactly the personalized artifacts this feature exists to stop producing |

### 6.3 Firestore rules

```js
match /recipes/{recipeId} {
  allow get, list: if isAdmin()
    || (isAuthenticated() && resource.data.ownerUid == request.auth.uid)
    || (isAuthenticated() && request.auth.uid in resource.data.sharedWithUserIds);

  allow create: if isAuthenticated()
    && request.resource.data.ownerUid == request.auth.uid
    && request.resource.data.sharedWithUserIds.size() == 0;

  allow update: if isAdmin()
    || (isAuthenticated()
        && resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerUid == resource.data.ownerUid
        && request.resource.data.sharedWithUserIds.size() <= 50);

  allow delete: if isAdmin()
    || (isAuthenticated() && resource.data.ownerUid == request.auth.uid);
}
```

AI-generated documents are written by the Cloud Function through the Admin SDK, so rules do
not gate those; the `create` rule covers manual authoring from the client SDK.

**Accepted limitation:** rules permit an owner to share to any uid, not only to their own
clients. Verifying the relationship would cost a `get()` on every share write. The UI offers
only the trainer's own roster, and the payload is generic by construction — there is nothing
personal in a recipe to leak. The `size() <= 50` cap stops the field being used as a
broadcast channel.

### 6.4 Queries and indexes

Firestore evaluates `list` rules against the **query**, not the documents it would return: a
query is allowed only if its constraints guarantee every possible result satisfies the rule.
That makes the query shapes part of the security design, not an implementation detail.

| Screen | Query | Rule clause that authorizes it |
|---|---|---|
| `/provider/recipes` | `ownerUid == uid` + `orderBy createdAt desc` | `resource.data.ownerUid == request.auth.uid` |
| `/recipes` → "Consigliate dal tuo trainer" | `sharedWithUserIds array-contains uid` + `orderBy createdAt desc` | `request.auth.uid in resource.data.sharedWithUserIds` |
| `/recipes` → "Le mie ricette" | `ownerUid == uid` + `orderBy createdAt desc` | `resource.data.ownerUid == request.auth.uid` |
| Client detail → `RecipesTab` | `ownerUid == uid` **and** `sharedWithUserIds array-contains clientUserId` + `orderBy createdAt desc` | `resource.data.ownerUid == request.auth.uid` |

The last row is the one that is easy to get wrong. The obvious query — `sharedWithUserIds
array-contains clientUserId` alone — is denied for everyone including the trainer, because
the array-contains value is the *client's* uid while the rule tests the *caller's*. The
`ownerUid == uid` constraint is what makes the query provably safe, so it is mandatory rather
than an optimization.

Indexes required in `firestore.indexes.json`:

| Collection | Fields |
|---|---|
| `recipes` | `ownerUid` ASC, `createdAt` DESC |
| `recipes` | `sharedWithUserIds` ARRAY_CONTAINS, `createdAt` DESC |
| `recipes` | `ownerUid` ASC, `sharedWithUserIds` ARRAY_CONTAINS, `createdAt` DESC |

## 7. Inputs

### 7.1 Enums (stored as stable ASCII keys, displayed through i18n)

| Field | Values |
|---|---|
| `dietStyle` | `onnivora`, `vegetariana`, `vegana`, `pescetariana` |
| `excludes[]` (max 4) | `glutine`, `lattosio`, `frutta_secca`, `uova`, `crostacei`, `soia` |
| `orientation` | `ricche_di_proteine`, `piatti_leggeri`, `piatto_unico`, `colazione`, `spuntino`, `pre_allenamento`, `post_allenamento` |
| `cuisine` | `italiana`, `mediterranea`, `asiatica`, `mediorientale`, `messicana`, `qualsiasi` |
| `maxPrepMinutes` | `15`, `30`, `45`, `60` |
| `budget` | `economico`, `medio`, `qualsiasi` |
| `servings` | integer 1–8 |
| `count` | integer 1–3 |

`excludes` is labelled **"preferenze"** in every locale, never "intolleranze" or "allergie".
The distinction is the whole point: a preference is a taste, an intolerance is a diagnosis.

### 7.2 `ingredientsOnHand` — the only free text

- Optional, maximum 6 items, each matching `/^[\p{L}][\p{L}\s'’-]{1,29}$/u`.
- **No digits are accepted at all.** That single rule kills "1500 kcal", "80 kg" and "2000
  calorie" without enumerating them.
- Then a word-boundary denylist, case- and accent-insensitive, applied after NFD
  normalization and diacritic stripping:

```
diabet*, ipertens*, colesterol*, tiroid*, celiac*, gastrit*, reflusso, ulcera,
gravidanza, incinta, allattamento, menopaus*, anoress*, bulim*, obes*, tumor*,
oncolog*, renale, epatic*, intolleran*, allerg*, patolog*, malatt*, farmac*,
dimagr*, ingrassare, perdere peso, massa grassa, deficit calorico, chetogenic*,
keto, digiuno, bmi, kcal, calorie, caloric*, dieta, dimagrante,
diet, weight loss, diabetes, hypertension, cholesterol, pregnan*, allergy, intolerance
```

Violations throw `invalid-argument` with message prefix `forbidden-input:` **before quota is
reserved**, so a rejected attempt costs the user nothing. The UI renders a specific
explanation, not a generic "invalid input".

### 7.3 Strictness

The params schema is `.strict()`. `kcalTarget`, `weightKg`, `measurements`, `condition` and
`clientId` are **rejected**, not stripped. P2-5 stripped unknown fields because a stray key
was probably noise; here a caller sending `kcalTarget` is attempting the forbidden thing on
purpose and should be told no.

## 8. The callable — `generateRecipes`

`functions/src/recipes/generateRecipes.ts`, region `europe-west1`, `secrets: AI_SECRETS`.

**Request:** `{ locale?: string; params: RecipeGenParams }`. There is no `clientId` parameter,
and no code path that reads client goals, bookings, names or measurements. The prompt is a
pure function of the enums plus the sanitized ingredient list.

**Authorization:** any authenticated, non-deactivated user. Role determines quota only —
clients generating for themselves is an intended use, not an exception.

### 8.1 Flow

1. Validate params (`.strict()`) → reject unknown/typed-wrong fields.
2. Screen `ingredientsOnHand` (§7.2) → reject `forbidden-input:<term>`.
3. Load `systemSettings/aiAuthoring`; fail `failed-precondition` if `enabled` is false.
4. Resolve role → quota (§8.2) → `reserveQuota` on bucket `ai_recipes_usage`.
5. Build prompt (§8.3) → `generateObject` with the batch schema.
6. Screen output (§8.4); drop offending recipes.
7. If nothing survives → `releaseQuota` and throw `internal / generation-unusable`.
8. Batch-write survivors to `recipes` with `sharedWithUserIds: []`.
9. `writeAuditLog` — `action: 'create'`, `entityType: 'recipe'`, count and dropped count.

Failures at step 5 release the quota, matching `generateWorkoutPlan`.

### 8.2 Quota

A new bucket `ai_recipes_usage` (not `ai_authoring_usage`), so recipe generation cannot eat a
trainer's workout-plan budget or vice versa. One reservation per call regardless of `count`,
since `count ≤ 3`.

| Role | Daily quota |
|---|---|
| `provider`, `admin`, `superadmin` | `settings.dailyQuota` (default 20) |
| `client` / any other authenticated user | `settings.recipeClientDailyQuota` (**new field**, default 3) |

`recipeClientDailyQuota` must be wired in **four** places, not one. Two of them are easy to
miss and fail silently:

1. `AiAuthoringSettings` and `DEFAULT_AI_AUTHORING_SETTINGS` (`functions/src/ai/authoring/settings.ts`).
2. **`patchSchema` in `functions/src/ai/authoring/admin.ts:11`** — a plain `z.object`, which
   *strips* unknown keys. Omit it here and every save silently discards the value.
3. **The independent copy of the `AiAuthoringSettings` interface in
   `src/lib/firebase/functions.ts:377`** — the client mirrors the type rather than importing it.
4. The admin settings screen input.

`functions/src/ai/authoring/admin.test.ts` will not break — it asserts on specific fields, not
exhaustively — but should gain a range case for the new field alongside the existing
`dailyQuota` ones.

Token accounting is unchanged: `recordTokens` is called after a successful generation against
the same `ai_recipes_usage` bucket, exactly as `generateWorkoutPlan` does against
`ai_authoring_usage`.

### 8.3 Prompt

Built from enum keys mapped to natural-language phrases in the requested locale, plus the
sanitized ingredients. It states the constraints explicitly — generic recipes only, no meal
plans, no calorie targets for a person, no medical claims or condition references, exclusions
are preferences not intolerances, nutrition values are indicative per portion. That text is
belt; §6.1 and §8.5 are braces.

Stored on each document as `aiPromptSnapshot` (≤ 20000 chars) so a questioned recipe is
reconstructible, exactly as P2-5 does for plans.

### 8.4 Output screening — a *different*, narrower list

Each generated recipe's `title`, `tags`, `steps` and ingredient `item` values are screened. A
recipe that matches is **dropped and logged**, not persisted — the model volunteering "ideale
per chi soffre di diabete" is the failure mode this catches. Surviving recipes are saved with
`screening.droppedCount`. If every recipe is dropped, the call fails loudly and refunds the
quota rather than saving nothing silently (P2-5 precedent).

**The §7.2 input denylist must not be reused here.** It bans `kcal`, `calorie`, `dieta` and
`dimagr*`, all of which are legitimate in output: §2 permits nutritional information per
portion, §6.1 stores `nutritionPerServing.kcal`, and `cuisine: mediterranea` is an offered
enum — a model given it will write "tipico della dieta mediterranea" and "circa 300 calorie a
porzione" as a matter of course. Reusing the input list would drop ordinary recipes and,
per §8.1 step 7, turn a correct generation into `generation-unusable`.

The output list targets only what is actually forbidden:

| Category | Patterns |
|---|---|
| Medical conditions | `diabet*`, `ipertens*`, `colesterol*`, `tiroid*`, `celiac*`, `gastrit*`, `reflusso`, `ulcera`, `tumor*`, `oncolog*`, `insufficienza renale`, `epatic*`, `gravidanza`, `allattamento`, `menopaus*`, `anoress*`, `bulim*`, `obes*`, `patolog*`, `diabetes`, `hypertension`, `cholesterol` |
| Per-person prescription | `dieta personalizzata`, `piano alimentare`, `la tua dieta`, `il tuo fabbisogno`, `fabbisogno calorico`, `deficit calorico`, `dieta dimagrante`, `per dimagrire`, `perdere peso`, `weight loss`, `meal plan` |
| Clinical framing | `prescriv*`, `terapia`, `terapeutic*`, `cura per`, `indicato per chi soffre`, `consigliato in caso di` |

Bare `dieta`, `kcal`, `calorie` and `proteine` are **allowed** in output. The phrase
`dieta mediterranea` is explicitly allowed and must be covered by a test, since it is the
most likely false positive.

**Deliberately not carried over from §7.2:** the named-protocol terms `chetogenic*`, `keto`,
`digiuno` and `bmi`. A step reading "perfetta per la dieta chetogenica" will pass output
screening. This is a considered trade, not an omission — describing a recipe as suiting a
well-known eating style is food writing, whereas *asking* for one on those terms (§7.2) is a
request for a regime and stays blocked. Anything that crosses into prescription reaches the
per-person and clinical rows above regardless of which protocol it names.

### 8.5 Output schema

```ts
z.object({
  recipes: z.array(z.object({
    title: z.string().min(3).max(120),
    servings: z.number().int().min(1).max(8),
    prepMinutes: z.number().int().min(1).max(180),
    cookMinutes: z.number().int().min(0).max(240).optional(),
    ingredients: z.array(z.object({
      item: z.string().min(1).max(80),
      quantity: z.string().min(1).max(40),
    })).min(2).max(20),
    steps: z.array(z.string().min(3).max(400)).min(2).max(15),
    nutritionPerServing: z.object({
      kcal: z.number().optional(), protein: z.number().optional(),
      carbs: z.number().optional(), fat: z.number().optional(),
    }).optional(),
    tags: z.array(z.string().max(24)).max(6).optional(),
  })).min(1).max(3),
})
```

The schema cannot express a day, a week, a meal sequence, or a target for a person. A model
instructed to produce a diet plan physically cannot return one through this interface.

## 9. Sharing

P2-5 needed `draft` → `published` because a plan was born attached to a client. A recipe is
born attached to nobody, so **the trainer's share action is the human review gate** and no
status field is added.

- The share modal lists the trainer's clients (`clients` where `providerId == uid`) that have
  a linked `userId`. A roster entry without an account cannot read anything and is shown as
  disabled with an explanatory label.
- Toggling writes `arrayUnion` / `arrayRemove` on `sharedWithUserIds`.
- Un-sharing removes access immediately — rules are evaluated per read.

## 10. Removal of diet plans

### 10.1 Code deleted

| Area | Items |
|---|---|
| Functions | `generateDietPlan`, `generateRecipe` (legacy singular), `dietPlanSchema`, `dietParamsSchema`, `recipeSchema`, `recipeParamsSchema`, `buildDietPrompt`, `buildRecipePrompt`, and the `dietPlans`/`recipes` branches of `runGeneration` |
| Function tests | `functions/src/ai/authoring/schemas.test.ts` imports all four deleted schemas (lines 4–8) and has `describe` blocks for each — it must be trimmed to the training schemas in the same commit or the build breaks. `generate.test.ts` covers only training and needs no change. `functions/src/ai/authoring/prompts.test.ts` imports `buildDietPrompt` and `buildRecipePrompt` and has a `describe` block for each — same treatment |
| Function exports | `functions/src/index.ts` gains `export * from "./recipes/generateRecipes"` and the purge callable. Line 17's `export * from "./ai/authoring/generate"` **stays** — `generateTrainingProgram` survives |
| Types | `DietPlan`, `DietDay`, `DietMeal`, `DietItem`, `DietParams`; `RecipeParams` replaced; `Recipe` reshaped per §6.1 |
| Client lib | `listDietPlans`, `createDietPlan`, `updateDietPlan`, `deleteDietPlan`, `aiGenerateDiet`, `aiGenerateRecipe`; recipe CRUD moves out of `clientPlans.ts` into a new `src/lib/firebase/recipes.ts` |
| UI | `DietTab.tsx` (297 lines), `editors/DietPlanEditor.tsx` (392 lines), the `diet` tab in `ClientDetailClient.tsx` |
| Rules | `clients/{id}/dietPlans` and `clients/{id}/recipes` blocks |
| i18n | ~32 `clients.diet.*` / `clients.aiGenerate.diet.*` / `clientDetail.tab.diet` keys × 5 locales removed. The **additions** are much larger than the three legal strings in §12.1: a full `recipes.*` namespace covering the library page, the enum form (every value in §7.1 needs a label), the share modal, the client page and the error states — plan for roughly 60–80 new keys × 5 locales |

`editors/RecipeEditor.tsx` survives, adapted to §6.1 — manually authoring a generic recipe is
legal and useful. Three concrete shape changes: `nutrition` → `nutritionPerServing`,
`prepMinutes` becomes required (it is optional at `src/types/clientPlans.ts:116`), and the
`onSave` payload typed inline at `RecipesTab.tsx:100-109` moves with it. `MacroTargets` is
reused for `nutritionPerServing`; without that it would be left orphaned when `DietPlan.targets`
and `RecipeParams.targetMacros` go.

### 10.1.1 Deleting the *deployed* functions

Removing the exports is not enough. `npm run deploy:functions` runs `firebase deploy --only
functions`, and the CLI only removes functions missing from source after an interactive
confirmation that is skipped when it is not attached to a TTY. Without an explicit step,
`generateDietPlan` and `generateRecipe` **stay live and invokable in `vfit-funlife`** with
their current `clientId` + `kcalTarget` signatures after this feature ships — and §11's
argument that the exposure is closed would be false.

The deploy step is therefore:

```bash
firebase functions:delete generateDietPlan generateRecipe --region europe-west1 --force
```

run after the deploy, and its output recorded in the implementation plan's verification.

`generateTrainingProgram` is **not** touched. It is the pre-P2-5 workout generator, out of
scope here, and removing it belongs to whatever retires the legacy training path.

### 10.2 `purgeLegacyNutritionData` callable

Superadmin only. `{ dryRun?: boolean }`, defaulting to `true`.

1. Collection-group scan of `dietPlans` and of `clients/*/recipes`.
2. Dry run returns counts and sample paths, writing nothing.
3. Live run first writes every document, verbatim with its path, to
   `gs://<default-bucket>/legal-purge/nutrition-<ISO8601>.json`, then deletes in batches of
   400, then writes one `audit_log` entry with both counts and the export path.
4. Export failure aborts before any delete.

Expected result on today's database: zero documents (§5).

## 11. Risk carried forward and closed

The 2026-08-08 decision to leave `generateDietPlan` live until this feature, rather than
pulling its removal forward as an emergency fix, is recorded here as an **accepted risk with a
known owner (Hidran)**, closed by §10 — specifically by §10.1.1, since deleting the source
export alone would leave the callable live. Exposure window: 2026-08-08 to the completion of
the `functions:delete` step. No diet plan documents were ever created in production (§5), so the exposure was the
availability of the tool, not the existence of artifacts.

## 12. Screens

| Route | Audience | Content |
|---|---|---|
| `/provider/recipes` (new) | Trainer | Library: generate (enum form), author manually, view, share, edit, delete. Trainer notice + disclaimer in the header |
| Client detail → `RecipesTab` (rewritten) | Trainer | Recipes shared with *this* client, plus "condividi dalla libreria". **No generation here** — generation is not per-client, by design |
| `/recipes` (new) | Client | "Consigliate dal tuo trainer" (array-contains) and "Le mie ricette" (`ownerUid == uid`), with their own generate button |

`SideDrawer` gains a "Ricette" entry — and, while there, the "Le mie schede" entry P2-5 never
added: `/plans` is currently reachable only by typing the URL.

### 12.1 Fixed legal copy (new i18n keys, all five locales)

| Key | Italian |
|---|---|
| `recipes.disclaimer` | "Suggerimenti a scopo informativo, non sostituiscono il parere di un professionista della nutrizione." |
| `recipes.trainerNotice` | "Non puoi prescrivere diete o piani alimentari. Qui trovi suggerimenti di ricette generiche da condividere con i tuoi clienti." |
| `recipes.forbiddenInput` | "Non è possibile richiedere ricette legate a condizioni di salute o obiettivi di peso. Rimuovi i riferimenti e riprova." |

`recipes.disclaimer` renders on **every** screen that shows a recipe, in both apps.
`recipes.trainerNotice` renders in the library header and inside the generate modal.

## 13. Tests

**`functions/test/recipes.test.ts`**
- `.strict()` params reject `kcalTarget`, `weightKg`, `condition`, `clientId`.
- Ingredient validation rejects any digit; rejects `diabete`, `Diabète`, `DIABETICI`, `per
  diabetici`, `dimagrire`, `1500 kcal`; accepts `pollo`, `zucchine`, `olio d'oliva`.
- A forbidden input consumes no quota (`reserveQuota` not called).
- **Output screening uses the §8.4 list, not the §7.2 one**: a recipe whose steps say "tipico
  della dieta mediterranea" and whose tags say "300 calorie a porzione" survives, while one
  saying "indicato per chi soffre di diabete" or "per il tuo deficit calorico" is dropped.
  When every recipe in a batch is dropped, the call throws `generation-unusable` and releases
  the quota.
- The built prompt contains only enum-derived phrases and sanitized ingredients — asserted by
  the absence of any client identifier, since the callable has no `clientId` to begin with.
- Role → quota mapping: `client` resolves to `recipeClientDailyQuota`, `provider` to
  `dailyQuota`.

**`functions/test/recipes-rules.test.ts`** (emulator, shaped like `booking-rules.test.ts`)
- Owner reads and updates their own recipe.
- A uid in `sharedWithUserIds` reads it; a uid not in it is denied.
- An outsider cannot create a recipe claiming another `ownerUid`.
- A create with a non-empty `sharedWithUserIds` is denied.
- An update pushing `sharedWithUserIds` past 50 is denied.
- **The four §6.4 query shapes are each exercised**, including the negative case: a bare
  `sharedWithUserIds array-contains <clientUid>` list by the owning trainer is denied, which
  is what forces the compound query.

## 14. Documentation updates

- `docs/features.md` — P2-6 checklist entry; diet-plan entries removed.
- `docs/database-schema.md` — `recipes` documented; `clients/*/dietPlans` and
  `clients/*/recipes` marked removed with the date and reason.
- `docs/backend/cloud-functions.md` — `generateRecipes` and `purgeLegacyNutritionData` added,
  `generateDietPlan` and `generateRecipe` removed.

## 15. Open risks

| Risk | Mitigation |
|---|---|
| Both denylists (§7.2 input, §8.4 output) are blocklists and will miss phrasings | They are the *third* line, not the first. The first is that no `clientId` exists; the second is an output schema that cannot hold a diet plan. The lists only have to catch what those two allow through, which is why they can afford to be tuned differently from each other |
| A trainer verbally prescribes a diet and uses recipes as cover | Out of the platform's reach. The trainer notice states the boundary in writing, on the screen, every time |
| The model returns indicative nutrition that is wrong | Values are labelled indicative per portion and carry the disclaimer. No decision of consequence rests on them |
| Five-locale i18n sweep across removal and addition | `completeness.test.ts` already fails on missing keys in any locale |

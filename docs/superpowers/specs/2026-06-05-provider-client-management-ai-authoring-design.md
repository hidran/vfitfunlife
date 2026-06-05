# Provider Client Management + AI Authoring — Design Spec

**Date:** 2026-06-05
**Status:** Approved (design) — pending implementation plan
**Author:** Hidran Arias (with Claude Code)
**Related:** builds on the AI engine from `2026-06-04-ai-assistant-concierge-design.md`

## 1. Summary

Verified providers and admin/superadmin staff get tools to manage each client and to
**author**, with AI, the artifacts they deliver:

- A per-client record of **Goals**, **Training Programs**, **Diet Plans**, and **Recipes**.
- Each artifact can be created **manually** (structured forms) or **generated one-shot by
  AI** (auto-saved, then editable).
- The existing `/provider/clients` roster + client-detail page already provide the client
  list, **historical meetings** (booking history), and provider notes — this feature adds
  the goals/plans/recipes on top.
- **Provider-internal for v1**: visible to the owning provider and to admin/superadmin;
  NOT shown in the customer app yet.

The AI reuses the multi-provider engine shipped for the customer assistant
(`functions/src/ai/providers.ts` `buildModel`, `keyPresence`, `AI_SECRETS`, `quota`,
`audit`) but is configured independently.

## 2. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Who can author | All **verified** providers + admin/superadmin (no new "pro" tier) |
| AI output mode | **One-shot auto-save** (generate → save → editable) |
| Plan format | **Structured** (training: weeks→days→exercises; diet: days→meals→items; recipes: ingredients+steps) |
| Customer visibility | **Provider-internal for v1** (owning provider + staff only) |
| Staff client scope | **Any client, platform-wide** (admin/superadmin); providers see only their own |
| Goals | **Structured** goal records (type/description/target/date/status) |
| AI config | **Separate** `systemSettings/aiAuthoring` doc: own enable/model/quota |
| Generation mechanism | AI SDK **`generateObject`** + Zod schema (validated structured output) |
| Storage | **Subcollections of `/clients/{clientId}`** |
| Recipes | **Per-client** for v1 (not a reusable provider library yet) |

## 3. Goals & Non-Goals

### Goals
- Provider/staff can view a client's goals, training programs, diet plans, and recipes.
- Create each manually (structured forms) or generate one-shot via AI (auto-saved).
- Admin/superadmin can do this for any client platform-wide.
- AI authoring is independently configurable and rate-limited by superadmin.

### Non-Goals (YAGNI for v1)
- No customer-facing view of plans/goals (provider-internal only).
- No "pro"/premium tier or monetization gating.
- No reusable provider-level recipe/exercise library (artifacts are per-client).
- No per-exercise/per-meal progress tracking or check-ins.
- No streaming for authoring (one-shot `generateObject`).
- No PDF export / sharing.

## 4. Existing surface reused

- `/clients/{clientId}` — denormalized provider↔customer relationship doc (`providerId`,
  `userId`), with `/notes` subcollection. Rules (`firestore.rules:647-660`):
  read/write if `isAdmin()` or `resource.data.providerId == request.auth.uid`.
- `ProviderClient` / `ClientNote` types (`src/types/provider.ts`).
- Provider client helpers (`src/lib/firebase/provider.ts`): `getProviderClients`,
  `getClientDetails` (loads bookings + notes), `addClientNote`.
- Client detail UI: `src/app/(main)/provider/clients/detail/ClientDetailClient.tsx`.
- Booking history = "meetings" (`Booking` type, `status: completed` etc.).
- AI engine: `functions/src/ai/providers.ts`, `quota.ts`, `lib/audit.ts`.
- Admin settings panel pattern: `src/components/admin/settings/AiAssistantSettings.tsx`.

## 5. Data model (Firestore)

All artifacts are subcollections of the client relationship doc `/clients/{clientId}`.

### Goals — `/clients/{clientId}/goals/{goalId}`
```ts
interface ClientGoal {
  id: string;
  type: 'weight_loss' | 'muscle_gain' | 'endurance' | 'mobility' | 'nutrition' | 'other';
  description: string;
  targetValue?: number;
  unit?: string;            // e.g. 'kg', 'km', 'reps'
  targetDate?: Timestamp;
  status: 'active' | 'achieved' | 'paused';
  createdBy: string;        // uid (provider or staff)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Training program — `/clients/{clientId}/trainingPrograms/{programId}`
```ts
interface TrainingExercise { name: string; sets: number; reps: string; restSec?: number; notes?: string; }
interface TrainingDay { label: string; focus?: string; exercises: TrainingExercise[]; }
interface TrainingWeek { weekNumber: number; days: TrainingDay[]; }
interface TrainingProgram {
  id: string;
  title: string;
  durationWeeks: number;
  daysPerWeek: number;
  weeks: TrainingWeek[];
  source: 'ai' | 'manual';
  model?: string;           // when source==='ai'
  status: 'active' | 'archived';
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Diet plan — `/clients/{clientId}/dietPlans/{planId}`
```ts
interface DietItem { food: string; quantity: string; kcal?: number; protein?: number; carbs?: number; fat?: number; }
interface DietMeal { name: string; time?: string; items: DietItem[]; }
interface DietDay { label: string; meals: DietMeal[]; }
interface MacroTargets { kcal?: number; protein?: number; carbs?: number; fat?: number; }
interface DietPlan {
  id: string;
  title: string;
  durationDays: number;
  targets?: MacroTargets;
  days: DietDay[];
  source: 'ai' | 'manual';
  model?: string;
  status: 'active' | 'archived';
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Recipe — `/clients/{clientId}/recipes/{recipeId}`
```ts
interface RecipeIngredient { item: string; quantity: string; }
interface Recipe {
  id: string;
  title: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  nutrition?: MacroTargets;
  tags?: string[];
  source: 'ai' | 'manual';
  model?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Firestore rules (mirror the `clients`/`notes` pattern)
For each new subcollection under `match /clients/{clientId}`:
```
match /goals/{goalId} {
  allow read, write: if isAdmin() ||
    (isAuthenticated() && get(/databases/$(database)/documents/clients/$(clientId)).data.providerId == request.auth.uid);
}
// identical blocks for trainingPrograms/{id}, dietPlans/{id}, recipes/{id}
```
(Plans are written by the client app for manual CRUD and by Cloud Functions for AI
generation; the Admin SDK bypasses rules, so the above governs client-side manual edits.)

### `ensureClient(providerId, userId)` (server helper)
Upserts `/clients/{clientId}` if missing (deterministic id = `${providerId}_${userId}`),
so authoring works even when the roster wasn't pre-populated by bookings. Returns the
clientId. Used by the AI generate callables and by the manual "add client" path.

> **Open dependency:** confirm during planning whether client docs use a deterministic id
> (`${providerId}_${userId}`) or a random id today. If random, `ensureClient` queries by
> `(providerId, userId)` before creating. The plan must match the existing `getProviderClients`
> id convention.

## 6. AI authoring backend (`functions/src/ai/authoring/`)

### Settings — `systemSettings/aiAuthoring` (superadmin only)
```ts
interface AiAuthoringSettings {
  enabled: boolean;
  provider: AiProviderId;   // reuses AiProviderId from ai/types
  model: string;            // default 'gemini-2.5-flash'
  temperature: number;      // default 0.4
  maxOutputTokens: number;  // default 4096 (plans are larger than chat replies)
  dailyQuota: number;       // per-provider generations/day, default 20
  systemPromptOverride?: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}
```
Defaults seeded on first read. Reuses `buildModel`, `keyPresence`, `AI_SECRETS`.

### Quota (generalized)
Generalize `functions/src/ai/quota.ts` so `reserveQuota`/`recordTokens`/`releaseQuota`
accept a **usage subcollection id** (default `ai_usage` for the customer assistant; pass
`ai_authoring_usage` here). Per-user (provider) per-day counter, transactional, same
semantics as the customer assistant.

### Callables (region `europe-west1`, `secrets: AI_SECRETS`)
- `generateTrainingProgram({ clientId, params })`
- `generateDietPlan({ clientId, params })`
- `generateRecipe({ clientId, params })`

Each callable:
1. `request.auth` required. Authorize: caller is `superadmin`/`admin`, OR a `provider`
   whose `providerStatus === 'verified'` AND owns the client (`client.providerId == uid`).
   Reject otherwise (`permission-denied`).
2. Load `aiAuthoring` settings; if `!enabled` → `HttpsError('failed-precondition','disabled')`.
3. `reserveQuota(uid, settings.dailyQuota, now, 'ai_authoring_usage')`.
4. Load context: the client's `goals` (active) + recent completed `bookings`
   (provider+user) + the provider-supplied `params`.
5. `generateObject({ model: buildModel(settings.provider, settings.model), schema, prompt, temperature, maxOutputTokens })`.
6. Save the validated object under the client (`source:'ai'`, `model`, `createdBy=uid`,
   timestamps); `recordTokens(...,'ai_authoring_usage')`; `writeAuditLog({ action:'create',
   entityType:'ai_plan', entityId: <docId> })` (add `'ai_plan'` to the audit `entityType`
   union).
7. Return the saved doc `{ id, ...plan }`.

**Zod schemas** (one per artifact) mirror the TS interfaces in §5 (excluding server-managed
fields id/source/model/createdBy/timestamps, which the callable sets). `generateObject`
validates the model output against these; on validation failure the SDK retries, else the
callable returns `internal`.

**Params (provider-supplied, validated with Zod):**
- Training: `{ focus?, durationWeeks (1-16), daysPerWeek (1-7), sessionMinutes?, level?: 'beginner'|'intermediate'|'advanced', equipment?: string, constraints?: string }`
- Diet: `{ durationDays (1-30), kcalTarget?, mealsPerDay (2-6), restrictions?: string, notes? }`
- Recipe: `{ mealType?: string, servings (1-12), constraints?: string, targetMacros?: MacroTargets, mustUse?: string, avoid?: string }`

**Prompt builders** (pure, testable): `buildTrainingPrompt`, `buildDietPrompt`,
`buildRecipePrompt` — incorporate client goals + history + params + locale; instruct the
model to produce realistic, safe plans, include a generic "not medical advice" disclaimer
in plan notes, and stay within the requested structure.

## 7. Client-side CRUD (`src/lib/firebase/clientPlans.ts`)
Typed helpers for manual create/update/delete/list of goals, training programs, diet plans,
recipes under `/clients/{clientId}/...`, plus thin wrappers calling the three AI callables
(`generateTrainingProgram`, etc.). New client types in `src/types/clientPlans.ts` mirroring §5.

## 8. UI

### Provider — extend `src/app/(main)/provider/clients/detail/`
Add tabs to the client detail view: **Overview · Meetings · Goals · Training · Diet ·
Recipes · Notes** (Overview/Meetings/Notes already exist). Each plan tab:
- A list of saved items (cards) with status + source badge (AI/manual) + edit/delete.
- **New** button → manual structured form (add weeks/days/exercises, meals/items, etc.).
- **Generate with AI** button → params form → submit calls the callable → spinner → the
  saved item opens in the structured editor.
- Goals tab: list/add/edit structured goals.
- Refactor `ClientDetailClient.tsx` into a tabbed shell with one focused component per tab
  (e.g. `GoalsTab.tsx`, `TrainingTab.tsx`, `DietTab.tsx`, `RecipesTab.tsx`) plus reusable
  structured editors, to keep files focused.

### Staff — `/admin/clients`
New searchable global client list (admin reads any `/clients`) linking into a **shared**
client-detail component used by both the provider route and the admin route. Access is
governed by Firestore rules (`isAdmin()` can read/write any client subcollection).

### i18n
New keys for tabs, forms, AI params, and the admin AI-Authoring settings panel, added to
all five locales (it/en/es/fr/de); `it` authoritative.

### Admin settings
New **"AI Authoring"** panel in `/admin/settings` (superadmin), same pattern as the existing
AI Assistant panel: enable kill-switch, provider/model, temperature, maxOutputTokens, daily
quota, optional system-prompt override, key-presence row, test connection. Backed by new
superadmin callables `getAiAuthoringSettings` / `updateAiAuthoringSettings` (audited).

## 9. Testing
- **Zod schemas**: valid object passes; malformed rejected.
- **Prompt builders** (pure): include goals/params/locale; safety disclaimer present.
- **Quota (generalized)**: parameterized usage bucket; transactional increment + reject at
  cap; release decrements.
- **Callable auth/authorization** (mock `firebase-admin`): verified-provider-owner allowed;
  other provider denied; admin allowed; disabled kill-switch rejected.
- **Generate flow with a mock model**: inject a fake `generateObject` result (canned plan)
  → assert it is saved under the correct client path with `source:'ai'` + audit entry.
- **Firestore rules tests**: provider reads/writes own client subcollections; another
  provider denied; admin allowed.
- **Client**: CRUD helpers; a tab component renders a saved program; a generate action
  calls the wrapper and renders the result (mock the callable).

## 10. Rollout
1. Data model + types + rules + CRUD helpers (no AI).
2. Manual structured UI in client detail + `/admin/clients` global list.
3. AI authoring settings + callables + "Generate with AI" buttons.
4. Deploy functions + rules; configure `aiAuthoring` (provider/model) as superadmin;
   verify via the Firebase emulator + Playwright (provider logs in → client → generate a
   program → it saves and renders).

## 11. Open questions / future work
- Client doc id convention (`ensureClient`) — confirm against existing roster (see §5 note).
- Later: customer-facing view of plans/goals (Phase 2 of visibility).
- Later: reusable provider library of exercises/recipes; progress tracking/check-ins;
  PDF export/share.
- Later: optional "pro" tier gating if monetization is introduced.

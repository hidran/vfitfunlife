# Provider Client Management + AI Authoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give verified providers and admin/superadmin per-client structured Goals, Training Programs, Diet Plans, and Recipes — each created manually or generated one-shot by AI (auto-saved, editable) — provider-internal for v1.

**Architecture:** Artifacts are subcollections of the existing `/clients/{clientId}` relationship doc. Manual CRUD goes through the client SDK (governed by Firestore rules); AI generation goes through new Cloud Functions that use the AI SDK's `generateObject` (Zod-validated structured output) over the existing multi-provider engine, with an independent `systemSettings/aiAuthoring` config + per-provider daily quota. UI extends the existing provider client-detail page with tabs and adds a staff `/admin/clients` list that reuses the same detail component.

**Tech Stack:** Firebase Functions v2 (Node 24, `europe-west1`), Vercel AI SDK v5 (`generateObject`), Zod 4, Firestore, Next.js (App Router, static export) + Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-provider-client-management-ai-authoring-design.md`

---

## Conventions (verified against the codebase)

- Existing client doc: `/clients/{clientId}` with `providerId`, `userId`, denormalized stats. Doc id is arbitrary (not deterministic). Authoring always operates on an **existing** `clientId` reached from the roster — **no `ensureClient` is needed** (simplification vs spec §5).
- Client helpers live in `src/lib/firebase/provider.ts` (`getProviderClients`, `getClientDetails`, `addClientNote`); `getCurrentProviderId()` returns the caller's uid. New plan helpers go in a focused new file `src/lib/firebase/clientPlans.ts`.
- Client detail UI: `src/app/(main)/provider/clients/detail/ClientDetailClient.tsx` (+ `page.tsx` reads `?id=` clientId). Provider area gated by `canAccessProviderArea(providerStatus)` (`src/lib/providerStatus.ts`).
- Server fn pattern: `onCall({ region, secrets }, handler)`, `region = process.env.FIREBASE_REGION || "europe-west1"`; `requireSuperAdmin`/`checkIsAdmin`/`getUserRoleInfo` in `functions/src/utils/roles.ts`; `writeAuditLog` in `functions/src/lib/audit.ts`.
- AI engine (shipped): `functions/src/ai/providers.ts` (`buildModel`, `keyPresence`, `AI_SECRETS`), `functions/src/ai/quota.ts`, `functions/src/ai/types.ts` (`AiProviderId`), `functions/src/ai/settings.ts` (pattern).
- Tests: server `cd functions && npm run test -- <name>` (Vitest, colocated `src/**/*.test.ts`; `.eslintignore` already excludes `src/**/*.test.ts`; `tsconfig.json` excludes them from build). Client `npm run test -- <name>`; `npx tsc --noEmit` at root; `npm run build` for static export. Emulator: `npm run emulators` + `npm run seed:emulator` + `npm run dev:emulator`; test logins `test@vfit.dev` (customer) / `admin@vfit.dev` (superadmin), password `test1234`.
- i18n: add keys to ALL of `src/i18n/messages/{it,en,es,fr,de}.ts` (`it.ts` is the `MessageKey` source; `Messages = Record<MessageKey,string>` → tsc fails if any locale misses a key).
- **No `Co-Authored-By` trailer** on commits in this repo.

> **AI SDK note:** Use `generateObject({ model, schema, prompt, temperature, maxOutputTokens })` from `ai@5`. It returns `{ object }` validated against the Zod `schema`. Confirm the exact return shape against installed `functions/node_modules/ai` types during Task C3.

---

## Shared contracts (created in Task A1, imported everywhere)

```ts
// src/types/clientPlans.ts (client) — mirrored server-side in functions/src/ai/authoring/schemas.ts
export type PlanSource = "ai" | "manual";
export type PlanStatus = "active" | "archived";

export interface MacroTargets { kcal?: number; protein?: number; carbs?: number; fat?: number; }

export type GoalType = "weight_loss" | "muscle_gain" | "endurance" | "mobility" | "nutrition" | "other";
export type GoalStatus = "active" | "achieved" | "paused";
export interface ClientGoal {
  id: string;
  type: GoalType;
  description: string;
  targetValue?: number;
  unit?: string;
  targetDate?: string | null;   // ISO date string on the client; Timestamp in Firestore
  status: GoalStatus;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TrainingExercise { name: string; sets: number; reps: string; restSec?: number; notes?: string; }
export interface TrainingDay { label: string; focus?: string; exercises: TrainingExercise[]; }
export interface TrainingWeek { weekNumber: number; days: TrainingDay[]; }
export interface TrainingProgram {
  id: string;
  title: string;
  durationWeeks: number;
  daysPerWeek: number;
  weeks: TrainingWeek[];
  source: PlanSource;
  model?: string;
  status: PlanStatus;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DietItem { food: string; quantity: string; kcal?: number; protein?: number; carbs?: number; fat?: number; }
export interface DietMeal { name: string; time?: string; items: DietItem[]; }
export interface DietDay { label: string; meals: DietMeal[]; }
export interface DietPlan {
  id: string;
  title: string;
  durationDays: number;
  targets?: MacroTargets;
  days: DietDay[];
  source: PlanSource;
  model?: string;
  status: PlanStatus;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipeIngredient { item: string; quantity: string; }
export interface Recipe {
  id: string;
  title: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  nutrition?: MacroTargets;
  tags?: string[];
  source: PlanSource;
  model?: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

// AI generation params (provider-supplied)
export interface TrainingParams { focus?: string; durationWeeks: number; daysPerWeek: number; sessionMinutes?: number; level?: "beginner" | "intermediate" | "advanced"; equipment?: string; constraints?: string; }
export interface DietParams { durationDays: number; kcalTarget?: number; mealsPerDay: number; restrictions?: string; notes?: string; }
export interface RecipeParams { mealType?: string; servings: number; constraints?: string; targetMacros?: MacroTargets; mustUse?: string; avoid?: string; }
```

---

## Phase A — Data model, types, rules, CRUD helpers

### Task A1: Client plan types

**Files:** Create `src/types/clientPlans.ts`

- [ ] **Step 1: Create the file** with the entire "Shared contracts" block above.

- [ ] **Step 2: Typecheck**

Run: `cd /Users/hidranarias/projects/vfit && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/types/clientPlans.ts
git commit -m "feat(clients): add client plan types (goals/training/diet/recipes)"
```

---

### Task A2: Firestore rules for client plan subcollections

**Files:** Modify `firestore.rules` (inside `match /clients/{clientId} { ... }`, after the existing `match /notes/{noteId}` block, before the `clients` block closes ~line 642)

- [ ] **Step 1: Add the four subcollection rule blocks**

```
      match /goals/{goalId} {
        allow read, write: if isAdmin() ||
          (isAuthenticated() && get(/databases/$(database)/documents/clients/$(clientId)).data.providerId == request.auth.uid);
      }
      match /trainingPrograms/{programId} {
        allow read, write: if isAdmin() ||
          (isAuthenticated() && get(/databases/$(database)/documents/clients/$(clientId)).data.providerId == request.auth.uid);
      }
      match /dietPlans/{planId} {
        allow read, write: if isAdmin() ||
          (isAuthenticated() && get(/databases/$(database)/documents/clients/$(clientId)).data.providerId == request.auth.uid);
      }
      match /recipes/{recipeId} {
        allow read, write: if isAdmin() ||
          (isAuthenticated() && get(/databases/$(database)/documents/clients/$(clientId)).data.providerId == request.auth.uid);
      }
```

(The existing `clients/{clientId}` block already allows `isAdmin()` plus the owning provider; these subcollection blocks mirror that. Verify exact insertion point by reading the `match /clients/{clientId}` block first.)

- [ ] **Step 2: Validate rules compile**

Use the Firebase MCP `firebase_validate_security_rules` on `firestore.rules`, or run `firebase emulators:exec --only firestore "true"`.
Expected: 0 errors (pre-existing warnings about `get`/`exists`/`request`/unused helpers are unrelated).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(clients): firestore rules for client plan subcollections"
```

---

### Task A3: Client-side CRUD helpers (manual create/update/delete/list)

**Files:** Create `src/lib/firebase/clientPlans.ts`

These are thin typed Firestore helpers. The `clientId` is supplied by the caller (from the roster/detail page). All write `createdBy` from `auth.currentUser?.uid`.

- [ ] **Step 1: Implement `src/lib/firebase/clientPlans.ts`**

```ts
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db, auth } from "./config";
import type { ClientGoal, TrainingProgram, DietPlan, Recipe } from "@/types/clientPlans";

const CLIENTS = "clients";

function uid(): string {
  const u = auth.currentUser?.uid;
  if (!u) throw new Error("Not authenticated");
  return u;
}

function toIso(v: unknown): string | undefined {
  return v instanceof Timestamp ? v.toDate().toISOString() : undefined;
}

// ---- Goals ----
export async function listGoals(clientId: string): Promise<ClientGoal[]> {
  const snap = await getDocs(query(collection(db, CLIENTS, clientId, "goals"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, targetDate: toIso(data.targetDate) ?? null, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt) } as ClientGoal;
  });
}
export async function createGoal(clientId: string, goal: Omit<ClientGoal, "id" | "createdBy" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(collection(db, CLIENTS, clientId, "goals"), {
    ...goal,
    targetDate: goal.targetDate ? Timestamp.fromDate(new Date(goal.targetDate)) : null,
    createdBy: uid(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}
export async function updateGoal(clientId: string, goalId: string, patch: Partial<ClientGoal>): Promise<void> {
  const { id, createdBy, createdAt, ...rest } = patch;
  await updateDoc(doc(db, CLIENTS, clientId, "goals", goalId), {
    ...rest,
    ...(rest.targetDate !== undefined ? { targetDate: rest.targetDate ? Timestamp.fromDate(new Date(rest.targetDate)) : null } : {}),
    updatedAt: serverTimestamp(),
  });
}
export async function deleteGoal(clientId: string, goalId: string): Promise<void> {
  await deleteDoc(doc(db, CLIENTS, clientId, "goals", goalId));
}

// ---- Generic plan CRUD (training / diet / recipes) ----
type PlanKind = "trainingPrograms" | "dietPlans" | "recipes";
async function listPlans<T>(clientId: string, kind: PlanKind): Promise<T[]> {
  const snap = await getDocs(query(collection(db, CLIENTS, clientId, kind), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt) } as T;
  });
}
async function createPlan(clientId: string, kind: PlanKind, plan: Record<string, unknown>): Promise<string> {
  const ref = await addDoc(collection(db, CLIENTS, clientId, kind), {
    ...plan, source: "manual", createdBy: uid(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}
async function updatePlan(clientId: string, kind: PlanKind, id: string, patch: Record<string, unknown>): Promise<void> {
  const { id: _i, createdBy: _c, createdAt: _ca, source: _s, ...rest } = patch as Record<string, unknown>;
  await updateDoc(doc(db, CLIENTS, clientId, kind, id), { ...rest, updatedAt: serverTimestamp() });
}
async function deletePlan(clientId: string, kind: PlanKind, id: string): Promise<void> {
  await deleteDoc(doc(db, CLIENTS, clientId, kind, id));
}

export const listTrainingPrograms = (c: string) => listPlans<TrainingProgram>(c, "trainingPrograms");
export const createTrainingProgram = (c: string, p: Omit<TrainingProgram, "id" | "source" | "createdBy" | "createdAt" | "updatedAt">) => createPlan(c, "trainingPrograms", p);
export const updateTrainingProgram = (c: string, id: string, p: Partial<TrainingProgram>) => updatePlan(c, "trainingPrograms", id, p);
export const deleteTrainingProgram = (c: string, id: string) => deletePlan(c, "trainingPrograms", id);

export const listDietPlans = (c: string) => listPlans<DietPlan>(c, "dietPlans");
export const createDietPlan = (c: string, p: Omit<DietPlan, "id" | "source" | "createdBy" | "createdAt" | "updatedAt">) => createPlan(c, "dietPlans", p);
export const updateDietPlan = (c: string, id: string, p: Partial<DietPlan>) => updatePlan(c, "dietPlans", id, p);
export const deleteDietPlan = (c: string, id: string) => deletePlan(c, "dietPlans", id);

export const listRecipes = (c: string) => listPlans<Recipe>(c, "recipes");
export const createRecipe = (c: string, p: Omit<Recipe, "id" | "source" | "createdBy" | "createdAt" | "updatedAt">) => createPlan(c, "recipes", p);
export const updateRecipe = (c: string, id: string, p: Partial<Recipe>) => updatePlan(c, "recipes", id, p);
export const deleteRecipe = (c: string, id: string) => deletePlan(c, "recipes", id);
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/hidranarias/projects/vfit && npx tsc --noEmit`
Expected: exit 0. (Confirm `auth` is exported from `./config` — it is.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/firebase/clientPlans.ts
git commit -m "feat(clients): CRUD helpers for client goals/training/diet/recipes"
```

---

## Phase B — Manual UI (no AI yet)

> Before B1, read `src/app/(main)/provider/clients/detail/ClientDetailClient.tsx` and `page.tsx` to learn the existing layout, styling tokens, and how `clientId`/data load. Mirror the existing visual style (theme tokens `bg-surface`, `border-hairline`, `text-content`, accent `#00C9FF`; `useI18n`).

### Task B1: Tabbed shell for the client detail page

**Files:** Modify `src/app/(main)/provider/clients/detail/ClientDetailClient.tsx`; Create `src/app/(main)/provider/clients/detail/tabs/` directory.

- [ ] **Step 1:** Introduce a tab state (`'overview' | 'meetings' | 'goals' | 'training' | 'diet' | 'recipes' | 'notes'`) and a tab bar (horizontally scrollable on mobile). Move the existing overview/booking-history/notes JSX into `OverviewTab`, `MeetingsTab`, `NotesTab` components under `tabs/` (preserve current behavior; pass the already-loaded `client`, `bookingHistory`, `notes`). The shell renders the active tab. Keep `clientId` (from `?id=`) available to all tabs.
- [ ] **Step 2:** Typecheck + build: `npx tsc --noEmit && npm run build` → exit 0; the page still shows overview/meetings/notes as before.
- [ ] **Step 3: Commit** `git commit -am "refactor(clients): tabbed client-detail shell (overview/meetings/notes)"`

### Task B2: Goals tab

**Files:** Create `src/app/(main)/provider/clients/detail/tabs/GoalsTab.tsx`

- [ ] **Step 1:** Component takes `{ clientId }`. On mount, `listGoals(clientId)`. Renders goal cards (type badge, description, target value+unit, target date, status). "New goal" + edit open a structured form (type select, description, targetValue number, unit, targetDate date, status select) → `createGoal`/`updateGoal`; delete → `deleteGoal`; reload after each. Use `useI18n` for labels (keys added in B7).
- [ ] **Step 2:** Wire into the shell (B1). Typecheck + build → exit 0.
- [ ] **Step 3: Commit** `git commit -am "feat(clients): goals tab with structured CRUD"`

### Task B3: Training tab + program editor

**Files:** Create `tabs/TrainingTab.tsx`, `tabs/editors/TrainingProgramEditor.tsx`

- [ ] **Step 1:** `TrainingTab({ clientId })`: `listTrainingPrograms`, render program cards (title, durationWeeks×daysPerWeek, source badge, status). "New" opens `TrainingProgramEditor` (empty). Edit opens it with the program. Editor renders the nested structure: title, durationWeeks, daysPerWeek; weeks → days → exercises (name, sets, reps, restSec, notes) with add/remove row buttons. Save → `createTrainingProgram`/`updateTrainingProgram`. Delete → `deleteTrainingProgram`.
- [ ] **Step 2:** Typecheck + build → exit 0.
- [ ] **Step 3: Commit** `git commit -am "feat(clients): training programs tab + structured editor"`

### Task B4: Diet tab + editor

**Files:** Create `tabs/DietTab.tsx`, `tabs/editors/DietPlanEditor.tsx`

- [ ] **Step 1:** `DietTab({ clientId })`: `listDietPlans`, cards (title, durationDays, targets summary, source/status). Editor: title, durationDays, optional macro targets; days → meals (name, time) → items (food, quantity, optional kcal/protein/carbs/fat) with add/remove. Save/delete via diet helpers.
- [ ] **Step 2:** Typecheck + build → exit 0.
- [ ] **Step 3: Commit** `git commit -am "feat(clients): diet plans tab + structured editor"`

### Task B5: Recipes tab + editor

**Files:** Create `tabs/RecipesTab.tsx`, `tabs/editors/RecipeEditor.tsx`

- [ ] **Step 1:** `RecipesTab({ clientId })`: `listRecipes`, cards (title, servings, prep/cook minutes, tags). Editor: title, servings, prep/cook minutes, ingredients (item, quantity) list, steps (ordered string list), optional nutrition macros, tags. Save/delete via recipe helpers.
- [ ] **Step 2:** Typecheck + build → exit 0.
- [ ] **Step 3: Commit** `git commit -am "feat(clients): recipes tab + structured editor"`

### Task B6: Staff global clients list (`/admin/clients`)

**Files:** Create `src/app/admin/clients/page.tsx` + a client component; reuse the detail component.

- [ ] **Step 1:** A page (admin-gated like other `/admin/*` pages) listing all `/clients` (query the `clients` collection ordered by `lastVisit` desc, client-side search by name/email — admin reads are allowed by rules). Each row links to the existing client detail route `/provider/clients/detail?id=<clientId>`. **Allow staff into the detail route:** in `src/app/(main)/provider/layout.tsx` (or the detail page guard), permit `role==='admin'||'superadmin'` in addition to `canAccessProviderArea`. Also relax `getClientDetails` (provider.ts) so admins aren't blocked by the `providerId !== providerId` check: if the caller is admin/superadmin, skip the ownership check (read role via the auth store or pass an `isAdmin` flag).
- [ ] **Step 2:** Typecheck + build → exit 0. Add an "Admin/Clients" nav entry if the admin sidebar lists sections (`src/components/admin/Sidebar.tsx`).
- [ ] **Step 3: Commit** `git commit -am "feat(admin): global clients list reusing client-detail tabs"`

### Task B7: i18n keys for Phase B

**Files:** Modify `src/i18n/messages/{it,en,es,fr,de}.ts`

- [ ] **Step 1:** Add keys for tab labels and all form/field labels used in B1–B6, e.g.: `clientDetail.tab.goals|training|diet|recipes`, `clients.goals.new|type|description|target|unit|date|status`, `clients.training.new|title|weeks|daysPerWeek|week|day|exercise|sets|reps|rest|notes`, `clients.diet.*`, `clients.recipes.*`, `clients.common.{new,edit,save,delete,cancel,aiBadge,manualBadge}`, `admin.clients.title|search`. Provide it (authoritative) + en/es/fr/de translations.
- [ ] **Step 2:** `npx tsc --noEmit` → exit 0 (proves locale parity).
- [ ] **Step 3: Commit** `git commit -am "feat(i18n): client plans + admin clients keys (5 locales)"`

---

## Phase C — AI authoring backend + Generate buttons

### Task C1: Generalize the quota module

**Files:** Modify `functions/src/ai/quota.ts`; Modify `functions/src/ai/quota.test.ts`

- [ ] **Step 1: Update tests** — add a usage-bucket param. `usageDocPath(uid, now, bucket = "ai_usage")` builds `users/{uid}/{bucket}/{YYYY-MM-DD}`. Add a test: `usageDocPath("u1", new Date("2026-06-05T10:00:00Z"), "ai_authoring_usage") === "users/u1/ai_authoring_usage/2026-06-05"`. Keep the default-bucket test passing.

```ts
it("supports a custom usage bucket", () => {
  expect(usageDocPath("u1", new Date("2026-06-05T10:00:00Z"), "ai_authoring_usage"))
    .toBe("users/u1/ai_authoring_usage/2026-06-05");
});
```

- [ ] **Step 2: Run → fail.** `cd functions && npm run test -- quota` → FAIL (arity).
- [ ] **Step 3: Implement** — thread an optional `bucket = "ai_usage"` param through `usageDocPath`, `reserveQuota`, `recordTokens`, `releaseQuota` (all default to `ai_usage` so the customer assistant is unchanged).
- [ ] **Step 4: Run → pass.** `cd functions && npm run test -- quota` → PASS.
- [ ] **Step 5: Commit** `git commit -am "refactor(ai): parameterize quota usage bucket"`

### Task C2: Authoring settings + Zod schemas + prompt builders

**Files:** Create `functions/src/ai/authoring/settings.ts`, `functions/src/ai/authoring/schemas.ts`, `functions/src/ai/authoring/prompts.ts`, and tests `schemas.test.ts`, `prompts.test.ts`.

- [ ] **Step 1: `settings.ts`** — `AiAuthoringSettings` type + `DEFAULT_AI_AUTHORING_SETTINGS` (`{ enabled:false, provider:"google", model:"gemini-2.5-flash", temperature:0.4, maxOutputTokens:4096, dailyQuota:20 }`), `AI_AUTHORING_DOC = "systemSettings/aiAuthoring"`, `mergeAiAuthoringSettings`, `getAiAuthoringSettings()` (try/catch Firestore read → merge defaults). Mirror `functions/src/ai/settings.ts`.

- [ ] **Step 2: `schemas.ts`** — Zod schemas for the generated objects (server output, excluding server-set fields), and for the params. Plus a test.

```ts
import { z } from "zod";

export const trainingProgramSchema = z.object({
  title: z.string(),
  durationWeeks: z.number().int().min(1).max(16),
  daysPerWeek: z.number().int().min(1).max(7),
  weeks: z.array(z.object({
    weekNumber: z.number().int(),
    days: z.array(z.object({
      label: z.string(),
      focus: z.string().optional(),
      exercises: z.array(z.object({
        name: z.string(), sets: z.number().int(), reps: z.string(),
        restSec: z.number().int().optional(), notes: z.string().optional(),
      })),
    })),
  })),
});

const macro = z.object({ kcal: z.number().optional(), protein: z.number().optional(), carbs: z.number().optional(), fat: z.number().optional() });

export const dietPlanSchema = z.object({
  title: z.string(),
  durationDays: z.number().int().min(1).max(30),
  targets: macro.optional(),
  days: z.array(z.object({
    label: z.string(),
    meals: z.array(z.object({
      name: z.string(), time: z.string().optional(),
      items: z.array(z.object({ food: z.string(), quantity: z.string(), kcal: z.number().optional(), protein: z.number().optional(), carbs: z.number().optional(), fat: z.number().optional() })),
    })),
  })),
});

export const recipeSchema = z.object({
  title: z.string(),
  servings: z.number().int().min(1).max(12),
  prepMinutes: z.number().int().optional(),
  cookMinutes: z.number().int().optional(),
  ingredients: z.array(z.object({ item: z.string(), quantity: z.string() })),
  steps: z.array(z.string()),
  nutrition: macro.optional(),
  tags: z.array(z.string()).optional(),
});

export const trainingParamsSchema = z.object({
  focus: z.string().optional(),
  durationWeeks: z.number().int().min(1).max(16),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  equipment: z.string().optional(),
  constraints: z.string().optional(),
});
export const dietParamsSchema = z.object({
  durationDays: z.number().int().min(1).max(30),
  kcalTarget: z.number().int().min(800).max(6000).optional(),
  mealsPerDay: z.number().int().min(2).max(6),
  restrictions: z.string().optional(),
  notes: z.string().optional(),
});
export const recipeParamsSchema = z.object({
  mealType: z.string().optional(),
  servings: z.number().int().min(1).max(12),
  constraints: z.string().optional(),
  targetMacros: macro.optional(),
  mustUse: z.string().optional(),
  avoid: z.string().optional(),
});
```

Test (`schemas.test.ts`): a valid training object parses; a missing `title` throws; `trainingParamsSchema` rejects `durationWeeks: 0`.

- [ ] **Step 3: `prompts.ts`** — pure builders `buildTrainingPrompt(ctx)`, `buildDietPrompt(ctx)`, `buildRecipePrompt(ctx)` where `ctx = { locale, params, goals: ClientGoalLite[], recentSessions: string[] }`. Each returns a string instructing the model to: produce a realistic, safe, structured plan matching the requested params; respect the client's goals + recent sessions; write in the given locale; include a brief "general guidance, not medical advice" note in the plan's notes/first step. Test: prompt includes the locale language, the focus/restrictions, and the disclaimer phrase.

- [ ] **Step 4:** Run `cd functions && npm run test -- schemas && npm run test -- prompts && npm run build` → all pass / exit 0.
- [ ] **Step 5: Commit** `git commit -am "feat(ai): authoring settings, zod schemas, prompt builders"`

### Task C3: Generate callables

**Files:** Create `functions/src/ai/authoring/generate.ts`; Modify `functions/src/lib/audit.ts` (add `"ai_plan"` to the `entityType` union); Modify `functions/src/index.ts` (export `./ai/authoring/generate`).

- [ ] **Step 1: Add `"ai_plan"` to the audit `entityType` union** in `functions/src/lib/audit.ts`.

- [ ] **Step 2: Implement `generate.ts`** — a shared helper + three callables.

```ts
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateObject } from "ai";
import { z } from "zod";
import { buildModel, AI_SECRETS } from "../providers";
import { getAiAuthoringSettings } from "./settings";
import { reserveQuota, recordTokens, releaseQuota } from "../quota";
import { writeAuditLog } from "../../lib/audit";
import { getUserRoleInfo } from "../../utils/roles";
import { trainingProgramSchema, dietPlanSchema, recipeSchema, trainingParamsSchema, dietParamsSchema, recipeParamsSchema } from "./schemas";
import { buildTrainingPrompt, buildDietPrompt, buildRecipePrompt } from "./prompts";

const region = process.env.FIREBASE_REGION || "europe-west1";
const BUCKET = "ai_authoring_usage";

interface GenReq { clientId: string; locale?: string; params: unknown; }

/** Authorize: superadmin/admin OR verified provider who owns the client. Returns the client doc data. */
async function authorizeClient(uid: string, clientId: string) {
  const role = await getUserRoleInfo(uid);
  if (!role) throw new HttpsError("permission-denied", "Unknown user");
  const isStaff = role.role === "admin" || role.role === "superadmin";
  const snap = await admin.firestore().collection("clients").doc(clientId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Client not found");
  const client = snap.data() as { providerId?: string };
  const isOwner = role.role === "provider" && client.providerId === uid;
  if (!isStaff && !isOwner) throw new HttpsError("permission-denied", "Not authorized for this client");
  return { snap, client };
}

async function runGeneration<T extends z.ZodTypeAny>(opts: {
  request: CallableRequest<GenReq>;
  paramsSchema: z.ZodTypeAny;
  outputSchema: T;
  buildPrompt: (ctx: { locale: string; params: any; goals: any[]; recentSessions: string[] }) => string;
  subcollection: "trainingPrograms" | "dietPlans" | "recipes";
}) {
  const { request } = opts;
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
  const uid = request.auth.uid;
  const db = admin.firestore();
  const now = new Date();

  const clientId = request.data.clientId;
  if (!clientId) throw new HttpsError("invalid-argument", "Missing clientId");
  await authorizeClient(uid, clientId);

  let params;
  try { params = opts.paramsSchema.parse(request.data.params); }
  catch (e: any) { throw new HttpsError("invalid-argument", e?.message ?? "Invalid params"); }

  const settings = await getAiAuthoringSettings();
  if (!settings.enabled) throw new HttpsError("failed-precondition", "disabled");

  try { await reserveQuota(uid, settings.dailyQuota, now, BUCKET); }
  catch (e: any) { if (e?.code === "quota-exceeded") throw new HttpsError("resource-exhausted", "quota-exceeded"); throw e; }

  // Context: active goals + recent completed sessions
  const clientSnap = await db.collection("clients").doc(clientId).get();
  const userId = (clientSnap.data() as any)?.userId;
  const goalsSnap = await db.collection("clients").doc(clientId).collection("goals").where("status", "==", "active").get().catch(() => null);
  const goals = (goalsSnap?.docs ?? []).map((d) => d.data());
  let recentSessions: string[] = [];
  if (userId) {
    const bk = await db.collection("bookings").where("userId", "==", userId).where("status", "==", "completed").limit(5).get().catch(() => null);
    recentSessions = (bk?.docs ?? []).map((d) => (d.data() as any).serviceName).filter(Boolean);
  }

  const prompt = opts.buildPrompt({ locale: request.data.locale ?? "it", params, goals, recentSessions });

  let object: any;
  try {
    const res = await generateObject({
      model: buildModel(settings.provider, settings.model),
      schema: opts.outputSchema,
      prompt,
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
    });
    object = res.object;
    const usage = (res as any).usage;
    await recordTokens(uid, now, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0, BUCKET);
  } catch (err) {
    console.error("[ai-authoring] generateObject failed", err);
    await releaseQuota(uid, now, BUCKET);
    throw new HttpsError("internal", "Generation failed");
  }

  const ref = await db.collection("clients").doc(clientId).collection(opts.subcollection).add({
    ...object,
    source: "ai",
    model: settings.model,
    status: opts.subcollection === "recipes" ? undefined : "active",
    createdBy: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUid: uid, actorEmail: request.auth.token?.email ?? "", actorRole: "admin",
    action: "create", entityType: "ai_plan", entityId: ref.id,
    after: { clientId, kind: opts.subcollection },
  });

  return { id: ref.id, ...object, source: "ai", model: settings.model };
}

export const generateTrainingProgram = onCall<GenReq>({ region, secrets: AI_SECRETS }, (request) =>
  runGeneration({ request, paramsSchema: trainingParamsSchema, outputSchema: trainingProgramSchema, buildPrompt: buildTrainingPrompt, subcollection: "trainingPrograms" }));

export const generateDietPlan = onCall<GenReq>({ region, secrets: AI_SECRETS }, (request) =>
  runGeneration({ request, paramsSchema: dietParamsSchema, outputSchema: dietPlanSchema, buildPrompt: buildDietPrompt, subcollection: "dietPlans" }));

export const generateRecipe = onCall<GenReq>({ region, secrets: AI_SECRETS }, (request) =>
  runGeneration({ request, paramsSchema: recipeParamsSchema, outputSchema: recipeSchema, buildPrompt: buildRecipePrompt, subcollection: "recipes" }));
```

> Note: `status: undefined` is dropped by Firestore on write; recipes legitimately have no status. The `actorRole: "admin"` literal satisfies the audit type (the union is `"admin"|"superadmin"`); pass the real role if you prefer — read it in `authorizeClient` and thread it through.

- [ ] **Step 3: Wire exports** — add `export * from "./ai/authoring/generate";` to `functions/src/index.ts`.

- [ ] **Step 4: Build.** `cd functions && npm run build` → exit 0. (Confirm `generateObject` return shape `{ object, usage }` against installed `ai@5` types; adjust the `usage` access if needed.)

- [ ] **Step 5: Test the generate flow with a mocked model** — `functions/src/ai/authoring/generate.test.ts`. Mock `firebase-admin` (client doc + subcollection `.add` spy) and mock `../providers` `buildModel`, and mock `ai`'s `generateObject` to return a canned `{ object, usage }`. Assert: an unauthorized provider (not owner, not staff) → throws; owner provider → `.add` called on the right subcollection path with `source:"ai"`; disabled settings → throws `failed-precondition`. (Use `vi.mock` + `vi.hoisted` per the repo convention.)

Run: `cd functions && npm run test -- authoring/generate` → PASS.

- [ ] **Step 6: Commit** `git commit -am "feat(ai): generateTrainingProgram/DietPlan/Recipe callables (generateObject)"`

### Task C4: Authoring settings admin callables

**Files:** Create `functions/src/ai/authoring/admin.ts` (+ `admin.test.ts`); export from `functions/src/index.ts`.

- [ ] **Step 1:** `validateAuthoringPatch` (Zod: enabled?, provider?, model?, temperature 0–2, maxOutputTokens 256–8192, dailyQuota 0–500, systemPromptOverride? ≤4000) + test (valid passes; bad provider/out-of-range throws). Mirror `functions/src/ai/admin.ts`.
- [ ] **Step 2:** `getAiAuthoringSettingsAdmin` (superadmin; returns `{ settings, keyPresence }`, `secrets: AI_SECRETS`), `updateAiAuthoringSettings` (superadmin; validates, merges into `systemSettings/aiAuthoring`, writes `audit_logs` with `entityType:"ai_settings"`). Reuse `requireSuperAdmin`, `keyPresence`.
- [ ] **Step 3:** Export from `index.ts`. Run `cd functions && npm run test -- authoring/admin && npm run build` → pass/exit 0.
- [ ] **Step 4: Commit** `git commit -am "feat(ai): superadmin authoring settings callables"`

### Task C5: Client wrappers + "Generate with AI" param forms

**Files:** Modify `src/lib/firebase/clientPlans.ts` (add callable wrappers); Modify the three tab components (B3–B5) to add a "Generate with AI" button + params form; Modify `src/lib/firebase/functions.ts` if wrappers belong there (keep plan-related wrappers in `clientPlans.ts` for cohesion).

- [ ] **Step 1: Add callable wrappers** to `clientPlans.ts`:

```ts
import { httpsCallable } from "firebase/functions";
import { functions } from "./config";
import type { TrainingProgram, DietPlan, Recipe, TrainingParams, DietParams, RecipeParams } from "@/types/clientPlans";

export async function aiGenerateTraining(clientId: string, params: TrainingParams, locale: string): Promise<TrainingProgram> {
  const fn = httpsCallable<{ clientId: string; params: TrainingParams; locale: string }, TrainingProgram>(functions, "generateTrainingProgram");
  return (await fn({ clientId, params, locale })).data;
}
export async function aiGenerateDiet(clientId: string, params: DietParams, locale: string): Promise<DietPlan> {
  const fn = httpsCallable<{ clientId: string; params: DietParams; locale: string }, DietPlan>(functions, "generateDietPlan");
  return (await fn({ clientId, params, locale })).data;
}
export async function aiGenerateRecipe(clientId: string, params: RecipeParams, locale: string): Promise<Recipe> {
  const fn = httpsCallable<{ clientId: string; params: RecipeParams; locale: string }, Recipe>(functions, "generateRecipe");
  return (await fn({ clientId, params, locale })).data;
}
```

- [ ] **Step 2:** In each tab, add a **"Generate with AI"** button opening a params form (Training: focus, durationWeeks, daysPerWeek, sessionMinutes, level, equipment, constraints; Diet: durationDays, kcalTarget, mealsPerDay, restrictions, notes; Recipe: mealType, servings, constraints, mustUse, avoid). On submit: call the wrapper with `locale` from `useI18n`, show a spinner, then reload the list and open the returned item in the editor. On error (`disabled`/`quota-exceeded`/`internal`), show a localized message.
- [ ] **Step 3:** Typecheck + build → exit 0.
- [ ] **Step 4: Commit** `git commit -am "feat(clients): AI generate buttons for training/diet/recipes"`

### Task C6: AI Authoring admin settings panel

**Files:** Create `src/components/admin/settings/AiAuthoringSettings.tsx`; add client wrappers `getAiAuthoringSettingsAdmin`/`updateAiAuthoringSettings` to `src/lib/firebase/functions.ts`; render the panel (superadmin) in `src/app/admin/settings/page.tsx` wrapped in `SuperadminOnly`; add i18n keys for it in all 5 locales.

- [ ] **Step 1:** Mirror `src/components/admin/settings/AiAssistantSettings.tsx` (provider/model selects, temperature, maxOutputTokens, dailyQuota numeric with NaN guards, enable toggle, systemPromptOverride textarea, key-presence row, Save + Test connection). Bind to the authoring callables. Add `admin.settings.authoring.*` i18n keys (5 locales).
- [ ] **Step 2:** Typecheck + build → exit 0.
- [ ] **Step 3: Commit** `git commit -am "feat(admin): AI Authoring settings panel"`

---

## Phase D — Deploy & verify

### Task D1: Deploy
- [ ] **Step 1:** `firebase deploy --only firestore:rules`
- [ ] **Step 2:** `firebase deploy --only functions:generateTrainingProgram,functions:generateDietPlan,functions:generateRecipe,functions:getAiAuthoringSettingsAdmin,functions:updateAiAuthoringSettings` (secrets already exist from the concierge deploy).
- [ ] **Step 3:** As superadmin in `/admin/settings → AI Authoring`: confirm provider `google`/`gemini-2.5-flash`, Test connection (OK), **Enable**, Save.

### Task D2: Verify (emulator + Playwright)
- [ ] **Step 1:** Start emulators + seed + `dev:emulator`. The seed already creates a verified-ish provider context; if needed, extend `scripts/seed-emulator.mjs` to add a `clients` doc linking the test provider to a customer so the roster is non-empty.
- [ ] **Step 2:** With Playwright (per the always-verify rule), log in as a provider/superadmin, open a client, go to the **Training** tab, click **Generate with AI** (or create a manual program), and confirm a structured program renders and persists (screenshot). Verify a non-owner provider cannot access another provider's client (rules).
- [ ] **Step 3:** Commit any fixes: `git commit -am "fix(clients): adjustments from verification" || echo none`

---

## Self-review (author checklist — completed during planning)

- **Spec coverage:** structured Goals/Training/Diet/Recipes (A1–A3, B2–B5) ✓; manual + AI one-shot auto-save (B*, C3) ✓; verified providers + staff (authorizeClient, B6) ✓; staff any client (B6, authorizeClient) ✓; provider-internal (rules A2; no customer UI) ✓; separate `aiAuthoring` config+quota (C1,C2,C4,C6) ✓; `generateObject` (C3) ✓; audit (C3,C4) ✓; i18n 5 locales (B7,C6) ✓; tests (C1,C2,C3,C4) ✓; deploy+verify (D) ✓.
- **Type consistency:** `ClientGoal/TrainingProgram/DietPlan/Recipe` + params defined in A1 and reused by helpers (A3), wrappers (C5), and mirrored by Zod schemas (C2); subcollection names `trainingPrograms|dietPlans|recipes|goals` identical across rules (A2), CRUD (A3), and callables (C3).
- **Flagged for implementer:** confirm `generateObject` `{ object, usage }` shape vs installed `ai@5` (C3); `getClientDetails` admin bypass + provider-layout staff access for `/admin/clients` (B6); recipes have no `status` (C3 note); seed may need a `clients` doc for emulator verification (D2).
- **YAGNI:** dropped `ensureClient` (authoring uses existing clientId); no customer UI; no library/progress tracking.

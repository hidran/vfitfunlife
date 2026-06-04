# VFit Concierge — AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guardrailed, multi-provider AI chat assistant that lets registered customers search providers/classes/venues in natural language and receive bookable result cards, with superadmin-configurable provider/model.

**Architecture:** A streaming Cloud Function (`chatWithAssistant`, `onCall` v2 + `response.sendChunk`) runs an agentic tool-calling loop via the Vercel AI SDK. Read-only Firestore search tools return normalized `ResultCard`s. The active provider/model and runtime limits live in `/systemSettings/aiAssistant` (superadmin-only); API keys are Firebase secrets. The client renders a floating chat with streamed replies and "Book" deep-links into the existing booking flow.

**Tech Stack:** Firebase Functions v2 (Node 24, `europe-west1`), Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`), Zod 4, Firestore, Next.js (App Router, static export) + Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-ai-assistant-concierge-design.md`

---

## Conventions used in this plan

- Server function pattern (existing): `onCall({ region }, async (request) => { ... })`, `region = process.env.FIREBASE_REGION || "europe-west1"`, throw `HttpsError`. See `functions/src/users/roles.ts:81`.
- Superadmin guard (existing): `await requireSuperAdmin(callerId)` from `functions/src/utils/roles.ts:268`.
- Audit (existing): `writeAuditLog({...})` from `functions/src/lib/audit.ts:34`.
- Settings collection (existing rules): `/systemSettings/{id}` is superadmin read/write (`firestore.rules:481`).
- Client callable wrappers live in `src/lib/firebase/functions.ts` (one exported async fn per callable).
- i18n: add keys to all five files in `src/i18n/messages/{it,en,es,fr,de}.ts`; `it` is the `MessageKey` source of truth (`src/i18n/messages/it.ts`). Components use `const { t, locale } = useI18n()`.
- Zustand: `create<T>()((set, get) => ({...}))`, mirror `src/stores/notificationStore.ts`.
- Tests: `cd functions && npm run test` (Vitest) for server; `npm run test` at repo root for client. Pure logic is unit-tested; Firestore-touching code is split so the pure part is testable without the emulator.

> **AI SDK version note:** The `fullStream` part shapes evolved across AI SDK majors. After installing (Task 1), confirm the exact part types by reading `functions/node_modules/ai` types (`streamText`, `TextStreamPart`) and the `@ai-sdk/*` `create*` provider factory signatures. The code below targets AI SDK v5 (`createAnthropic`/`createOpenAI`/`createGoogleGenerativeAI`/`createOpenAICompatible`, `streamText`, `tool({ inputSchema, execute })`, `stepCountIs`). Adjust property names if the installed types differ.

---

## Shared contracts (referenced by multiple tasks)

These types are created in Task 2/Task 5 and imported elsewhere. Listed here so every task uses identical names.

```ts
// functions/src/ai/types.ts  (created in Task 2)
export type AiProviderId = "anthropic" | "openai" | "google" | "openai-compatible";

export interface AiAssistantSettings {
  enabled: boolean;
  provider: AiProviderId;
  model: string;
  availableModels: Record<AiProviderId, string[]>;
  temperature: number;
  maxOutputTokens: number;
  maxContextMessages: number;
  maxInputChars: number;
  dailyMessageQuota: number;
  systemPromptOverride?: string;
  updatedAt?: FirebaseFirestore.Timestamp;
  updatedBy?: string;
}

export interface ResultCard {
  kind: "provider" | "instructor" | "class" | "venue";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  priceLabel?: string;
  distanceKm?: number;
  matchingSlots?: string[];
  bookingHref: string; // e.g. "/book?providerId=abc"
}

// Streaming chunk protocol (function -> client)
export type AiStreamChunk =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; status: "running" | "done" }
  | { type: "cards"; cards: ResultCard[] }
  | { type: "error"; code: string }
  | { type: "done"; chatId: string; messageId: string };
```

---

## Phase 1 — Server foundation (deps, settings, providers)

### Task 1: Add AI SDK dependencies

**Files:**
- Modify: `functions/package.json` (dependencies)

- [ ] **Step 1: Add dependencies**

```bash
cd /Users/hidranarias/projects/vfit/functions
npm install ai@^5 @ai-sdk/anthropic@^2 @ai-sdk/openai@^2 @ai-sdk/google@^2 @ai-sdk/openai-compatible@^1
```

(Use the latest published majors. `zod@^4` is already present.)

- [ ] **Step 2: Verify build still compiles**

Run: `cd /Users/hidranarias/projects/vfit/functions && npm run build`
Expected: PASS (no TS errors).

- [ ] **Step 3: Confirm installed AI SDK API**

Run: `node -e "const ai=require('ai'); console.log(typeof ai.streamText, typeof ai.tool, typeof ai.stepCountIs)"`
Expected: `function function function`. Skim `functions/node_modules/@ai-sdk/google/dist/index.d.ts` for `createGoogleGenerativeAI`.

- [ ] **Step 4: Commit**

```bash
git add functions/package.json functions/package-lock.json
git commit -m "build(functions): add Vercel AI SDK + provider packages"
```

---

### Task 2: AI settings module (types, defaults, getter)

**Files:**
- Create: `functions/src/ai/types.ts` (the Shared contracts above)
- Create: `functions/src/ai/settings.ts`
- Test: `functions/src/ai/settings.test.ts`

- [ ] **Step 1: Create `functions/src/ai/types.ts`**

Paste the entire "Shared contracts" block above into this file (the `AiProviderId`, `AiAssistantSettings`, `ResultCard`, `AiStreamChunk` types).

- [ ] **Step 2: Write the failing test** — `functions/src/ai/settings.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_AI_SETTINGS, mergeAiSettings } from "./settings";

describe("DEFAULT_AI_SETTINGS", () => {
  it("defaults to cheap Gemini Flash and is disabled by default", () => {
    expect(DEFAULT_AI_SETTINGS.provider).toBe("google");
    expect(DEFAULT_AI_SETTINGS.model).toBe("gemini-2.5-flash");
    expect(DEFAULT_AI_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_AI_SETTINGS.dailyMessageQuota).toBeGreaterThan(0);
    expect(DEFAULT_AI_SETTINGS.availableModels.google).toContain("gemini-2.5-flash");
  });
});

describe("mergeAiSettings", () => {
  it("fills missing fields from defaults but keeps stored values", () => {
    const merged = mergeAiSettings({ enabled: true, model: "gpt-4o-mini", provider: "openai" });
    expect(merged.enabled).toBe(true);
    expect(merged.provider).toBe("openai");
    expect(merged.model).toBe("gpt-4o-mini");
    expect(merged.temperature).toBe(DEFAULT_AI_SETTINGS.temperature);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd functions && npm run test -- settings`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `functions/src/ai/settings.ts`**

```ts
import * as admin from "firebase-admin";
import { AiAssistantSettings, AiProviderId } from "./types";

export const AI_SETTINGS_DOC = "systemSettings/aiAssistant";

export const DEFAULT_AI_SETTINGS: AiAssistantSettings = {
  enabled: false,
  provider: "google",
  model: "gemini-2.5-flash",
  availableModels: {
    google: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    openai: ["gpt-4o-mini", "gpt-5-mini", "gpt-4o"],
    anthropic: ["claude-haiku-4-5", "claude-sonnet-4-6"],
    "openai-compatible": [],
  },
  temperature: 0.3,
  maxOutputTokens: 1024,
  maxContextMessages: 12,
  maxInputChars: 2000,
  dailyMessageQuota: 30,
};

/** Merge a partial stored settings doc over the defaults. */
export function mergeAiSettings(stored: Partial<AiAssistantSettings> | undefined): AiAssistantSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    ...(stored ?? {}),
    availableModels: {
      ...DEFAULT_AI_SETTINGS.availableModels,
      ...(stored?.availableModels ?? {}),
    },
  };
}

/** Read settings from Firestore, falling back to defaults. */
export async function getAiSettings(): Promise<AiAssistantSettings> {
  const snap = await admin.firestore().doc(AI_SETTINGS_DOC).get();
  return mergeAiSettings(snap.exists ? (snap.data() as Partial<AiAssistantSettings>) : undefined);
}

export const AI_PROVIDER_IDS: AiProviderId[] = ["anthropic", "openai", "google", "openai-compatible"];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd functions && npm run test -- settings`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/ai/types.ts functions/src/ai/settings.ts functions/src/ai/settings.test.ts
git commit -m "feat(ai): add AI assistant settings types, defaults, and getter"
```

---

### Task 3: Multi-provider registry

**Files:**
- Create: `functions/src/ai/providers.ts`
- Test: `functions/src/ai/providers.test.ts`

The registry resolves an `AiProviderId` + model + secrets into an AI SDK `LanguageModel`, and reports which providers have keys configured. Keys come from `process.env` (Firebase secrets), never Firestore.

- [ ] **Step 1: Write the failing test** — `functions/src/ai/providers.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { keyPresence, getProviderApiKey } from "./providers";

describe("keyPresence", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GENAI_API_KEY;
    delete process.env.OPENAI_COMPAT_API_KEY;
  });

  it("reports false for all providers when no keys set", () => {
    const p = keyPresence();
    expect(p.anthropic).toBe(false);
    expect(p.openai).toBe(false);
    expect(p.google).toBe(false);
    expect(p["openai-compatible"]).toBe(false);
  });

  it("reports true only for providers with a key", () => {
    process.env.GOOGLE_GENAI_API_KEY = "x";
    const p = keyPresence();
    expect(p.google).toBe(true);
    expect(p.openai).toBe(false);
  });
});

describe("getProviderApiKey", () => {
  it("throws a clear error when the active provider has no key", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getProviderApiKey("openai")).toThrow(/OPENAI_API_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npm run test -- providers`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `functions/src/ai/providers.ts`**

```ts
import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { AiProviderId } from "./types";

const KEY_ENV: Record<AiProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENAI_API_KEY",
  "openai-compatible": "OPENAI_COMPAT_API_KEY",
};

/** All secret names this feature reads — declared on the function. */
export const AI_SECRETS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENAI_API_KEY",
  "OPENAI_COMPAT_API_KEY",
  "OPENAI_COMPAT_BASE_URL",
];

/** Which providers currently have an API key configured (presence only). */
export function keyPresence(): Record<AiProviderId, boolean> {
  return {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    google: !!process.env.GOOGLE_GENAI_API_KEY,
    "openai-compatible": !!process.env.OPENAI_COMPAT_API_KEY,
  };
}

export function getProviderApiKey(provider: AiProviderId): string {
  const key = process.env[KEY_ENV[provider]];
  if (!key) {
    throw new Error(`Missing secret ${KEY_ENV[provider]} for provider "${provider}"`);
  }
  return key;
}

/** Build an AI SDK LanguageModel for the given provider + model id. */
export function buildModel(provider: AiProviderId, model: string): LanguageModel {
  const apiKey = getProviderApiKey(provider);
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "openai-compatible": {
      const baseURL = process.env.OPENAI_COMPAT_BASE_URL;
      if (!baseURL) throw new Error("Missing secret OPENAI_COMPAT_BASE_URL");
      return createOpenAICompatible({ name: "openai-compatible", apiKey, baseURL })(model);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npm run test -- providers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/ai/providers.ts functions/src/ai/providers.test.ts
git commit -m "feat(ai): add multi-provider model registry with key presence"
```

---

## Phase 2 — Search tools (pure logic + Firestore fetch)

Each tool is split into a **pure** part (filter/rank/map — unit tested) and a thin Firestore fetch. This keeps logic testable without the emulator and DRY.

### Task 4: Availability/time matching + provider mapping (pure)

**Files:**
- Create: `functions/src/ai/search/match.ts`
- Test: `functions/src/ai/search/match.test.ts`

- [ ] **Step 1: Write the failing test** — `functions/src/ai/search/match.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { hhmmToMinutes, slotCovers, matchesAvailability, formatSlotLabel } from "./match";

describe("hhmmToMinutes", () => {
  it("parses HH:MM to minutes", () => {
    expect(hhmmToMinutes("15:00")).toBe(900);
    expect(hhmmToMinutes("09:30")).toBe(570);
  });
});

describe("slotCovers", () => {
  it("true when slot fully covers requested window", () => {
    expect(slotCovers({ startTime: "14:00", endTime: "18:00" }, "15:00", "17:00")).toBe(true);
  });
  it("false when slot does not cover the window", () => {
    expect(slotCovers({ startTime: "16:00", endTime: "18:00" }, "15:00", "17:00")).toBe(false);
  });
});

describe("matchesAvailability", () => {
  const schedule = [
    { dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true },
    { dayOfWeek: 2, startTime: "09:00", endTime: "12:00", isAvailable: true },
  ];
  it("matches Monday 15:00-17:00", () => {
    expect(matchesAvailability(schedule, 1, "15:00", "17:00")).toBe(true);
  });
  it("rejects when day has no covering slot", () => {
    expect(matchesAvailability(schedule, 2, "15:00", "17:00")).toBe(false);
  });
  it("matches on day-only when no time window given", () => {
    expect(matchesAvailability(schedule, 1)).toBe(true);
  });
  it("ignores unavailable slots", () => {
    expect(matchesAvailability([{ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: false }], 1, "15:00", "16:00")).toBe(false);
  });
});

describe("formatSlotLabel", () => {
  it("formats a readable slot", () => {
    expect(formatSlotLabel(1, "15:00", "17:00")).toBe("Mon 15:00–17:00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npm run test -- match`
Expected: FAIL.

- [ ] **Step 3: Implement `functions/src/ai/search/match.ts`**

```ts
export interface AvailabilitySlot {
  dayOfWeek: number; // 0=Sun..6=Sat
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  isAvailable?: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function slotCovers(slot: { startTime: string; endTime: string }, start: string, end: string): boolean {
  return hhmmToMinutes(slot.startTime) <= hhmmToMinutes(start) &&
         hhmmToMinutes(slot.endTime) >= hhmmToMinutes(end);
}

export function matchesAvailability(
  schedule: AvailabilitySlot[] | undefined,
  dayOfWeek: number,
  startTime?: string,
  endTime?: string,
): boolean {
  if (!schedule || schedule.length === 0) return false;
  const daySlots = schedule.filter((s) => s.dayOfWeek === dayOfWeek && s.isAvailable !== false);
  if (daySlots.length === 0) return false;
  if (!startTime || !endTime) return true;
  return daySlots.some((s) => slotCovers(s, startTime, endTime));
}

export function formatSlotLabel(dayOfWeek: number, startTime: string, endTime: string): string {
  return `${DAY_LABELS[dayOfWeek]} ${startTime}–${endTime}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npm run test -- match`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/ai/search/match.ts functions/src/ai/search/match.test.ts
git commit -m "feat(ai): add availability/time-window matching helpers"
```

---

### Task 5: Provider → ResultCard mapping (pure)

**Files:**
- Create: `functions/src/ai/search/mapCards.ts`
- Test: `functions/src/ai/search/mapCards.test.ts`

- [ ] **Step 1: Write the failing test** — `functions/src/ai/search/mapCards.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { providerDocToCard } from "./mapCards";

describe("providerDocToCard", () => {
  it("maps a provider user doc to a public-safe ResultCard", () => {
    const card = providerDocToCard("u1", {
      fullName: "Mario Rossi",
      avatarUrl: "https://x/a.jpg",
      phone: "+39123",          // must NOT leak
      email: "m@x.it",          // must NOT leak
      providerProfile: {
        specialties: ["Personal Training"],
        rating: 4.8,
        reviewCount: 22,
        hourlyRate: 40,
      },
    }, ["Mon 15:00–17:00"]);

    expect(card).toEqual({
      kind: "provider",
      id: "u1",
      title: "Mario Rossi",
      subtitle: "Personal Training",
      imageUrl: "https://x/a.jpg",
      rating: 4.8,
      reviewCount: 22,
      priceLabel: "€40/h",
      matchingSlots: ["Mon 15:00–17:00"],
      bookingHref: "/book?providerId=u1",
    });
    expect(JSON.stringify(card)).not.toContain("+39123");
    expect(JSON.stringify(card)).not.toContain("m@x.it");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npm run test -- mapCards`
Expected: FAIL.

- [ ] **Step 3: Implement `functions/src/ai/search/mapCards.ts`**

```ts
import { ResultCard } from "../types";

/** Map a /users provider doc to a public-safe ResultCard. Never include PII (phone/email). */
export function providerDocToCard(id: string, data: Record<string, any>, matchingSlots?: string[]): ResultCard {
  const pp = data.providerProfile ?? {};
  const card: ResultCard = {
    kind: "provider",
    id,
    title: data.fullName ?? "Provider",
    bookingHref: `/book?providerId=${id}`,
  };
  if (Array.isArray(pp.specialties) && pp.specialties.length) card.subtitle = pp.specialties.join(", ");
  if (data.avatarUrl) card.imageUrl = data.avatarUrl;
  if (typeof pp.rating === "number") card.rating = pp.rating;
  if (typeof pp.reviewCount === "number") card.reviewCount = pp.reviewCount;
  if (typeof pp.hourlyRate === "number") card.priceLabel = `€${pp.hourlyRate}/h`;
  if (matchingSlots && matchingSlots.length) card.matchingSlots = matchingSlots;
  return card;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npm run test -- mapCards`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/ai/search/mapCards.ts functions/src/ai/search/mapCards.test.ts
git commit -m "feat(ai): add provider-to-ResultCard mapper (PII-safe)"
```

---

### Task 6: AI SDK tools (Firestore-backed, read-only)

**Files:**
- Create: `functions/src/ai/tools/index.ts`
- Test: `functions/src/ai/tools/searchProviders.test.ts`

Tools use the AI SDK `tool()` helper with Zod input schemas. `execute` queries Firestore (admin SDK), then uses the pure helpers from Tasks 4–5. Each tool returns `ResultCard[]`. For `searchProviders` the test mocks `admin.firestore()` so the query + filtering is exercised without the emulator.

- [ ] **Step 1: Write the failing test** — `functions/src/ai/tools/searchProviders.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase-admin firestore with an in-memory provider set.
const PROVIDERS = [
  {
    id: "p1",
    fullName: "Mario Rossi",
    role: "provider",
    isVerified: true,
    providerProfile: {
      isVerified: true,
      specialties: ["Personal Training"],
      hourlyRate: 40,
      serviceArea: { city: "Torino" },
      availabilitySchedule: [{ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true }],
    },
  },
  {
    id: "p2",
    fullName: "Lucia Bianchi",
    role: "provider",
    isVerified: true,
    providerProfile: {
      isVerified: true,
      specialties: ["Yoga"],
      hourlyRate: 30,
      serviceArea: { city: "Milano" },
      availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00", isAvailable: true }],
    },
  },
];

vi.mock("firebase-admin", () => {
  const docs = PROVIDERS.map((p) => ({ id: p.id, data: () => p }));
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({ docs }),
  };
  return {
    firestore: () => ({ collection: () => query }),
  };
});

import { createAiTools } from "./index";

describe("searchProviders tool", () => {
  let tools: ReturnType<typeof createAiTools>;
  beforeEach(() => { tools = createAiTools(); });

  it("returns Torino personal trainers available Monday 15:00-17:00 as cards", async () => {
    const cards = await tools.searchProviders.execute(
      { city: "Torino", specialty: "Personal Training", dayOfWeek: 1, startTime: "15:00", endTime: "17:00" },
      { toolCallId: "t", messages: [] } as any,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("p1");
    expect(cards[0].matchingSlots).toEqual(["Mon 14:00–18:00"]);
    expect(cards[0].bookingHref).toBe("/book?providerId=p1");
  });

  it("excludes providers in other cities", async () => {
    const cards = await tools.searchProviders.execute(
      { city: "Torino", dayOfWeek: 1 },
      { toolCallId: "t", messages: [] } as any,
    );
    expect(cards.map((c) => c.id)).not.toContain("p2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npm run test -- searchProviders`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `functions/src/ai/tools/index.ts`**

```ts
import { tool } from "ai";
import { z } from "zod";
import * as admin from "firebase-admin";
import { ResultCard } from "../types";
import { matchesAvailability, formatSlotLabel, AvailabilitySlot } from "../search/match";
import { providerDocToCard } from "../search/mapCards";

const DEFAULT_LIMIT = 8;

function cityEq(a: unknown, b: string): boolean {
  return typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Build the read-only tool set. Pass nothing in prod; tests mock firebase-admin. */
export function createAiTools() {
  const db = () => admin.firestore();

  const searchProviders = tool({
    description:
      "Search verified personal trainers / providers by specialty, city, day and time window. " +
      "Use when the user wants a person (e.g. a personal trainer) at a place and time.",
    inputSchema: z.object({
      city: z.string().optional().describe("City name, e.g. 'Torino'"),
      specialty: z.string().optional().describe("Specialty / userType, e.g. 'Personal Training'"),
      language: z.string().optional(),
      dayOfWeek: z.number().int().min(0).max(6).optional().describe("0=Sunday .. 6=Saturday"),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("HH:MM 24h"),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("HH:MM 24h"),
      priceMax: z.number().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (args): Promise<ResultCard[]> => {
      const snap = await db()
        .collection("users")
        .where("role", "==", "provider")
        .where("isVerified", "==", true)
        .limit(50)
        .get();

      const cards: ResultCard[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, any>;
        const pp = data.providerProfile ?? {};
        if (args.city && !cityEq(pp.serviceArea?.city, args.city)) continue;
        if (args.specialty) {
          const specs: string[] = Array.isArray(pp.specialties) ? pp.specialties : [];
          const hit = specs.some((s) => s.toLowerCase().includes(args.specialty!.toLowerCase())) ||
            (typeof data.userType === "string" && data.userType.toLowerCase().includes(args.specialty!.toLowerCase()));
          if (!hit) continue;
        }
        if (args.language) {
          const langs: string[] = Array.isArray(pp.languages) ? pp.languages : [];
          if (!langs.map((l) => l.toLowerCase()).includes(args.language.toLowerCase())) continue;
        }
        if (typeof args.priceMax === "number" && typeof pp.hourlyRate === "number" && pp.hourlyRate > args.priceMax) continue;

        const schedule: AvailabilitySlot[] = Array.isArray(pp.availabilitySchedule) ? pp.availabilitySchedule : [];
        let matchingSlots: string[] | undefined;
        if (typeof args.dayOfWeek === "number") {
          if (!matchesAvailability(schedule, args.dayOfWeek, args.startTime, args.endTime)) continue;
          matchingSlots = schedule
            .filter((s) => s.dayOfWeek === args.dayOfWeek && s.isAvailable !== false)
            .map((s) => formatSlotLabel(s.dayOfWeek, s.startTime, s.endTime));
        }
        cards.push(providerDocToCard(doc.id, data, matchingSlots));
        if (cards.length >= (args.limit ?? DEFAULT_LIMIT)) break;
      }
      return cards;
    },
  });

  const searchClasses = tool({
    description: "Search fitness classes by city, day and time window.",
    inputSchema: z.object({
      city: z.string().optional(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (args): Promise<ResultCard[]> => {
      const snap = await db().collection("fitnessClasses").limit(50).get();
      const cards: ResultCard[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, any>;
        if (args.city && !cityEq(data.city, args.city)) continue;
        cards.push({
          kind: "class",
          id: doc.id,
          title: data.name ?? data.title ?? "Class",
          subtitle: data.venueName ?? undefined,
          imageUrl: data.imageUrl ?? undefined,
          bookingHref: `/book?classId=${doc.id}`,
        });
        if (cards.length >= (args.limit ?? DEFAULT_LIMIT)) break;
      }
      return cards;
    },
  });

  const searchVenues = tool({
    description: "Search gyms / wellness centers / venues by city and type.",
    inputSchema: z.object({
      city: z.string().optional(),
      type: z.enum(["gym", "wellness_center", "beauty_salon", "outdoor_space"]).optional(),
      section: z.enum(["fit", "fun", "life"]).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (args): Promise<ResultCard[]> => {
      let q: FirebaseFirestore.Query = db().collection("venues");
      if (args.type) q = q.where("type", "==", args.type);
      if (args.section) q = q.where("section", "==", args.section);
      const snap = await q.limit(50).get();
      const cards: ResultCard[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, any>;
        if (args.city && !cityEq(data.city, args.city)) continue;
        cards.push({
          kind: "venue",
          id: doc.id,
          title: data.name ?? "Venue",
          subtitle: data.address ?? undefined,
          imageUrl: data.imageUrl ?? data.coverImageUrl ?? undefined,
          bookingHref: `/book?venueId=${doc.id}`,
        });
        if (cards.length >= (args.limit ?? DEFAULT_LIMIT)) break;
      }
      return cards;
    },
  });

  const getProviderAvailability = tool({
    description: "Get the weekly availability slots for one provider, to confirm a specific time.",
    inputSchema: z.object({ providerId: z.string() }),
    execute: async ({ providerId }): Promise<{ slots: string[] }> => {
      const doc = await db().collection("users").doc(providerId).get();
      const pp = (doc.data()?.providerProfile ?? {}) as Record<string, any>;
      const schedule: AvailabilitySlot[] = Array.isArray(pp.availabilitySchedule) ? pp.availabilitySchedule : [];
      return { slots: schedule.filter((s) => s.isAvailable !== false).map((s) => formatSlotLabel(s.dayOfWeek, s.startTime, s.endTime)) };
    },
  });

  return { searchProviders, searchClasses, searchVenues, getProviderAvailability };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npm run test -- searchProviders`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/ai/tools/
git commit -m "feat(ai): add read-only Firestore search tools (providers/classes/venues/availability)"
```

> **Note on indexes:** `searchProviders` filters `role == provider` AND `isVerified == true`. Add the composite index in Task 11 if Firestore requires it at runtime.

---

## Phase 3 — Guardrails (system prompt + quota)

### Task 7: System prompt builder (pure)

**Files:**
- Create: `functions/src/ai/prompt.ts`
- Test: `functions/src/ai/prompt.test.ts`

- [ ] **Step 1: Write the failing test** — `functions/src/ai/prompt.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt";

describe("buildSystemPrompt", () => {
  it("includes scope, locale, date, and refusal instruction", () => {
    const p = buildSystemPrompt({ locale: "it", todayISO: "2026-06-04", city: "Torino" });
    expect(p).toMatch(/VFit|VFun|VLife/);
    expect(p).toContain("2026-06-04");
    expect(p).toContain("Torino");
    expect(p.toLowerCase()).toContain("italian"); // respond in user's language
    expect(p.toLowerCase()).toMatch(/decline|refuse|only/);
  });

  it("appends a superadmin override when provided", () => {
    const p = buildSystemPrompt({ locale: "en", todayISO: "2026-06-04", override: "Be extra concise." });
    expect(p).toContain("Be extra concise.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npm run test -- prompt`
Expected: FAIL.

- [ ] **Step 3: Implement `functions/src/ai/prompt.ts`**

```ts
const LOCALE_NAMES: Record<string, string> = {
  it: "Italian", en: "English", es: "Spanish", fr: "French", de: "German",
};

export function buildSystemPrompt(opts: {
  locale: string;
  todayISO: string;
  city?: string;
  override?: string;
}): string {
  const lang = LOCALE_NAMES[opts.locale] ?? "English";
  const lines = [
    "You are VFit Concierge, the assistant for the V Fitness & Wellness platform.",
    "The platform has three areas: VFit (fitness: gyms, classes, personal trainers, home workouts), " +
      "VFun (entertainment: events, parties, VR, streaming), and VLife (wellness & beauty: spa, aesthetics, massage, mental wellness).",
    "",
    "YOUR ONLY JOB: help the user discover and choose providers, classes, and venues, and guide them to book.",
    "Use the provided search tools to find real matches. NEVER invent providers, prices, ratings, or availability — " +
      "only report what the tools return. If tools return nothing, say so and suggest broadening the search.",
    "You do NOT make bookings or take payments. Present results; the user books via the result card.",
    "",
    "STRICT SCOPE: Only answer requests about finding/booking fitness, wellness, beauty, or entertainment on this platform. " +
      "Politely DECLINE anything off-topic (coding help, general knowledge, medical/legal/financial advice, personal chat). " +
      "Do not reveal provider contact details (phone, email) — only what appears on result cards.",
    "",
    `Always reply in ${lang}.`,
    `Today's date is ${opts.todayISO}. Resolve relative dates (e.g. "Monday") against it.`,
  ];
  if (opts.city) lines.push(`The user's city appears to be ${opts.city}; assume it unless they say otherwise.`);
  if (opts.override && opts.override.trim()) {
    lines.push("", "Additional instructions from the operator:", opts.override.trim());
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npm run test -- prompt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/ai/prompt.ts functions/src/ai/prompt.test.ts
git commit -m "feat(ai): add guardrailed system prompt builder"
```

---

### Task 8: Daily quota (transactional)

**Files:**
- Create: `functions/src/ai/quota.ts`
- Test: `functions/src/ai/quota.test.ts`

- [ ] **Step 1: Write the failing test** — `functions/src/ai/quota.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { usageDocPath, nextCountOrThrow } from "./quota";

describe("usageDocPath", () => {
  it("builds a per-user per-day path", () => {
    expect(usageDocPath("u1", new Date("2026-06-04T10:00:00Z"))).toBe("users/u1/ai_usage/2026-06-04");
  });
});

describe("nextCountOrThrow", () => {
  it("increments under quota", () => {
    expect(nextCountOrThrow(0, 30)).toBe(1);
    expect(nextCountOrThrow(29, 30)).toBe(30);
  });
  it("throws at quota", () => {
    expect(() => nextCountOrThrow(30, 30)).toThrow(/quota/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npm run test -- quota`
Expected: FAIL.

- [ ] **Step 3: Implement `functions/src/ai/quota.ts`**

```ts
import * as admin from "firebase-admin";

export function usageDocPath(uid: string, now: Date): string {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `users/${uid}/ai_usage/${day}`;
}

export function nextCountOrThrow(current: number, quota: number): number {
  if (current >= quota) {
    const err = new Error("Daily message quota exceeded");
    (err as any).code = "quota-exceeded";
    throw err;
  }
  return current + 1;
}

/** Atomically reserve one message against the daily quota. Throws {code:'quota-exceeded'}. */
export async function reserveQuota(uid: string, quota: number, now: Date): Promise<void> {
  const ref = admin.firestore().doc(usageDocPath(uid, now));
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.exists ? (snap.data()?.count as number) : 0) ?? 0;
    const next = nextCountOrThrow(current, quota);
    tx.set(ref, { count: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** Record token usage after a completed request (best-effort). */
export async function recordTokens(uid: string, now: Date, inTok: number, outTok: number): Promise<void> {
  const ref = admin.firestore().doc(usageDocPath(uid, now));
  await ref.set(
    {
      tokensIn: admin.firestore.FieldValue.increment(inTok || 0),
      tokensOut: admin.firestore.FieldValue.increment(outTok || 0),
    },
    { merge: true },
  ).catch((e) => console.error("[ai] recordTokens failed", e));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npm run test -- quota`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/ai/quota.ts functions/src/ai/quota.test.ts
git commit -m "feat(ai): add transactional per-user daily quota"
```

---

## Phase 4 — Cloud Functions (chat + admin settings)

### Task 9: `chatWithAssistant` streaming callable

**Files:**
- Create: `functions/src/ai/chat.ts`
- Modify: `functions/src/index.ts` (add `export * from "./ai/chat";` and `export * from "./ai/admin";`)

This wires everything: auth → settings/kill-switch → quota → history → prompt → `streamText` agentic loop → stream chunks → persist → record tokens. It is integration-level; verified manually against the emulator in Task 13 (no unit test step here beyond `tsc`).

- [ ] **Step 1: Implement `functions/src/ai/chat.ts`**

```ts
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { getAiSettings } from "./settings";
import { buildModel, AI_SECRETS } from "./providers";
import { createAiTools } from "./tools";
import { buildSystemPrompt } from "./prompt";
import { reserveQuota, recordTokens } from "./quota";
import { ResultCard, AiStreamChunk } from "./types";

const region = process.env.FIREBASE_REGION || "europe-west1";

interface ChatRequest {
  chatId?: string;
  message: string;
  locale?: string;
}

export const chatWithAssistant = onCall<ChatRequest>(
  { region, secrets: AI_SECRETS },
  async (request: CallableRequest<ChatRequest>, response) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const uid = request.auth.uid;
    const db = admin.firestore();
    const now = new Date();

    const send = (chunk: AiStreamChunk) => {
      if (request.acceptsStreaming) response.sendChunk(chunk);
    };

    // Settings + kill-switch
    const settings = await getAiSettings();
    if (!settings.enabled) {
      send({ type: "error", code: "disabled" });
      throw new HttpsError("failed-precondition", "disabled");
    }

    // Input validation
    const message = (request.data.message ?? "").trim();
    if (!message) throw new HttpsError("invalid-argument", "Empty message");
    if (message.length > settings.maxInputChars) {
      send({ type: "error", code: "input-too-long" });
      throw new HttpsError("invalid-argument", "input-too-long");
    }
    const locale = request.data.locale ?? "en";

    // Quota
    try {
      await reserveQuota(uid, settings.dailyMessageQuota, now);
    } catch (e: any) {
      if (e?.code === "quota-exceeded") {
        send({ type: "error", code: "quota-exceeded" });
        throw new HttpsError("resource-exhausted", "quota-exceeded");
      }
      throw e;
    }

    // Resolve / create chat
    const userRef = db.collection("users").doc(uid);
    const chatRef = request.data.chatId
      ? userRef.collection("chats").doc(request.data.chatId)
      : userRef.collection("chats").doc();
    const chatId = chatRef.id;

    // Load capped history
    const histSnap = await chatRef
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limitToLast(settings.maxContextMessages)
      .get()
      .catch(() => null);
    const history: ModelMessage[] = (histSnap?.docs ?? []).map((d) => {
      const m = d.data() as any;
      return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "") };
    });

    // City hint from user profile
    const userData = (await userRef.get()).data() as any;
    const city: string | undefined = userData?.providerProfile?.serviceArea?.city ?? userData?.city ?? undefined;

    const system = buildSystemPrompt({
      locale,
      todayISO: now.toISOString().slice(0, 10),
      city,
      override: settings.systemPromptOverride,
    });

    // Persist user message immediately
    await chatRef.collection("messages").add({
      role: "user", content: message, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const tools = createAiTools();
    const collectedCards: ResultCard[] = [];

    const result = streamText({
      model: buildModel(settings.provider, settings.model),
      system,
      messages: [...history, { role: "user", content: message }],
      tools,
      stopWhen: stepCountIs(5),
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
    });

    let finalText = "";
    try {
      for await (const part of result.fullStream) {
        // NOTE: confirm part.type names against installed @ai-sdk/ai types.
        if (part.type === "text-delta") {
          const text = (part as any).text ?? (part as any).textDelta ?? "";
          finalText += text;
          send({ type: "delta", text });
        } else if (part.type === "tool-call") {
          send({ type: "tool", name: (part as any).toolName, status: "running" });
        } else if (part.type === "tool-result") {
          const out = (part as any).output ?? (part as any).result;
          send({ type: "tool", name: (part as any).toolName, status: "done" });
          if (Array.isArray(out)) {
            collectedCards.push(...(out as ResultCard[]));
            send({ type: "cards", cards: out as ResultCard[] });
          }
        }
      }
    } catch (err) {
      console.error("[ai] stream error", err);
      send({ type: "error", code: "internal" });
      throw new HttpsError("internal", "AI request failed");
    }

    const usage = await result.usage.catch(() => undefined as any);
    const inTok = usage?.inputTokens ?? usage?.promptTokens ?? 0;
    const outTok = usage?.outputTokens ?? usage?.completionTokens ?? 0;

    // Persist assistant message + dedupe cards by id
    const dedupedCards = Array.from(new Map(collectedCards.map((c) => [`${c.kind}:${c.id}`, c])).values());
    const msgRef = await chatRef.collection("messages").add({
      role: "assistant",
      content: finalText,
      resultCards: dedupedCards,
      provider: settings.provider,
      model: settings.model,
      tokensIn: inTok,
      tokensOut: outTok,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await chatRef.set({
      title: request.data.chatId ? admin.firestore.FieldValue.delete() : message.slice(0, 60),
      lastMessagePreview: finalText.slice(0, 120),
      locale,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: request.data.chatId ? admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp(),
      messageCount: admin.firestore.FieldValue.increment(2),
    }, { merge: true });

    await recordTokens(uid, now, inTok, outTok);

    send({ type: "done", chatId, messageId: msgRef.id });
    return { chatId, messageId: msgRef.id, text: finalText, cards: dedupedCards };
  },
);
```

> **`title` set quirk:** for a new chat set the title; for an existing chat don't overwrite it. Simplify: only set `title` when `!request.data.chatId`. The implementer should adjust the `chatRef.set` so `title` is included only on creation (remove the `FieldValue.delete()` branch and conditionally build the object). Keep behavior: new chats get a title from the first message.

- [ ] **Step 2: Wire exports** — edit `functions/src/index.ts`

Add after line 12 (`export * from "./scheduled";`):

```ts
export * from "./ai/chat";
export * from "./ai/admin";
```

- [ ] **Step 3: Build**

Run: `cd functions && npm run build`
Expected: PASS (after Task 10 creates `./ai/admin`; if building before Task 10, temporarily omit the admin export line). 

- [ ] **Step 4: Commit**

```bash
git add functions/src/ai/chat.ts functions/src/index.ts
git commit -m "feat(ai): add streaming chatWithAssistant callable with agentic tool loop"
```

---

### Task 10: `updateAiSettings` + `getAiSettingsAdmin` + `testAiConnection` callables

**Files:**
- Create: `functions/src/ai/admin.ts`
- Test: `functions/src/ai/admin.test.ts` (validation helper only)

- [ ] **Step 1: Write the failing test** — `functions/src/ai/admin.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { validateSettingsPatch } from "./admin";

describe("validateSettingsPatch", () => {
  it("accepts a valid patch", () => {
    const v = validateSettingsPatch({ enabled: true, provider: "google", model: "gemini-2.5-flash", temperature: 0.5, dailyMessageQuota: 50 });
    expect(v.provider).toBe("google");
    expect(v.temperature).toBe(0.5);
  });
  it("rejects unknown provider", () => {
    expect(() => validateSettingsPatch({ provider: "bogus" })).toThrow();
  });
  it("clamps/rejects out-of-range numbers", () => {
    expect(() => validateSettingsPatch({ temperature: 5 })).toThrow();
    expect(() => validateSettingsPatch({ dailyMessageQuota: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npm run test -- ai/admin`
Expected: FAIL.

- [ ] **Step 3: Implement `functions/src/ai/admin.ts`**

```ts
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { generateText } from "ai";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { getAiSettings, AI_SETTINGS_DOC } from "./settings";
import { buildModel, keyPresence, AI_SECRETS } from "./providers";
import { AiProviderId } from "./types";

const region = process.env.FIREBASE_REGION || "europe-west1";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(["anthropic", "openai", "google", "openai-compatible"]).optional(),
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(64).max(8192).optional(),
  maxContextMessages: z.number().int().min(2).max(50).optional(),
  maxInputChars: z.number().int().min(100).max(8000).optional(),
  dailyMessageQuota: z.number().int().min(0).max(1000).optional(),
  systemPromptOverride: z.string().max(4000).optional(),
});

export function validateSettingsPatch(patch: unknown) {
  return patchSchema.parse(patch);
}

/** Superadmin: read settings + which providers have keys. */
export const getAiSettingsAdmin = onCall(
  { region, secrets: AI_SECRETS },
  async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    try { await requireSuperAdmin(request.auth.uid); }
    catch { throw new HttpsError("permission-denied", "Superadmin only"); }
    const settings = await getAiSettings();
    return { settings, keyPresence: keyPresence() };
  },
);

/** Superadmin: update settings + audit. */
export const updateAiSettings = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const callerId = request.auth.uid;
    try { await requireSuperAdmin(callerId); }
    catch { throw new HttpsError("permission-denied", "Superadmin only"); }

    let patch;
    try { patch = validateSettingsPatch(request.data); }
    catch (e: any) { throw new HttpsError("invalid-argument", e.message ?? "Invalid settings"); }

    const before = await getAiSettings();
    const callerEmail = (await admin.firestore().collection("users").doc(callerId).get()).data()?.email ?? "";

    await admin.firestore().doc(AI_SETTINGS_DOC).set(
      { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: callerId },
      { merge: true },
    );

    await writeAuditLog({
      actorUid: callerId, actorEmail: callerEmail, actorRole: "superadmin",
      action: "update", entityType: "user_type", entityId: "aiAssistant",
      before: before as any, after: patch as any,
    });

    return { success: true };
  },
);

/** Superadmin: 1-token round-trip to verify provider+model+key work. */
export const testAiConnection = onCall(
  { region, secrets: AI_SECRETS },
  async (request: CallableRequest<{ provider?: AiProviderId; model?: string }>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    try { await requireSuperAdmin(request.auth.uid); }
    catch { throw new HttpsError("permission-denied", "Superadmin only"); }
    const settings = await getAiSettings();
    const provider = request.data.provider ?? settings.provider;
    const model = request.data.model ?? settings.model;
    try {
      const { text } = await generateText({
        model: buildModel(provider, model),
        prompt: "Reply with the single word: OK",
        maxOutputTokens: 5,
      });
      return { ok: true, sample: text.slice(0, 20) };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
    }
  },
);
```

> **Audit entityType note:** `writeAuditLog`'s `entityType` union (`functions/src/lib/audit.ts:16`) does not include an AI option. Add `"ai_settings"` to the `entityType` union in `audit.ts` and use it here instead of `"user_type"`.

- [ ] **Step 4: Update audit entityType** — edit `functions/src/lib/audit.ts:16-22`

Add `| "ai_settings"` to the `entityType` union. Then change `entityType: "user_type"` → `entityType: "ai_settings"` in `admin.ts`.

- [ ] **Step 5: Run test + build**

Run: `cd functions && npm run test -- ai/admin && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/ai/admin.ts functions/src/ai/admin.test.ts functions/src/lib/audit.ts
git commit -m "feat(ai): add superadmin settings + test-connection callables with audit"
```

---

## Phase 5 — Firestore rules & indexes

### Task 11: Rules for chats/ai_usage + provider search index

**Files:**
- Modify: `firestore.rules` (inside `match /users/{userId} { ... }`)
- Modify: `firestore.indexes.json` (create if absent)

- [ ] **Step 1: Add subcollection rules** — inside `match /users/{userId}` (after the `availability` block, before the closing brace at `firestore.rules:195`):

```
      // AI assistant chats — owner reads; superadmin reads for support.
      // Writes happen only via Cloud Functions (admin SDK bypasses rules).
      match /chats/{chatId} {
        allow read: if isOwner(userId) || isSuperAdmin();
        allow write: if false;

        match /messages/{messageId} {
          allow read: if isOwner(userId) || isSuperAdmin();
          allow write: if false;
        }
      }

      // AI usage counters — function-managed; superadmin may read.
      match /ai_usage/{dayId} {
        allow read: if isSuperAdmin();
        allow write: if false;
      }
```

- [ ] **Step 2: Add composite index** — `firestore.indexes.json`

If the file doesn't exist, create it; otherwise add to the `indexes` array:

```json
{
  "indexes": [
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "role", "order": "ASCENDING" },
        { "fieldPath": "isVerified", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Ensure `firebase.json` references it (`"firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" }`). Add the `indexes` key if missing.

- [ ] **Step 3: Validate rules compile**

Run: `cd /Users/hidranarias/projects/vfit && npx firebase deploy --only firestore:rules --dry-run` (or `firebase emulators:exec --only firestore "true"`).
Expected: rules compile without error.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules firestore.indexes.json firebase.json
git commit -m "feat(ai): firestore rules for chats/ai_usage + provider search index"
```

---

## Phase 6 — Client

### Task 12: Client callable wrappers + types

**Files:**
- Create: `src/types/assistant.ts` (mirror server `ResultCard`, `AiStreamChunk`, settings)
- Modify: `src/lib/firebase/functions.ts` (add `streamAssistant`, `getAiSettingsAdmin`, `updateAiSettings`, `testAiConnection`)

- [ ] **Step 1: Create `src/types/assistant.ts`**

```ts
export type AiProviderId = "anthropic" | "openai" | "google" | "openai-compatible";

export interface ResultCard {
  kind: "provider" | "instructor" | "class" | "venue";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  priceLabel?: string;
  distanceKm?: number;
  matchingSlots?: string[];
  bookingHref: string;
}

export type AiStreamChunk =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; status: "running" | "done" }
  | { type: "cards"; cards: ResultCard[] }
  | { type: "error"; code: string }
  | { type: "done"; chatId: string; messageId: string };

export interface AiAssistantSettings {
  enabled: boolean;
  provider: AiProviderId;
  model: string;
  availableModels: Record<AiProviderId, string[]>;
  temperature: number;
  maxOutputTokens: number;
  maxContextMessages: number;
  maxInputChars: number;
  dailyMessageQuota: number;
  systemPromptOverride?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  resultCards?: ResultCard[];
  pending?: boolean;
}
```

- [ ] **Step 2: Add wrappers** — append to `src/lib/firebase/functions.ts`

```ts
import { httpsCallable } from "firebase/functions";
import { functions } from "./config";
import type { AiStreamChunk, AiAssistantSettings, AiProviderId, ResultCard } from "@/types/assistant";

/** Stream a chat turn. Yields chunks; resolves final on the returned promise. */
export function streamAssistant(input: { chatId?: string; message: string; locale: string }) {
  const fn = httpsCallable<typeof input, { chatId: string; messageId: string; text: string; cards: ResultCard[] }>(
    functions, "chatWithAssistant",
  );
  return fn.stream(input) as Promise<{
    stream: AsyncIterable<AiStreamChunk>;
    data: Promise<{ chatId: string; messageId: string; text: string; cards: ResultCard[] }>;
  }>;
}

export async function getAiSettingsAdmin(): Promise<{ settings: AiAssistantSettings; keyPresence: Record<AiProviderId, boolean> }> {
  const fn = httpsCallable<void, { settings: AiAssistantSettings; keyPresence: Record<AiProviderId, boolean> }>(functions, "getAiSettingsAdmin");
  return (await fn()).data;
}

export async function updateAiSettings(patch: Partial<AiAssistantSettings>): Promise<void> {
  const fn = httpsCallable<Partial<AiAssistantSettings>, { success: boolean }>(functions, "updateAiSettings");
  await fn(patch);
}

export async function testAiConnection(input: { provider?: AiProviderId; model?: string }): Promise<{ ok: boolean; sample?: string; error?: string }> {
  const fn = httpsCallable<typeof input, { ok: boolean; sample?: string; error?: string }>(functions, "testAiConnection");
  return (await fn(input)).data;
}
```

> If `src/lib/firebase/functions.ts` already imports `httpsCallable`/`functions`, don't duplicate the imports — add only the new functions.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/hidranarias/projects/vfit && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/types/assistant.ts src/lib/firebase/functions.ts
git commit -m "feat(ai): client types + callable wrappers for assistant + admin settings"
```

---

### Task 13: `assistantStore` (Zustand) with streaming consumption

**Files:**
- Create: `src/stores/assistantStore.ts`
- Test: `src/stores/assistantStore.test.ts`

- [ ] **Step 1: Write the failing test** — `src/stores/assistantStore.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const chunks = [
  { type: "delta", text: "Hello " },
  { type: "delta", text: "there" },
  { type: "cards", cards: [{ kind: "provider", id: "p1", title: "Mario", bookingHref: "/book?providerId=p1" }] },
  { type: "done", chatId: "c1", messageId: "m1" },
];

vi.mock("@/lib/firebase/functions", () => ({
  streamAssistant: vi.fn(async () => ({
    async *[Symbol.asyncIterator]() {}, // placeholder, replaced below
    stream: (async function* () { for (const c of chunks) yield c; })(),
    data: Promise.resolve({ chatId: "c1", messageId: "m1", text: "Hello there", cards: chunks[2].cards }),
  })),
}));

import { useAssistantStore } from "./assistantStore";

describe("assistantStore.send", () => {
  beforeEach(() => useAssistantStore.setState({ messages: [], currentChatId: undefined, isStreaming: false, error: undefined }));

  it("appends user msg, streams assistant deltas, applies cards, sets chatId", async () => {
    await useAssistantStore.getState().send("hi", "en");
    const s = useAssistantStore.getState();
    expect(s.messages[0]).toMatchObject({ role: "user", content: "hi" });
    expect(s.messages[1]).toMatchObject({ role: "assistant", content: "Hello there" });
    expect(s.messages[1].resultCards?.[0].id).toBe("p1");
    expect(s.currentChatId).toBe("c1");
    expect(s.isStreaming).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- assistantStore`
Expected: FAIL.

- [ ] **Step 3: Implement `src/stores/assistantStore.ts`**

```ts
import { create } from "zustand";
import { streamAssistant } from "@/lib/firebase/functions";
import type { ChatMessage, ResultCard } from "@/types/assistant";

interface AssistantState {
  isOpen: boolean;
  currentChatId?: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  error?: string;
  open: () => void;
  close: () => void;
  newChat: () => void;
  send: (message: string, locale: string) => Promise<void>;
}

let idSeq = 0;
const localId = () => `local-${++idSeq}`;

export const useAssistantStore = create<AssistantState>()((set, get) => ({
  isOpen: false,
  messages: [],
  isStreaming: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  newChat: () => set({ currentChatId: undefined, messages: [], error: undefined }),

  send: async (message, locale) => {
    if (get().isStreaming || !message.trim()) return;
    const userMsg: ChatMessage = { id: localId(), role: "user", content: message };
    const asstId = localId();
    set((s) => ({
      messages: [...s.messages, userMsg, { id: asstId, role: "assistant", content: "", pending: true }],
      isStreaming: true,
      error: undefined,
    }));

    const patchAsst = (fn: (m: ChatMessage) => ChatMessage) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === asstId ? fn(m) : m)) }));

    try {
      const { stream, data } = await streamAssistant({ chatId: get().currentChatId, message, locale });
      const cards: ResultCard[] = [];
      for await (const chunk of stream) {
        if (chunk.type === "delta") patchAsst((m) => ({ ...m, content: m.content + chunk.text, pending: false }));
        else if (chunk.type === "cards") { cards.push(...chunk.cards); patchAsst((m) => ({ ...m, resultCards: [...cards] })); }
        else if (chunk.type === "error") set({ error: chunk.code });
        else if (chunk.type === "done") set({ currentChatId: chunk.chatId });
      }
      const final = await data;
      patchAsst((m) => ({ ...m, content: final.text || m.content, resultCards: final.cards ?? m.resultCards, pending: false }));
      set({ currentChatId: final.chatId });
    } catch (e: any) {
      set({ error: e?.code || e?.message || "error" });
      patchAsst((m) => ({ ...m, pending: false }));
    } finally {
      set({ isStreaming: false });
    }
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- assistantStore`
Expected: PASS. (If the mock's async iterator shape mismatches, simplify the mock to return `{ stream, data }` where `stream` is the async generator — the store only consumes `stream` + `data`.)

- [ ] **Step 5: Commit**

```bash
git add src/stores/assistantStore.ts src/stores/assistantStore.test.ts
git commit -m "feat(ai): assistant Zustand store with streaming consumption"
```

---

### Task 14: Chat UI components

**Files:**
- Create: `src/components/assistant/ResultCardView.tsx`
- Create: `src/components/assistant/MessageBubble.tsx`
- Create: `src/components/assistant/Composer.tsx`
- Create: `src/components/assistant/AssistantSheet.tsx`
- Create: `src/components/assistant/FloatingAssistantButton.tsx`
- Test: `src/components/assistant/ResultCardView.test.tsx`

Follow the theme-token styling used in `src/app/admin/settings/page.tsx` (`bg-surface`, `border-hairline`, `text-content`, accent `#00C9FF`). Use `lucide-react` icons and `useI18n()` for all strings.

- [ ] **Step 1: `ResultCardView.tsx`** — renders one `ResultCard` with a Book CTA

```tsx
"use client";
import Link from "next/link";
import { Star } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import type { ResultCard } from "@/types/assistant";

export function ResultCardView({ card }: { card: ResultCard }) {
  const { t } = useI18n();
  return (
    <div className="bg-surface-elevated border border-hairline rounded-xl p-3 flex gap-3 items-center">
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-[#00C9FF]/20" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-content font-medium truncate">{card.title}</p>
        {card.subtitle && <p className="text-content-muted text-xs truncate">{card.subtitle}</p>}
        <div className="flex items-center gap-2 text-xs text-content-muted mt-0.5">
          {typeof card.rating === "number" && (
            <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3" /> {card.rating.toFixed(1)}</span>
          )}
          {card.priceLabel && <span>{card.priceLabel}</span>}
          {card.matchingSlots?.[0] && <span className="truncate">{card.matchingSlots[0]}</span>}
        </div>
      </div>
      <Link href={card.bookingHref} className="shrink-0 px-3 py-1.5 rounded-lg bg-[#00C9FF] text-black text-sm font-medium">
        {t("assistant.book")}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Test `ResultCardView.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/hooks/useI18n", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
import { ResultCardView } from "./ResultCardView";

describe("ResultCardView", () => {
  it("renders title, price and a booking link", () => {
    render(<ResultCardView card={{ kind: "provider", id: "p1", title: "Mario Rossi", priceLabel: "€40/h", bookingHref: "/book?providerId=p1" }} />);
    expect(screen.getByText("Mario Rossi")).toBeTruthy();
    expect(screen.getByText("€40/h")).toBeTruthy();
    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/book?providerId=p1");
  });
});
```

Run: `npm run test -- ResultCardView` → expected PASS after Step 1 (write test first if following strict TDD: create the test, watch it fail with "module not found", then add the component).

- [ ] **Step 3: `MessageBubble.tsx`**

```tsx
"use client";
import type { ChatMessage } from "@/types/assistant";
import { ResultCardView } from "./ResultCardView";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] space-y-2 ${isUser ? "" : "w-full"}`}>
        {(message.content || message.pending) && (
          <div className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
            isUser ? "bg-[#00C9FF] text-black" : "bg-surface border border-hairline text-content"}`}>
            {message.content || "…"}
          </div>
        )}
        {message.resultCards && message.resultCards.length > 0 && (
          <div className="space-y-2">
            {message.resultCards.map((c) => <ResultCardView key={`${c.kind}:${c.id}`} card={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `Composer.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";

export function Composer({ disabled, onSend }: { disabled?: boolean; onSend: (text: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const submit = () => { const v = value.trim(); if (!v || disabled) return; onSend(v); setValue(""); };
  return (
    <div className="flex items-end gap-2 border-t border-hairline p-3 bg-surface">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        rows={1}
        maxLength={2000}
        placeholder={t("assistant.placeholder")}
        className="flex-1 resize-none bg-surface-elevated border border-hairline rounded-xl px-3 py-2 text-content text-sm focus:outline-none focus:border-[#00C9FF]/50"
      />
      <button onClick={submit} disabled={disabled} aria-label={t("assistant.send")}
        className="shrink-0 w-10 h-10 rounded-xl bg-[#00C9FF] text-black flex items-center justify-center disabled:opacity-40">
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: `AssistantSheet.tsx`**

```tsx
"use client";
import { useEffect, useRef } from "react";
import { X, Sparkles } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { useAssistantStore } from "@/stores/assistantStore";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";

export function AssistantSheet() {
  const { t, locale } = useI18n();
  const { isOpen, close, messages, isStreaming, error, send, newChat } = useAssistantStore();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative z-10 w-full sm:max-w-md h-[80vh] sm:h-[600px] bg-background-dark sm:rounded-2xl rounded-t-2xl border border-hairline flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-surface">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#00C9FF]" />
            <span className="font-semibold text-content">{t("assistant.title")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={newChat} className="text-xs text-content-muted">{t("assistant.newChat")}</button>
            <button onClick={close} aria-label={t("common.close")}><X className="w-5 h-5 text-content-muted" /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <p className="text-content-muted text-sm text-center mt-8">{t("assistant.empty")}</p>
          )}
          {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
          {error && <p className="text-red-400 text-xs text-center">{t(`assistant.error.${error}` as any) || t("assistant.error.internal")}</p>}
          <div ref={endRef} />
        </div>

        <Composer disabled={isStreaming} onSend={(text) => send(text, locale)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `FloatingAssistantButton.tsx`** — only for logged-in customers

```tsx
"use client";
import { Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useAssistantStore } from "@/stores/assistantStore";
import { AssistantSheet } from "./AssistantSheet";

export function FloatingAssistantButton() {
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const open = useAssistantStore((s) => s.open);
  const isOpen = useAssistantStore((s) => s.isOpen);

  // Logged-in customers only.
  if (!isInitialized || !user || user.role !== "customer") return null;

  return (
    <>
      {!isOpen && (
        <button onClick={open} aria-label="Open assistant"
          className="fixed z-50 bottom-[calc(env(safe-area-inset-bottom)+88px)] right-4 w-14 h-14 rounded-full bg-[#00C9FF] text-black shadow-lg flex items-center justify-center">
          <Sparkles className="w-6 h-6" />
        </button>
      )}
      <AssistantSheet />
    </>
  );
}
```

- [ ] **Step 7: Run component test + typecheck**

Run: `npm run test -- ResultCardView && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/assistant/
git commit -m "feat(ai): chat UI — floating button, sheet, message bubbles, result cards"
```

---

### Task 15: Mount the floating button app-wide

**Files:**
- Modify: `src/app/providers.tsx`

- [ ] **Step 1: Import + mount** — in `src/app/providers.tsx`, import the component and render it after `<SectionProvider>{children}</SectionProvider>` (inside `QueryClientProvider`, near the `<Toaster />`):

```tsx
import { FloatingAssistantButton } from "@/components/assistant/FloatingAssistantButton";
```

```tsx
            <AuthProvider>
              <SectionProvider>{children}</SectionProvider>
              <FloatingAssistantButton />
            </AuthProvider>
```

(Place inside `AuthProvider` so auth state is available.)

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS (static export builds).

- [ ] **Step 3: Commit**

```bash
git add src/app/providers.tsx
git commit -m "feat(ai): mount floating assistant button app-wide for customers"
```

---

### Task 16: i18n keys (all 5 locales)

**Files:**
- Modify: `src/i18n/messages/it.ts` (source of `MessageKey`), `en.ts`, `es.ts`, `fr.ts`, `de.ts`

- [ ] **Step 1: Add keys to `it.ts`** (and matching translations to the other four). Keys to add:

```
'assistant.title', 'assistant.empty', 'assistant.placeholder', 'assistant.send',
'assistant.book', 'assistant.newChat',
'assistant.error.disabled', 'assistant.error.quota-exceeded',
'assistant.error.input-too-long', 'assistant.error.internal',
'admin.settings.ai.title', 'admin.settings.ai.subtitle',
'admin.settings.ai.enabled', 'admin.settings.ai.provider', 'admin.settings.ai.model',
'admin.settings.ai.temperature', 'admin.settings.ai.maxOutputTokens',
'admin.settings.ai.maxContextMessages', 'admin.settings.ai.dailyQuota',
'admin.settings.ai.systemPrompt', 'admin.settings.ai.keyStatus',
'admin.settings.ai.testConnection', 'admin.settings.ai.testOk', 'admin.settings.ai.testFail'
```

Italian values (example):

```ts
  'assistant.title': 'Assistente VFit',
  'assistant.empty': 'Ciao! Dimmi cosa cerchi, es. "Un personal trainer a Torino lunedì dalle 15 alle 17".',
  'assistant.placeholder': 'Scrivi un messaggio…',
  'assistant.send': 'Invia',
  'assistant.book': 'Prenota',
  'assistant.newChat': 'Nuova chat',
  'assistant.error.disabled': "L'assistente non è al momento disponibile.",
  'assistant.error.quota-exceeded': 'Hai raggiunto il limite giornaliero di messaggi.',
  'assistant.error.input-too-long': 'Messaggio troppo lungo.',
  'assistant.error.internal': 'Si è verificato un errore. Riprova.',
  'admin.settings.ai.title': 'Assistente AI',
  'admin.settings.ai.subtitle': 'Provider, modello e limiti del concierge AI',
  'admin.settings.ai.enabled': 'Abilita assistente',
  'admin.settings.ai.provider': 'Provider',
  'admin.settings.ai.model': 'Modello',
  'admin.settings.ai.temperature': 'Temperatura',
  'admin.settings.ai.maxOutputTokens': 'Token massimi in output',
  'admin.settings.ai.maxContextMessages': 'Messaggi di contesto',
  'admin.settings.ai.dailyQuota': 'Limite messaggi/giorno',
  'admin.settings.ai.systemPrompt': 'Istruzioni di sistema (opzionale)',
  'admin.settings.ai.keyStatus': 'Stato chiavi API',
  'admin.settings.ai.testConnection': 'Prova connessione',
  'admin.settings.ai.testOk': 'Connessione riuscita',
  'admin.settings.ai.testFail': 'Connessione fallita',
```

Provide en/es/fr/de equivalents (translate the same values). English example for the assistant block: `'assistant.title': 'VFit Assistant'`, `'assistant.book': 'Book'`, etc.

- [ ] **Step 2: Typecheck (ensures every locale has every key)**

Run: `npx tsc --noEmit`
Expected: PASS — `Messages = Record<MessageKey,string>` forces all 5 locales to define all keys.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/messages/
git commit -m "feat(ai): add assistant + AI settings i18n keys (it/en/es/fr/de)"
```

---

## Phase 7 — Admin UI

### Task 17: Superadmin "AI Assistant" settings panel

**Files:**
- Create: `src/components/admin/settings/AiAssistantSettings.tsx`
- Modify: `src/app/admin/settings/page.tsx` (render the panel inside `SuperadminOnly`)

- [ ] **Step 1: Create `AiAssistantSettings.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { getAiSettingsAdmin, updateAiSettings, testAiConnection } from "@/lib/firebase/functions";
import type { AiAssistantSettings as Settings, AiProviderId } from "@/types/assistant";

const PROVIDERS: AiProviderId[] = ["anthropic", "openai", "google", "openai-compatible"];

export function AiAssistantSettings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keys, setKeys] = useState<Record<AiProviderId, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => { getAiSettingsAdmin().then((r) => { setSettings(r.settings); setKeys(r.keyPresence); }).catch(() => {}); }, []);

  if (!settings) return null;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  const models = settings.availableModels[settings.provider] ?? [];

  const save = async () => {
    setSaving(true);
    try {
      await updateAiSettings({
        enabled: settings.enabled, provider: settings.provider, model: settings.model,
        temperature: settings.temperature, maxOutputTokens: settings.maxOutputTokens,
        maxContextMessages: settings.maxContextMessages, maxInputChars: settings.maxInputChars,
        dailyMessageQuota: settings.dailyMessageQuota, systemPromptOverride: settings.systemPromptOverride,
      });
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTestMsg(null);
    const r = await testAiConnection({ provider: settings.provider, model: settings.model });
    setTestMsg(r.ok ? `${t("admin.settings.ai.testOk")}: ${r.sample ?? ""}` : `${t("admin.settings.ai.testFail")}: ${r.error ?? ""}`);
  };

  const input = "w-full px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50";
  const label = "block text-sm font-medium text-content-muted mb-2";

  return (
    <div className="bg-surface rounded-2xl border border-hairline p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[#00C9FF]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-content">{t("admin.settings.ai.title")}</h3>
          <p className="text-sm text-content-muted">{t("admin.settings.ai.subtitle")}</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-content">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        {t("admin.settings.ai.enabled")}
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>{t("admin.settings.ai.provider")}</label>
          <select className={input} value={settings.provider}
            onChange={(e) => { const p = e.target.value as AiProviderId; setSettings({ ...settings, provider: p, model: (settings.availableModels[p] ?? [])[0] ?? settings.model }); }}>
            {PROVIDERS.map((p) => <option key={p} value={p}>{p}{keys && !keys[p] ? " (no key)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>{t("admin.settings.ai.model")}</label>
          {models.length ? (
            <select className={input} value={settings.model} onChange={(e) => set("model", e.target.value)}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input className={input} value={settings.model} onChange={(e) => set("model", e.target.value)} />
          )}
        </div>
        <div>
          <label className={label}>{t("admin.settings.ai.temperature")}</label>
          <input className={input} type="number" step="0.1" min={0} max={2} value={settings.temperature}
            onChange={(e) => set("temperature", Number(e.target.value))} />
        </div>
        <div>
          <label className={label}>{t("admin.settings.ai.maxOutputTokens")}</label>
          <input className={input} type="number" value={settings.maxOutputTokens}
            onChange={(e) => set("maxOutputTokens", Number(e.target.value))} />
        </div>
        <div>
          <label className={label}>{t("admin.settings.ai.maxContextMessages")}</label>
          <input className={input} type="number" value={settings.maxContextMessages}
            onChange={(e) => set("maxContextMessages", Number(e.target.value))} />
        </div>
        <div>
          <label className={label}>{t("admin.settings.ai.dailyQuota")}</label>
          <input className={input} type="number" value={settings.dailyMessageQuota}
            onChange={(e) => set("dailyMessageQuota", Number(e.target.value))} />
        </div>
      </div>

      <div>
        <label className={label}>{t("admin.settings.ai.systemPrompt")}</label>
        <textarea className={input} rows={3} value={settings.systemPromptOverride ?? ""}
          onChange={(e) => set("systemPromptOverride", e.target.value)} />
      </div>

      {keys && (
        <p className="text-xs text-content-muted">
          {t("admin.settings.ai.keyStatus")}: {PROVIDERS.map((p) => `${p}=${keys[p] ? "✓" : "✗"}`).join("  ")}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-[#00C9FF] text-black font-medium disabled:opacity-50">
          {t("common.save") || "Save"}
        </button>
        <button onClick={test} className="px-4 py-2 rounded-xl border border-hairline text-content">
          {t("admin.settings.ai.testConnection")}
        </button>
        {testMsg && <span className="text-xs text-content-muted">{testMsg}</span>}
      </div>
    </div>
  );
}
```

> Reuse the existing `'common.save'` key if present; otherwise the `|| "Save"` fallback covers it.

- [ ] **Step 2: Render it in the settings page** — in `src/app/admin/settings/page.tsx`, import and place the panel (wrapped so only superadmin sees it). The page already redirects non-superadmins, but wrap defensively:

```tsx
import { SuperadminOnly } from "@/components/admin/SuperadminOnly";
import { AiAssistantSettings } from "@/components/admin/settings/AiAssistantSettings";
```

Add within the settings sections JSX:

```tsx
<SuperadminOnly>
  <AiAssistantSettings />
</SuperadminOnly>
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/settings/AiAssistantSettings.tsx src/app/admin/settings/page.tsx
git commit -m "feat(ai): superadmin AI Assistant settings panel"
```

---

## Phase 8 — Deploy, configure, verify

### Task 18: Configure secrets & deploy

**Files:** none (operational)

- [ ] **Step 1: Set Firebase secrets** (only those you will use; Gemini is the default)

```bash
cd /Users/hidranarias/projects/vfit
firebase functions:secrets:set GOOGLE_GENAI_API_KEY
# Optional, as you enable more providers:
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set OPENAI_COMPAT_API_KEY
firebase functions:secrets:set OPENAI_COMPAT_BASE_URL
```

> A function that declares a secret it can't resolve will fail to deploy. If you only set `GOOGLE_GENAI_API_KEY`, set the others to a placeholder (e.g. `x`) or temporarily trim `AI_SECRETS` to the ones that exist, then expand later.

- [ ] **Step 2: Deploy rules, indexes, functions**

```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions:chatWithAssistant,functions:getAiSettingsAdmin,functions:updateAiSettings,functions:testAiConnection
```

Expected: deploy succeeds; functions appear in `europe-west1`.

- [ ] **Step 3: Seed default settings + enable** (as superadmin, in the admin UI)

Open `/admin/settings`, scroll to **AI Assistant**, confirm provider `google` / model `gemini-2.5-flash`, click **Test connection** (expect OK), toggle **Enable**, **Save**.

- [ ] **Step 4: Manual verification (the spec's acceptance scenario)**

Use the `verify` skill or do it manually:
1. Log in as a **customer** → floating sparkle button appears bottom-right on VFit/VFun/VLife.
2. Open it, send: *"I need a personal trainer in Torino for Monday from 3 to 5 pm."*
3. Expect: streamed reply + provider result card(s) with rating/price/slot and a **Book** button.
4. Tap **Book** → lands on `/book?providerId=...` (existing flow).
5. Send an off-topic message (*"write me a python script"*) → assistant politely declines.
6. Exceed the daily quota (temporarily set quota to 1 in admin) → friendly limit message.
7. As superadmin toggle **Enable** off → opening chat / sending shows "temporarily unavailable".
8. Verify history persists: reload → previous messages reload from Firestore (if history-list UI is wired; otherwise confirm docs exist under `/users/{uid}/chats`).

- [ ] **Step 5: Commit any fixes found during verification, then finalize**

```bash
git add -A && git commit -m "fix(ai): adjustments from manual verification" || echo "no fixes needed"
```

---

## Self-review (author checklist — completed during planning)

- **Spec coverage:** multi-provider (Task 3) ✓; superadmin default provider/model (Tasks 2,10,17) ✓; read-only search-&-propose tools (Task 6) ✓; streaming (Tasks 9,12,13) ✓; persisted history (Tasks 9,11) ✓; floating button all sections (Tasks 14,15) ✓; guardrails — quota (Task 8), token/length caps (Tasks 9,10), topic guardrail (Task 7), kill-switch (Tasks 9,10,17) ✓; audit on settings change (Task 10) ✓; i18n 5 locales (Task 16) ✓; tests across pure logic + tools + store + component (Tasks 2–10,13,14) ✓; deploy/secrets (Task 18) ✓.
- **Type consistency:** `AiAssistantSettings`, `ResultCard`, `AiStreamChunk`, `AiProviderId` defined once server-side (Task 2) and mirrored client-side (Task 12) with identical fields; `bookingHref` shape `/book?providerId=` matches the real route (`src/app/book/page.tsx`, `useSearchParams().get('providerId')`).
- **Known follow-ups flagged inline:** confirm AI SDK `fullStream` part property names against installed types (Task 9); `title`-on-create simplification (Task 9); add `"ai_settings"` to audit `entityType` union (Task 10); secrets-must-resolve-to-deploy caveat (Task 18).
```

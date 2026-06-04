# AI Assistant ("VFit Concierge") — Design Spec

**Date:** 2026-06-04
**Status:** Approved (design) — pending implementation plan
**Author:** Hidran Arias (with Claude Code)

## 1. Summary

Add an AI chat assistant for **registered customers** that turns natural-language
requests (e.g. *"I need a personal trainer in Torino for Monday from 3 to 5 pm"*)
into structured searches over the platform's data, then proposes ranked results as
bookable cards.

The assistant is:

- **Read-only / "search & propose":** it searches providers, classes, and venues and
  presents results. It never books or pays. Booking continues through the existing
  validated flow.
- **Multi-provider:** abstracts over Anthropic (Claude), OpenAI (GPT), Google
  Gemini/Vertex, and any OpenAI-compatible endpoint (Ollama, Mistral, Together, …).
- **Superadmin-configurable:** the active provider, model, and runtime parameters are
  set from the superadmin admin panel; no redeploy needed to switch.
- **Guardrailed:** strictly bound to VFit/VFun/VLife goals, with per-user daily
  quota, token/length caps, an off-topic refusal guardrail, and a kill-switch.
- **Streaming:** replies stream token-by-token via Firebase v2 streaming callables.

## 2. Goals & Non-Goals

### Goals
- Natural-language discovery across the search domain (providers, instructors,
  classes, venues) with day/time + location filtering.
- One unified tool-calling + streaming loop across all supported LLM providers.
- Superadmin control of default provider + model + runtime params + kill-switch.
- Conversation history persisted per customer, available across devices.
- Strong guardrails: domain scope, cost controls, privacy.

### Non-Goals (YAGNI for v1)
- No booking/payment execution by the AI (read-only proposals only).
- No assistant for providers/admins (customers only at launch).
- No voice input, no image input.
- No fine-tuning / RAG over external documents.
- No multi-agent orchestration — a single agentic tool loop.

## 3. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| AI scope | Search & propose only (read-only tools) |
| Providers at launch | Anthropic, OpenAI, Google Gemini/Vertex, OpenAI-compatible (local) |
| Conversation storage | Persisted in Firestore under `/users/{uid}/chats` |
| Entry point | Floating button, all sections (VFit/VFun/VLife), logged-in customers |
| Response delivery | Streaming (Firebase v2 streaming callable) |
| Cost/abuse guardrails | Per-user daily quota + token/length caps + topic guardrail + kill-switch |
| Multi-provider strategy | **Vercel AI SDK** (`ai` + `@ai-sdk/*`) — unified tools + streaming |

### Why Vercel AI SDK (vs. alternatives)
- **A. Vercel AI SDK (chosen):** one `streamText` API normalizes tool-calling and
  streaming across all four provider families; switching provider/model is a registry
  lookup driven by settings. Least glue code. Trade-off: a third-party abstraction in
  the dependency tree.
- **B. Custom adapter layer:** maximum control, no lock-in, but re-implements
  tool-call normalization + streaming per provider — the exact hard part the SDK solves.
- **C. Firebase Genkit:** great if Google-only; non-Google provider plugins are
  community-maintained and less mature, which fights the multi-provider requirement.

## 4. Architecture

```
Customer (Capacitor/Web)
  └─ FloatingAssistantButton → AssistantSheet
       └─ assistantStore.send()  ── httpsCallable('chatWithAssistant').stream() ──▶
                                                                                   │
Cloud Function: chatWithAssistant (onCall streaming, europe-west1, Node 24)        │
  1. Auth + customer check                                                          │
  2. Load /systemSettings/aiAssistant  (enabled? kill-switch)                       │
  3. Quota check (txn on /users/{uid}/ai_usage/{date})                             │
  4. Load capped history (/users/{uid}/chats/{chatId}/messages)                    │
  5. Build system prompt (guardrails, locale, date, city)                          │
  6. streamText(model, tools, stopWhen, caps) ──▶ response.sendChunk(delta) ◀──────┘
        ├─ tool: searchProviders     (read-only Firestore)
        ├─ tool: searchClasses
        ├─ tool: searchVenues
        └─ tool: getProviderAvailability
  7. Persist messages + result cards; increment usage counters

Provider registry (functions/src/ai/providers.ts)
  anthropic | openai | google | openai-compatible
  keys from Firebase secrets (never Firestore)
```

### 4.1 Multi-provider layer — `functions/src/ai/`
- `providers.ts` — registry mapping provider id → factory returning an AI SDK
  `LanguageModel`:
  - `anthropic` → `@ai-sdk/anthropic` (`ANTHROPIC_API_KEY`)
  - `openai` → `@ai-sdk/openai` (`OPENAI_API_KEY`)
  - `google` → `@ai-sdk/google` (`GOOGLE_GENAI_API_KEY`)
  - `openai-compatible` → `createOpenAICompatible({ baseURL })`
    (`OPENAI_COMPAT_API_KEY` + `OPENAI_COMPAT_BASE_URL`)
- All keys declared as Firebase **secrets** on the function; only the active
  provider's key is read at runtime. Keys are **never** stored in Firestore.
- A `keyPresence()` helper reports which providers have a key configured
  (boolean only) for the admin UI — never reveals the secret value.

### 4.2 Settings — `/systemSettings/aiAssistant` (superadmin only)
```ts
interface AiAssistantSettings {
  enabled: boolean;                 // kill-switch
  provider: 'anthropic' | 'openai' | 'google' | 'openai-compatible';
  model: string;                    // default: 'gemini-2.5-flash' (cheap)
  availableModels: Record<string, string[]>; // provider -> selectable models
  temperature: number;              // default 0.3
  maxOutputTokens: number;          // default 1024
  maxContextMessages: number;       // default 12
  maxInputChars: number;            // default 2000
  dailyMessageQuota: number;        // default 30
  systemPromptOverride?: string;    // optional
  updatedAt: Timestamp;
  updatedBy: string;
}
```
**Seeded defaults** (on first read if the document is missing):
- `provider: 'google'`, `model: 'gemini-2.5-flash'` — cheap, fast, EU residency
  via Vertex matching `europe-west1`.
- `availableModels`:
  - `google`: `['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']`
  - `openai`: `['gpt-4o-mini', 'gpt-5-mini', 'gpt-4o']`
  - `anthropic`: `['claude-haiku-4-5', 'claude-sonnet-4-6']`
  - `openai-compatible`: `[]` (admin enters the model id for their endpoint)

The cheap defaults (Gemini Flash / GPT-mini / Claude Haiku) are listed first per
provider so the admin picks an inexpensive model by default. Model IDs are
verified against current provider docs (via Context7) during planning.

### 4.3 Cloud Function `chatWithAssistant`
- `onCall` v2 streaming callable, region `europe-west1`, declares all provider
  secrets. Handler streams text deltas via `response.sendChunk`.
- **Request:** `{ chatId?: string; message: string; locale: AppLocale }`
  (no `chatId` → create a new chat).
- **Streamed chunks:** `{ type: 'delta', text }`, `{ type: 'tool', name, status }`
  (optional progress), `{ type: 'cards', cards: ResultCard[] }`,
  `{ type: 'done', chatId, messageId }`.
- **Errors (returned as terminal chunk / thrown HttpsError):**
  `disabled`, `quota-exceeded`, `input-too-long`, `unauthenticated`,
  `internal`. Each maps to a friendly localized client message.
- **Agentic loop:** `streamText({ model, tools, stopWhen: stepCountIs(N),
  temperature, maxOutputTokens })`. Tool calls execute server-side; their normalized
  results both feed the model and are emitted to the client as `cards`.

### 4.4 Tools — `functions/src/ai/tools/` (Zod-typed, read-only)
All tools query Firestore via the Admin SDK but **explicitly restrict** output to
public-safe fields and verified/active records.

- `searchProviders({ section?, specialty?, userType?, city?, lat?, lng?, radiusKm?,
  dayOfWeek?, startTime?, endTime?, language?, priceMax?, limit? })`
  → `users` where `role='provider'` & verified, filtered by specialty/userType,
  location (city or geo radius), availability window matched against
  `providerProfile.availabilitySchedule`, language, price. Also queries
  `instructors` (geohash). Returns ranked `ResultCard[]`.
- `searchClasses({ section?, city?, lat?, lng?, radiusKm?, dayOfWeek?, startTime?,
  endTime?, limit? })` → `fitnessClasses` + `/schedules`.
- `searchVenues({ section?, type?, city?, lat?, lng?, radiusKm?, limit? })`
  → `venues`.
- `getProviderAvailability({ providerId, fromDate, toDate })` → detailed open slots
  for one provider, to firm up a proposal.

```ts
interface ResultCard {
  kind: 'provider' | 'instructor' | 'class' | 'venue';
  id: string;
  title: string;
  subtitle?: string;          // e.g. specialties / venue name
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  priceLabel?: string;        // e.g. "€40/h"
  distanceKm?: number;
  matchingSlots?: string[];   // e.g. ["Mon 15:00–17:00"]
  bookingHref: string;        // '/booking?providerId=...' (query-string per static export)
}
```

### 4.5 Guardrails
- **System prompt** (built server-side, optionally overridden by settings): scope
  strictly to VFit/VFun/VLife discovery & booking guidance; refuse off-domain
  requests (coding, general chat, medical/legal/financial advice beyond app scope);
  **never invent** providers, prices, or availability — report only tool results;
  reply in the user's locale; respect privacy (no PII beyond public profile fields);
  include today's date and the user's known city for relative-time/location grounding.
- **Tool whitelist:** only the four read-only search tools are exposed.
- **Cost/abuse limits:** `maxInputChars`, `maxContextMessages`, `maxOutputTokens`,
  per-user `dailyMessageQuota`, and `enabled` kill-switch — all from settings, no
  redeploy.
- **Safety by construction:** results come only from tools and booking goes through
  the existing validated flow, so a hallucinated provider cannot be booked.

## 5. Data model (Firestore)

| Path | Shape | Notes |
|---|---|---|
| `/systemSettings/aiAssistant` | `AiAssistantSettings` | superadmin read/write |
| `/users/{uid}/chats/{chatId}` | `{ title, createdAt, updatedAt, lastMessagePreview, locale, messageCount }` | owner read; superadmin read |
| `/users/{uid}/chats/{chatId}/messages/{msgId}` | `{ role, content, resultCards?, provider, model, tokensIn, tokensOut, createdAt }` | owner read; superadmin read |
| `/users/{uid}/ai_usage/{YYYY-MM-DD}` | `{ count, tokensIn, tokensOut }` | quota counters |

### Firestore rules
- `/users/{uid}/chats/**`: `allow read: if isOwner(uid) || isSuperAdmin();`
  **all writes via the function** (Admin SDK bypasses rules) → `allow write: if false;`
  (or restrict to superadmin maintenance only).
- `/users/{uid}/ai_usage/**`: no client access (`allow read, write: if isSuperAdmin();`);
  written by the function.
- `/systemSettings/aiAssistant`: `allow read, write: if isSuperAdmin();` (existing pattern).
- Customer-facing "enabled" state is **not** exposed client-side: the floating button
  always renders for logged-in customers; if disabled, opening the sheet shows a
  localized "temporarily unavailable" message returned by the function.

### Indexes
- Composite indexes as needed for provider/instructor/class queries
  (e.g. `role + isVerified + specialties`, geohash range + section). Enumerated
  during planning against actual query shapes.

## 6. Superadmin admin UI

New **"AI Assistant"** panel (superadmin-only) in admin settings:
- Kill-switch toggle (`enabled`).
- Provider select; model select populated from `availableModels[provider]`.
- Numeric fields: temperature, maxOutputTokens, maxContextMessages, maxInputChars,
  dailyMessageQuota.
- Optional system-prompt override (textarea).
- **Key status row:** shows which providers have a key configured (presence only).
- **"Test connection"** button → callable that does a 1-token round-trip with the
  selected provider/model and reports success/error.
- Saving calls callable **`updateAiSettings`** (`requireSuperAdmin`) → writes
  `/systemSettings/aiAssistant` + an **`audit_logs`** entry (actor, before/after).

## 7. Client

- `src/stores/assistantStore.ts` (Zustand): `sessions`, `currentChatId`,
  `messages`, `isStreaming`, `error`; actions `send(message)`, `loadHistory()`,
  `openChat(chatId)`, `newChat()`. `send()` consumes the
  `httpsCallable(functions,'chatWithAssistant').stream()` async-iterable, appending
  deltas and applying `cards`/`done` chunks.
- `src/components/assistant/`:
  - `FloatingAssistantButton` — bottom-right FAB, logged-in customers, all sections.
  - `AssistantSheet` — chat window (sheet/drawer).
  - `MessageList`, `MessageBubble`.
  - `ResultCard` — provider/instructor/class/venue card with **Book** CTA.
  - `Composer` — input with `maxInputChars` enforcement + send.
- `ResultCard` "Book" → `router.push(card.bookingHref)` (query-string route).
- i18n: new keys added to all five locale files (it/en/es/fr/de), with `it` and `en`
  authoritative and the rest filled in.

## 8. Testing

- **Provider registry:** model/key resolution per settings; correct SDK selected;
  `keyPresence()` correctness.
- **Tools (Firestore emulator):** day/time/city matching, geo radius, verified/active
  filtering, public-field redaction, ranking, `limit`.
- **Guardrails:** off-topic refusal, quota transaction (atomic increment + reject),
  kill-switch, input-length + token caps.
- **End-to-end function (emulator + mock provider):** inject a fake provider that
  returns canned tool calls → validate the loop, streamed chunk sequence, message
  persistence, and usage counters.
- **Client:** `assistantStore` streaming consumption; `ResultCard` rendering +
  booking href.

## 9. Dependencies & references

- Add to `functions/`: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`,
  `@ai-sdk/openai-compatible`, `zod` (if not present).
- New Firebase secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENAI_API_KEY`,
  `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_BASE_URL`.
- Pull current API docs via **Context7** during planning: Vercel AI SDK
  (`streamText`, tools, `stopWhen`, provider packages) and Firebase Functions v2
  **streaming callables** (`response.sendChunk`, client `.stream()`).

## 10. Rollout

1. Implement provider layer + settings + function + tools behind `enabled=false`.
2. Configure secrets and seed default settings (provider/model) as superadmin.
3. Enable for internal/superadmin testing via the kill-switch.
4. Enable platform-wide; monitor usage counters and cost.

## 11. Open questions / future work

- Optional later: let the AI **draft** a booking (stop-at-confirmation) — explicitly
  out of scope for v1.
- Optional later: usage analytics dashboard for superadmin (per-day cost/messages).
- Optional later: assistant for providers (schedule/clients) — out of scope.

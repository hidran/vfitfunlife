# Streaming — Live & Contenuti

**Date:** 2026-05-26
**Branch:** `main`
**Status:** Design approved, ready for implementation plan

## Problem

The POC proposal (`docs/PREVENTIVO…pdf`) item #11 calls for a "Live & Contenuti" page that lists trainers with a streaming channel and embeds each one's Twitch/YouTube channel; item #4 calls for a "Guarda il canale live" button on the trainer detail; item #8 lists a trainer streaming link + a "visible/non visible in public list" toggle. The app currently has streaming-*themed* placeholder content (`fun/tv`, `fit/virtual`) but no per-trainer streaming link, no embed page, and no visibility toggle. This is the one POC gap.

## Goals

- A trainer can paste their Twitch/YouTube channel URL and toggle whether they're visible in the public list.
- Customers see a "Live & Contenuti" page listing trainers who have a public stream, and can watch the embedded channel on a dedicated view.
- The trainer detail page shows a "Guarda il canale live" button when a stream exists.
- Public trainer lists (booking search, home) hide trainers marked not-visible.
- Demo trainers come pre-seeded with real public channels so the embeds actually play video.

## Non-goals

- Donation/subscription tracking (POC: happens on the streaming platform, no internal tracking).
- Video paywall / "registered users only" access gating (POC keeps live public-only for now).
- Going-live push notifications, stream schedule, or VOD library.
- Native (Capacitor) Twitch embedding — Twitch's `parent` requirement doesn't accept the `capacitor://` scheme; native shows the graceful "open channel" fallback for Twitch (YouTube still embeds).

## Architecture

### Data model — `Provider` (instructor doc)

```ts
// src/types/instructor.ts — added to Provider
streamingUrl?: string;   // raw URL the trainer pasted (Twitch or YouTube)
isPublic?: boolean;      // visibility in public lists; absent/true = visible, false = hidden
```

Mapped in `flattenProvider` (`src/lib/firebase/providers.ts`):
```ts
streamingUrl: (data.streamingUrl as string) ?? undefined,
isPublic: typeof data.isPublic === 'boolean' ? (data.isPublic as boolean) : undefined,
```

### Stream parsing/embedding — `src/lib/streaming.ts` (pure, tested)

```ts
export type StreamPlatform = 'youtube' | 'twitch';
export interface ParsedStream {
  platform: StreamPlatform;
  kind: 'channel' | 'video';
  id: string; // channel id/handle, or video id
}

/** Parse a pasted Twitch/YouTube URL. Returns null if unrecognized. */
export function parseStreamUrl(url: string): ParsedStream | null;

/**
 * Build an iframe src for the parsed stream.
 * - YouTube channel → https://www.youtube.com/embed/live_stream?channel=<id>
 * - YouTube video   → https://www.youtube.com/embed/<id>
 * - Twitch          → https://player.twitch.tv/?channel=<id>&parent=<parentHost>
 * parentHost should be window.location.hostname at call time.
 * Returns null for Twitch when parentHost is empty/unusable.
 */
export function buildEmbedUrl(parsed: ParsedStream, parentHost: string): string | null;
```

Parser recognizes:
- YouTube: `youtube.com/watch?v=<v>` and `youtu.be/<v>` → `{youtube, video, v}`; `youtube.com/channel/<UC…>` → `{youtube, channel, UC…}`; `youtube.com/@handle`, `/c/<name>`, `/user/<name>` → `{youtube, channel, handle}` (note: live_stream embed needs a UC id; @handle embeds are best-effort — see Seed note).
- Twitch: `twitch.tv/<channel>` (ignoring `/videos/…` sub-paths for MVP) → `{twitch, channel, <channel>}`.
- Anything else → `null`.

### Components — `src/components/streaming/`

**`StreamEmbed.tsx`** — props `{ streamingUrl: string; title?: string }`.
- Parses the URL; computes `parentHost` from `window.location.hostname`.
- If `buildEmbedUrl` returns a src → renders a responsive 16:9 `<iframe>` (`allowfullscreen`, `loading="lazy"`).
- If parse fails OR Twitch with no usable parent (e.g. native) → renders an "Apri il canale" external link button (`target="_blank" rel="noopener"`) to the original `streamingUrl`.
- `'use client'` (needs `window`).

**`StreamLinkEditor.tsx`** — props `{ streamingUrl, isPublic, onSave }`.
- Text input to paste the URL; on change, run `parseStreamUrl` for live validation: invalid non-empty → red helper "Link non riconosciuto (usa Twitch o YouTube)"; valid → show a small `<StreamEmbed>` preview + platform badge.
- A toggle (switch/checkbox) bound to `isPublic` labeled "Visibile nella lista pubblica".
- A "Salva" button calling `onSave({ streamingUrl, isPublic })`; disabled while saving.
- Empty `streamingUrl` is allowed (clears the stream).

### Data layer + hooks

- `src/lib/firebase/providers.ts`:
  - `updateProviderStreaming(providerId, { streamingUrl, isPublic })` → `updateDoc` on `/instructors/{id}` (writes both fields; `streamingUrl: ''` clears).
  - `fetchLiveProviders(opts?: { limit?: number })` → query `/instructors` where `providerProfile.isVerified == true`; client-filter to those with a non-empty `streamingUrl` and `isPublic !== false`. (Firestore can't range-filter "non-empty string" cleanly alongside the existing equality; client filter on the verified set is fine at demo scale.)
- New `src/hooks/useStreaming.ts` holds BOTH hooks (re-exported from `src/hooks/index.ts`):
  - `useLiveProviders()` → `useQuery({ queryKey: ['live-providers'], queryFn: fetchLiveProviders, staleTime: 5*60_000 })`.
  - `useUpdateProviderStreaming(uid)` → `useMutation` calling `updateProviderStreaming`, `onSuccess` invalidates `['provider', uid]` + `['live-providers']` + `['providers']`.

### Visibility (`isPublic`) in existing lists

- `searchProviders` (`src/lib/firebookings.ts`): drop results where `isPublic === false` (after mapping; treat missing as visible).
- `fetchProviders` (`src/lib/firebase/providers.ts`): same filter in the post-fetch `.filter(...)` chain.

### Pages

**`/live`** — new route `src/app/(main)/live/page.tsx` (+ `LiveClient.tsx`), wrapped in `<Suspense>` (uses `useSearchParams`).
- No `providerId` query → "Live & Contenuti" grid: cards for each `useLiveProviders()` result (avatar, name, specialty, YouTube/Twitch badge, "Guarda" button). Empty state when none.
- With `?providerId=X` → fetch that provider (`useProvider`), render `<StreamEmbed streamingUrl=…>` full-width + a back link + trainer name/specialty + a "Richiedi sessione" CTA linking to `/book?providerId=X`.

**`/book` detail** (`src/app/book/BookingClient.tsx`) — when `provider.streamingUrl` is set, add a "Guarda il canale live" button (next to "Messaggio"/"Verifica disponibilità") linking to `/live?providerId=<id>`.

**Trainer editor** (`src/app/(main)/provider/services/page.tsx`) — add a third tab "Profilo/Live" (alongside Servizi, Galleria) rendering `<StreamLinkEditor>` bound to the logged-in provider's `streamingUrl`/`isPublic` via `useProvider(uid)` + `useUpdateProviderStreaming(uid)`.

**Nav entry** — repoint the existing VFun "tv"/streaming entry (or add a "Live" link in the VFun area / SideDrawer) to `/live` so the page is reachable. Exact wiring decided at implementation by following the existing nav pattern; goal: one discoverable entry point to `/live`.

### Seed — `generateDemoStreams()` (`functions/src/seed/seedData.ts`)

- Assign ~8–10 deterministic demo trainers a real public YouTube embed URL (favor evergreen workout **video** URLs like `youtube.com/watch?v=<id>` so the embed reliably plays video rather than depending on a channel being live at demo time) plus 1–2 Twitch channel URLs (e.g. a known public channel) to exercise the Twitch path.
- Set `streamingUrl` + `isPublic: true` on those docs via merge. Idempotent.
- A local-run script `functions/scripts/run-seed-streams.mjs` mirrors the existing seed scripts.

### Error handling

| Case | Behavior |
|---|---|
| Trainer pastes unrecognized URL | Editor shows inline "Link non riconosciuto"; Save still allowed only with a valid or empty URL. |
| Twitch under native WebView (no usable parent) | `StreamEmbed` renders "Apri il canale" external link instead of a broken iframe. |
| `streamingUrl` present but `buildEmbedUrl` null | Same external-link fallback. |
| `/live` with no streaming trainers | Friendly empty state ("Nessun canale live al momento"). |
| `/live?providerId=X` where X has no stream / not found | Render the existing not-found panel + link back to `/live`. |

## Testing

- Vitest `src/lib/streaming.test.ts`:
  - `parseStreamUrl`: `watch?v=` + `youtu.be` → video; `/channel/UC…` → channel; `/@handle` → channel handle; `twitch.tv/foo` → twitch channel; junk/empty → null.
  - `buildEmbedUrl`: YouTube video → `/embed/<id>`; YouTube channel → `/embed/live_stream?channel=`; Twitch → contains `player.twitch.tv` + `parent=<host>`; Twitch with empty host → null.
- No automated test for live iframe rendering (needs DOM + network); manual verification on `/live`, `/book`, and the editor.

## Implementation ordering (detailed in writing-plans)

1. `src/lib/streaming.ts` + tests.
2. Types: `Provider.streamingUrl` + `isPublic`; `flattenProvider` mapping.
3. `updateProviderStreaming` + `fetchLiveProviders` + hooks; `isPublic` filter in `searchProviders`/`fetchProviders`.
4. `StreamEmbed` + `StreamLinkEditor` components.
5. `/live` page + `LiveClient` (grid + `?providerId=` embed view).
6. `/book` "Guarda il canale live" button.
7. Trainer editor tab on `/provider/services`.
8. Nav entry point → `/live`.
9. Seed `generateDemoStreams` + run.
10. Verify: tests, build, manual (editor sets a link → appears on /live → embeds; detail button; visibility toggle hides from booking).

## Risks

| Risk | Mitigation |
|---|---|
| YouTube `@handle` URLs don't embed live_stream without a UC channel id | Parser keeps the handle but the embed is best-effort; **seed uses `watch?v=` video URLs (always embeddable)** so the demo is reliable. Trainers pasting a handle get the external-link fallback if the embed can't resolve. |
| Twitch `parent` must match the serving host | `buildEmbedUrl` injects `window.location.hostname` at runtime, auto-covering localhost + vfit-funlife.web.app. Native gets the fallback link. |
| Seeded "live" channels may be offline at demo time | Seed evergreen **video** embeds (not live channels) for reliable playback; the page still calls it "Live & Contenuti" per POC naming. |
| `isPublic` filter accidentally hides legacy trainers (no field) | Treat missing `isPublic` as visible (`!== false`); only an explicit `false` hides. Seeded demo trainers stay visible. |
| Content-Security-Policy blocking iframes | If a CSP `frame-src` is set it must allow `youtube.com`/`player.twitch.tv`; verify at implementation (no CSP currently configured in next.config). |

# Complete Multilanguage (it · en · es · fr · de)

**Date:** 2026-05-27
**Branch:** `main` (feature branch/commits on main, as in this repo's recent flow)
**Status:** Design approved by user; ready for implementation plan(s)

## Problem

The app already has an i18n foundation (`src/contexts/I18nContext.tsx`, `src/i18n/messages/{it,en,es,fr,de}.ts`, `src/types/locale.ts`): 5 locales registered, `t()` with interpolation, localStorage persistence, browser-language detection, and a language switcher in `ProfileSectionScreen`. But it falls short of "users can switch language; default detected by browser/device; all labels translated into it/en/es/fr/de":

1. **No device (native) detection** — only `navigator.language`. On native (Capacitor) the device language isn't read.
2. **New users are hardcoded to Italian** — `completeRegistration` writes `preferredLanguage: 'it'` regardless of detected language.
3. **Switching isn't synced to the account** — the switcher updates the context/localStorage but doesn't reliably persist `preferredLanguage` to Firestore, so the choice doesn't follow the user across devices.
4. **Switcher only in profile** — no way to choose language before logging in.
5. **Translations incomplete** — `es`/`fr`/`de` each miss ~32 of the 556 catalog keys (silently falling back to Italian), and many user-facing strings across the app are hardcoded (not in the catalog at all — e.g. the provider self-registration UI, the admin applications panel).

## Goals

- Default locale detected from **device language on native** and **browser language on web**, with the user's explicit/stored choice always winning.
- A **new user's** `preferredLanguage` defaults to the detected locale (not hardcoded `it`).
- Switching language **persists to the account** (`users/{uid}.preferredLanguage`) when logged in, and to localStorage when logged out — so it follows the user across devices.
- Language is switchable **in profile settings and on the pre-login auth/onboarding screens**.
- **Every user-facing label is translated in all 5 locales** — the existing catalog gaps are filled, all hardcoded strings are migrated into the catalog, and completeness is **enforced at compile time**.

## Non-goals

- Adding locales beyond it/en/es/fr/de.
- Right-to-left layout (none of these 5 are RTL).
- Translating dynamic/user-generated content (provider bios, service names, reviews) or seeded demo data.
- Locale-specific number/date/currency formatting beyond what exists (out of scope; `toLocaleTag` already exists if needed later).
- Server-side locale negotiation (the app is a static export; detection is client-side).

## Architecture

Build on the existing `I18nContext`; do not replace it.

### 1. Detection — `src/lib/i18n/detectLocale.ts` (new)

```ts
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale, type AppLocale } from '@/types/locale';

/** Map a BCP-47-ish tag ("en-US", "de") to a supported AppLocale, or null. */
export function localeFromTag(tag: string | null | undefined): AppLocale | null;

/** Synchronous best guess from the browser (navigator.language/languages). Safe on SSR (returns null). */
export function detectBrowserLocale(): AppLocale | null;

/** Async device locale on native via @capacitor/device Device.getLanguageCode(); null on web or failure. */
export function detectDeviceLocale(): Promise<AppLocale | null>;
```

`detectDeviceLocale` imports `@capacitor/device` and only calls it when `isNativePlatform()` (`src/lib/utils.ts`); otherwise returns `null`. Errors → `null` (caller falls back).

### 2. `I18nContext` wiring

- Initial state stays **synchronous**: stored localStorage choice → `detectBrowserLocale()` → `DEFAULT_LOCALE`. (Unchanged behavior; refactored to use `detectLocale.ts`.)
- Add an async effect that runs **once on mount, only when there is no stored choice**: `const d = await detectDeviceLocale(); if (d) setLocaleState(d)`. This refines the default on native without blocking render. (Skipped entirely if the user already chose a locale, so it never overrides an explicit choice.)
- Keep `setLocale` as the low-level setter (context + localStorage). Persistence-to-account lives in a separate hook (below) so the context has no Firestore dependency.

### 3. Account sync — `src/hooks/useChangeLocale.ts` (new)

```ts
/** Returns changeLocale(locale): updates context+localStorage, and persists to users/{uid}.preferredLanguage when logged in. */
export function useChangeLocale(): (locale: AppLocale) => Promise<void>;
```

Implementation: calls `setLocale(locale)` from `useI18n()`; reads the current user from `authStore`; if logged in, `updateDoc(users/{uid}, { preferredLanguage: locale, updatedAt })` then refreshes the auth user (`loadUserData`). A Firestore failure is caught and logged — the local switch still applies (don't block the UI). This update is within the existing `isValidUserUpdate` allowlist (which already includes `preferredLanguage`).

The existing `(main)/layout.tsx` effect that applies `user.preferredLanguage` → `setLocale` on load stays (idempotent with `changeLocale`).

### 4. New-user default = detected locale

- `completeRegistration` (`src/lib/firebase/auth.ts:258`) already accepts an options object; add `preferredLanguage?: AppLocale` and write it (default to `DEFAULT_LOCALE` only if absent) instead of the hardcoded `"it"` at line 292.
- `authStore.registerWithEmail` (`src/stores/authStore.ts:514`) passes `preferredLanguage` to its internal `completeRegistration` call.
- Both register flows (`handleEmailSubmit`, `handleSocialSubmit` in `src/app/auth/register/page.tsx`) pass the **current** `locale` from `useI18n()` as `preferredLanguage`. Because detection already set the context locale, the new account inherits the detected device/browser language.

### 5. Switcher UI — `src/components/i18n/LanguageSwitcher.tsx` (new)

A reusable client component wired to `useChangeLocale` + `useI18n` (`locales`, `localeLabels`, current `locale`):
- `variant="row"` — the pill row (matches the current profile switcher look) for settings.
- `variant="menu"` — a compact globe dropdown for tight spots (auth header).

Usage:
- **Profile:** replace the inline switcher in `ProfileSectionScreen.tsx` (lines ~585–603) with `<LanguageSwitcher variant="row" />` (routing through `changeLocale`, so a logged-in switch persists immediately — no separate "save" needed).
- **Pre-login:** add `<LanguageSwitcher variant="menu" />` to the auth screens — `src/app/auth/login/page.tsx`, `src/app/auth/register/page.tsx`, and `src/app/auth/permissions/page.tsx` — placed discreetly (e.g. top-right). Logged-out, `changeLocale` just updates context/localStorage.

### 6. Translation completeness (the full audit)

**6a. Catalog gap-fill.** For each of `es`/`fr`/`de`, add the ~32 keys present in `it.ts` but missing from the override file, with correct translations. Also fix existing accent issues in already-present strings where obvious (e.g. `es` "Espanol"→"Español", "Ingles"→"Inglés"; `it`/`fr` locale labels).

**6b. Compile-time completeness enforcement.** Change the override exports from `Partial<Messages>` to full `Messages` in `en.ts`/`es.ts`/`fr.ts`/`de.ts`. After 6a fills the gaps, this typechecks; thereafter **any key added to `it.ts` forces all 5 files to define it or `npm run build` fails**. Simplify `messagesByLocale` (`src/i18n/messages/index.ts`) accordingly (locales map directly to their full message objects; `getMessage`'s DEFAULT_LOCALE fallback stays as a runtime safety net). Add `src/i18n/messages/completeness.test.ts` (Vitest) asserting `Object.keys` parity across all 5 locales — explicit guard that also catches a `Partial` reversion.

**6c. App-wide hardcoded-string sweep, area by area.** For each area: locate user-visible literal strings not wrapped in `t()`, add keys to `it.ts` (source of truth) under a sensible namespace, add the same keys with translations to en/es/fr/de, and replace the literals with `t('key')` (using the area's `useI18n`). Areas:
- auth & onboarding (login, register incl. the provider opt-in field, permissions, forgot-password)
- home + section content (VFit / VFun / VLife)
- booking list, `/book` detail, map
- provider dashboard (dashboard, bookings, clients, earnings, services, availability, schedule) + the pending banner
- profile + settings + `BecomeProviderCard` + provider status copy
- admin (all admin pages + `ProviderApplicationsPanel` + verification UI) — note: admin UI currently uses English copy; migrate to keys with `en` as the natural base and translate the rest
- shared components (navigation, side drawer, modals, empty states, error/toast messages, buttons)

Each area's task is bounded and independently reviewable; the compile-time check (6b) guarantees no area leaves a locale behind.

## Components / files

New: `src/lib/i18n/detectLocale.ts`, `src/hooks/useChangeLocale.ts`, `src/components/i18n/LanguageSwitcher.tsx`, `src/i18n/messages/completeness.test.ts`, `src/lib/i18n/detectLocale.test.ts`.
Modified: `src/contexts/I18nContext.tsx`, `src/types/locale.ts` (accent fixes only if needed), `src/i18n/messages/{en,es,fr,de}.ts` (gap-fill + type→`Messages` + audit keys), `src/i18n/messages/it.ts` (audit keys), `src/i18n/messages/index.ts`, `src/lib/firebase/auth.ts` (`completeRegistration`), `src/stores/authStore.ts` (`registerWithEmail`), `src/app/auth/register/page.tsx`, `src/app/auth/login/page.tsx`, `src/app/auth/permissions/page.tsx`, `src/components/screens/ProfileSectionScreen.tsx`, plus each area's files during 6c.

## Error handling

| Case | Behavior |
|---|---|
| `Device.getLanguageCode()` throws / unavailable | `detectDeviceLocale()` returns null → fall back to browser/stored/default. |
| Device/browser language unsupported (e.g. `pt`) | `DEFAULT_LOCALE` (`it`). |
| Stored locale invalid | Ignored; re-detect. |
| Firestore persist fails on switch | Local switch still applies; error logged; not surfaced as a blocking error. |
| Async device detection resolves after user already switched | Guarded: device effect only runs when there was no stored choice at mount; never overrides an explicit choice. |

## Testing

- **Unit (`detectLocale.test.ts`):** `localeFromTag` ("en-US"→en, "de"→de, "pt"→null, ""→null); `detectBrowserLocale` (mock `navigator.languages`); `detectDeviceLocale` (mock `@capacitor/device` + `isNativePlatform` → returns mapped locale / null on web / null on throw).
- **Unit (`useChangeLocale`):** logged-in → calls `updateDoc` with `preferredLanguage` + refresh; logged-out → no Firestore write; Firestore throw → still sets locale, no rethrow. (Mock authStore + firestore.)
- **Completeness (`completeness.test.ts`):** every `MessageKey` from `it.ts` exists in en/es/fr/de (and no extra keys). Compile-time `Messages` typing is the primary guard; this is the explicit backstop.
- **Manual e2e:** (1) switch language on the login screen → UI updates immediately; (2) register on a browser set to German → new account's `preferredLanguage === 'de'`; (3) logged-in switch → reload → language persists (from account); (4) spot-check each translated area renders non-Italian strings in en/es/fr/de.

## Implementation phases (for writing-plans)

**Plan A — working multilanguage (plumbing + catalog):**
1. `detectLocale.ts` + tests.
2. `I18nContext` async device refinement.
3. `useChangeLocale` + tests.
4. New-user default = detected locale (`completeRegistration`, `registerWithEmail`, register flows).
5. `LanguageSwitcher` component; rewire profile switcher; add to auth/onboarding screens.
6a. Catalog gap-fill (es/fr/de missing keys) + accent fixes.
6b. Type override files to full `Messages`; simplify `index.ts`; completeness test.

**Plan B — app-wide hardcoded-string audit:** one task per area from §6c, each adding+translating keys across all 5 locales and replacing literals with `t()`, gated by the compile-time completeness check.

Plan A delivers a fully working, fully-typed 5-language experience (switch, detection, sync, and the entire existing catalog translated). Plan B extends coverage to every remaining hardcoded string.

## Risks

| Risk | Mitigation |
|---|---|
| Flipping override files to `Messages` surfaces many "missing key" type errors at once | Do 6a (gap-fill) before 6b (type flip), in the same plan; the flip then compiles. |
| Async device detection causes a flash from default→device locale on native first run | Detection effect runs pre-paint-ish and only when no stored choice; acceptable one-time settle. Stored choice (returning users) never flashes. |
| `changeLocale` ↔ `(main)/layout` preferredLanguage effect feedback loop | `changeLocale` writes the same value the layout effect reads; applying it again is idempotent. |
| Audit scope is large (80+ files) | Decomposed into per-area tasks; compile-time completeness prevents partial-locale regressions; Plan A is independently shippable. |
| Some "strings" are not labels (codes, keys, class names) | Audit targets user-visible JSX text / aria-labels / placeholders only; reviewer verifies no over-translation. |

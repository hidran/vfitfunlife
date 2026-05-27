# Multilanguage Plan B — App-Wide Hardcoded-String Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Each task is one app area; apply the shared **Audit Recipe** below.

**Goal:** Migrate every remaining user-visible hardcoded string across the app into the i18n catalog and translate it into all 5 locales (it/en/es/fr/de), so the whole UI honors the language switch — area by area, gated by the compile-time completeness check from Plan A.

**Architecture:** Plan A made the override message files fully typed (`Messages`), so adding a key to `it.ts` forces all of en/es/fr/de to define it or `npm run build` fails. Each area task discovers its hardcoded strings, adds keys to `it.ts` (source of truth) under a namespace, adds the same keys with correct translations to en/es/fr/de, and replaces the literals with `t()`.

**Tech Stack:** Next.js/React, TypeScript, the existing `useI18n()` (`@/hooks/useI18n`) → `t(key, values?)`, `src/i18n/messages/*.ts`.

**Spec:** `docs/superpowers/specs/2026-05-27-multilanguage-design.md` §6c.

---

## The Audit Recipe (apply to every area task)

For the area's files:

1. **Find user-visible literal strings NOT already wrapped in `t()`.** These are translatable:
   - JSX text nodes (`<p>Prenota ora</p>`), button/link labels, headings, captions.
   - `placeholder`, `aria-label`, `title`, `alt` (when human-readable), and toast/error/empty-state messages.
   - String literals passed to UI as visible text.
   **NOT translatable (leave as-is):** `className`/style strings, route paths/hrefs, keys/ids, enum values, console.* messages, test ids, icon names, query params, dates/number formats, brand/proper nouns used as labels (VFit, VFun, VLife, Stripe, Google, Apple, CrossFit, "Personal Training" category names already in the catalog), and anything already coming from `t()` or from dynamic data (provider names, service names from Firestore).
2. **Add a key per string to `src/i18n/messages/it.ts`** (the Italian source of truth) using a namespaced key that matches the area (e.g. `booking.search.placeholder`, `provider.dashboard.title`, `admin.users.empty`). Reuse an existing key if one already covers the exact string. Keep `{{placeholder}}` interpolation for dynamic values (e.g. `t('x.greeting', { name })`).
3. **Add the same keys with correct translations to `en.ts`, `es.ts`, `fr.ts`, `de.ts`** — proper English, Spanish (accents), French (accents), German (umlauts/ß). For admin-area strings the natural base is English; translate the others. Preserve placeholders exactly.
4. **Replace the literal in the component with `t('key')`** (or `t('key', { ...values })`). Add `const { t } = useI18n();` (`import { useI18n } from '@/hooks/useI18n';`) to any component that doesn't have it. For non-component modules that need strings, pass `t` in or move the string to where a component can translate it.
5. **`npm run build`** — must succeed. The full-`Messages` typing means a key missing in any locale fails here. Fix by adding the missing translation.
6. **`npx vitest run src/i18n/messages/completeness.test.ts`** — must stay green (all locales same key set).
7. **Render-check** the area (dev server or reason through the JSX) to confirm no key shows as a raw `some.key` string and layout isn't broken.
8. **Commit** with `git add <only this area's files + the 5 message files>` and a message like `i18n(<area>): migrate hardcoded strings to catalog`.

**Reviewer focus for each task:** (a) completeness — were the area's visible strings actually migrated (spot-check the files for remaining literals)? (b) no over-translation — className/route/enum/brand strings left alone? (c) translation correctness incl. diacritics; (d) build + completeness test green; (e) no behavior/layout change.

---

### Task 1: Booking + detail + map

**Files:** `src/app/(main)/booking/page.tsx`, `src/app/book/BookingClient.tsx`, `src/app/book/page.tsx`, `src/components/map/*.tsx` (GoogleMap, RadiusFilter, any map UI), plus the 5 message files.
Notes: the category `name`s (Personal Training, Yoga, Massaggio…) come from `SERVICE_CATEGORIES` and are intentionally kept as canonical specialty labels — do NOT translate those (they're matched against Firestore data). Translate surrounding UI: search placeholder, "Vicino a me", sort labels, tab names (Servizi/Recensioni/Chi sono), buttons (Messaggio, Verifica disponibilità, Guarda il canale live), "Da {{price}} €" framing, empty/loading states.
Apply the Audit Recipe. Commit: `i18n(booking): migrate hardcoded strings to catalog`.

---

### Task 2: Home + sections (VFit/VFun/VLife)

**Files:** `src/app/(main)/home/page.tsx` and the section components it renders (the VFit/VFun/VLife home content, section switcher, quick actions, "Palestre & Sedi", "Corsi attivi", "Trova il tuo coach online", "Mappa VFit", etc.). Plus the 5 message files.
Apply the Audit Recipe. Commit: `i18n(home): migrate hardcoded strings to catalog`.

---

### Task 3: Provider dashboard

**Files:** `src/app/(main)/provider/layout.tsx` (the pending banner string), and `src/app/(main)/provider/{dashboard,bookings,clients,earnings,services,availability,schedule}/page.tsx`, plus `src/components/provider/*.tsx` (StatCard labels, etc.). Plus the 5 message files.
Notes: the pending-banner Italian string ("Profilo in revisione — sarai visibile dopo l'approvazione.") added in the provider feature should become a key. Stat labels, nav labels (already partly via `provider.layout.nav.*`), table headers, empty states, buttons.
Apply the Audit Recipe. Commit: `i18n(provider): migrate hardcoded strings to catalog`.

---

### Task 4: Profile remainder + provider opt-in cards

**Files:** `src/components/profile/BecomeProviderCard.tsx`, `src/components/auth/ProviderOptInField.tsx`, the provider opt-in strings in `src/app/auth/register/page.tsx`, and any remaining hardcoded strings in `src/app/(main)/profile/*` and `src/components/profile/*`. Plus the 5 message files.
Notes: these were intentionally left hardcoded-Italian during the provider feature. Migrate: "Voglio anche offrire servizi come professionista", "Che tipo di servizio offri?", "Diventa un professionista", "Richiesta in revisione", "Sei un professionista", "Richiesta non approvata…", "Inizia", "Invia richiesta", "Annulla", the validation error, etc.
Apply the Audit Recipe. Commit: `i18n(profile): migrate provider opt-in + profile strings to catalog`.

---

### Task 5: Auth & onboarding remainder

**Files:** `src/app/auth/{login,register,permissions,forgot-password}/page.tsx` and any auth components. Plus the 5 message files.
Notes: login/register already use `t()` heavily — migrate only the remaining literals (e.g. permissions screen copy, any untranslated labels). Don't double-key things already translated.
Apply the Audit Recipe. Commit: `i18n(auth): migrate remaining hardcoded strings to catalog`.

---

### Task 6: Shared components

**Files:** `src/components/**/*.tsx` not covered by Tasks 1–5 — navigation (bottom nav, side drawer, headers), modals/sheets, buttons, empty states, error/toast components, layout chrome. Plus the 5 message files.
Notes: this is the broadest area (~40+ files). Work through it systematically by subdirectory. Skip pure-presentational components with no text. Reuse existing `common.*` keys where they fit (e.g. `common.loading`, `common.search`).
Apply the Audit Recipe. Commit (may be split into sub-commits by subdirectory): `i18n(components): migrate hardcoded strings to catalog`.

---

### Task 7: Admin

**Files:** `src/app/admin/**/*.tsx` (18 files) and `src/components/admin/*.tsx` (9 files). Plus the 5 message files.
Notes: the admin UI is English-convention — use the English string as the natural source meaning, but still add the key to `it.ts` (Italian translation) and translate all 5 (admins may also use other languages). The `ProviderApplicationsPanel` strings ("Pending applications", "Verify", "Reject", "No pending applications.", "Loading…") become keys.
Apply the Audit Recipe. Commit (may be split): `i18n(admin): migrate hardcoded strings to catalog`.

---

### Task 8: Final verification

**Files:** none.
- [ ] `npx vitest run` — i18n tests green (detectLocale, useChangeLocale, completeness); pre-existing unrelated failures unchanged.
- [ ] `npm run build` — succeeds (compile-time completeness across all migrated keys).
- [ ] Grep sweep for obvious leftover Italian literals in JSX across the audited areas (e.g. `grep -rnE ">[A-ZÀ-Ý][a-zà-ÿ]+ " src/app src/components --include=*.tsx | grep -v "t('"` as a heuristic) and confirm remaining hits are non-translatable (brand/dynamic/className).
- [ ] Dev-server spot-check: switch to `de` (or `fr`) and walk the main flows (home, booking, a provider profile, profile, an admin page) confirming no raw `some.key` strings and no Italian leaking where a key should exist.
- [ ] Commit any final fixes.

---

## Notes for the implementer

- The compile-time `Messages` typing is the safety net: you literally cannot ship a key that isn't in all 5 locales — the build breaks. Lean on it.
- Don't translate dynamic/data-driven text (provider names, service names, reviews, seeded content) or the `SERVICE_CATEGORIES` specialty labels (matched against Firestore).
- Reuse existing keys before inventing new ones (search `it.ts` for the string first).
- Keep keys namespaced by area so the catalog stays navigable.
- Each area task is independent and independently shippable; order is by user-visibility (booking/home first).

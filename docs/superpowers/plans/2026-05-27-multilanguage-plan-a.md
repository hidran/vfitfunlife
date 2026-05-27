# Multilanguage Plan A — Plumbing + Catalog Completion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fully working 5-language experience — device/browser-detected default, account-synced switching, a pre-login + profile switcher — with the entire existing message catalog translated in it/en/es/fr/de and completeness enforced at compile time.

**Architecture:** Build on the existing `I18nContext`/`src/i18n/messages`. Add a detection module (browser sync + native async via `@capacitor/device`), a `useChangeLocale` hook that persists to the account, a reusable `LanguageSwitcher`, make new-user `preferredLanguage` default to the detected locale, fill the es/fr/de catalog gaps, and flip the override files from `Partial<Messages>` to full `Messages` so missing translations become build errors.

**Tech Stack:** Next.js/React, TypeScript, Capacitor (`@capacitor/device`), Firebase Firestore, Zustand (`authStore`), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-multilanguage-design.md` (this is Plan A; Plan B covers the app-wide hardcoded-string audit).

---

## File Structure

- `src/lib/i18n/detectLocale.ts` — **new.** Pure-ish detection helpers (browser sync, native async, tag→locale mapping).
- `src/hooks/useChangeLocale.ts` — **new.** Switch locale + persist to `users/{uid}.preferredLanguage` when logged in.
- `src/components/i18n/LanguageSwitcher.tsx` — **new.** Reusable switcher (row + menu variants).
- `src/contexts/I18nContext.tsx` — **modify.** Use `detectLocale`; add async device refinement effect.
- `src/lib/firebase/auth.ts` — **modify.** `completeRegistration` accepts `preferredLanguage`.
- `src/stores/authStore.ts` — **modify.** `registerWithEmail` threads `preferredLanguage`.
- `src/app/auth/register/page.tsx` — **modify.** Pass current locale at registration.
- `src/app/auth/login/page.tsx`, `src/app/auth/permissions/page.tsx` — **modify.** Add the pre-login switcher.
- `src/components/screens/ProfileSectionScreen.tsx` — **modify.** Replace inline switcher with `LanguageSwitcher`.
- `src/i18n/messages/{es,fr,de}.ts` — **modify.** Gap-fill + type to `Messages`.
- `src/i18n/messages/{en}.ts` — **modify.** Type to `Messages`.
- `src/i18n/messages/index.ts` — **modify.** Simplify locale map.
- Tests: `src/lib/i18n/detectLocale.test.ts`, `src/hooks/useChangeLocale.test.ts`, `src/i18n/messages/completeness.test.ts`.

---

### Task 1: Locale detection module

**Files:**
- Create: `src/lib/i18n/detectLocale.ts`
- Test: `src/lib/i18n/detectLocale.test.ts`

Existing facts: `src/types/locale.ts` exports `SUPPORTED_LOCALES` (`['it','en','es','fr','de']`), `isSupportedLocale(value): value is AppLocale`, `type AppLocale`. `src/lib/utils.ts` exports `isNativePlatform(): boolean`. `@capacitor/device` is installed; API: `import { Device } from '@capacitor/device'; const { value } = await Device.getLanguageCode(); // e.g. "en"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/detectLocale.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/utils', () => ({ isNativePlatform: vi.fn() }));
vi.mock('@capacitor/device', () => ({ Device: { getLanguageCode: vi.fn() } }));

import { isNativePlatform } from '@/lib/utils';
import { Device } from '@capacitor/device';
import { localeFromTag, detectBrowserLocale, detectDeviceLocale } from './detectLocale';

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.unstubAllGlobals(); });

describe('localeFromTag', () => {
  it('maps base tags to supported locales', () => {
    expect(localeFromTag('en-US')).toBe('en');
    expect(localeFromTag('de')).toBe('de');
    expect(localeFromTag('IT')).toBe('it');
    expect(localeFromTag('pt-BR')).toBeNull();
    expect(localeFromTag('')).toBeNull();
    expect(localeFromTag(null)).toBeNull();
  });
});

describe('detectBrowserLocale', () => {
  it('returns the first supported navigator language', () => {
    vi.stubGlobal('navigator', { language: 'pt-BR', languages: ['pt-BR', 'fr-FR', 'en'] });
    expect(detectBrowserLocale()).toBe('fr');
  });
  it('returns null when none supported', () => {
    vi.stubGlobal('navigator', { language: 'pt-BR', languages: ['pt-BR'] });
    expect(detectBrowserLocale()).toBeNull();
  });
});

describe('detectDeviceLocale', () => {
  it('returns null on web (not native)', async () => {
    vi.mocked(isNativePlatform).mockReturnValue(false);
    expect(await detectDeviceLocale()).toBeNull();
    expect(Device.getLanguageCode).not.toHaveBeenCalled();
  });
  it('maps the device language code on native', async () => {
    vi.mocked(isNativePlatform).mockReturnValue(true);
    vi.mocked(Device.getLanguageCode).mockResolvedValue({ value: 'de' } as never);
    expect(await detectDeviceLocale()).toBe('de');
  });
  it('returns null when the device call throws', async () => {
    vi.mocked(isNativePlatform).mockReturnValue(true);
    vi.mocked(Device.getLanguageCode).mockRejectedValue(new Error('no plugin'));
    expect(await detectDeviceLocale()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/i18n/detectLocale.test.ts`
Expected: FAIL — cannot resolve `./detectLocale`.

- [ ] **Step 3: Implement the module**

Create `src/lib/i18n/detectLocale.ts`:

```ts
import { isSupportedLocale, type AppLocale } from '@/types/locale';
import { isNativePlatform } from '@/lib/utils';

/** Map a BCP-47-ish tag ("en-US", "DE") to a supported AppLocale, or null. */
export function localeFromTag(tag: string | null | undefined): AppLocale | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split('-')[0];
  return isSupportedLocale(base) ? base : null;
}

/** Synchronous best guess from the browser. Returns null on SSR or when unsupported. */
export function detectBrowserLocale(): AppLocale | null {
  if (typeof navigator === 'undefined') return null;
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const c of candidates) {
    const loc = localeFromTag(c);
    if (loc) return loc;
  }
  return null;
}

/** Device language on native (Capacitor); null on web or on any failure. */
export async function detectDeviceLocale(): Promise<AppLocale | null> {
  if (!isNativePlatform()) return null;
  try {
    const { Device } = await import('@capacitor/device');
    const { value } = await Device.getLanguageCode();
    return localeFromTag(value);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/i18n/detectLocale.test.ts`
Expected: PASS (3 suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/detectLocale.ts src/lib/i18n/detectLocale.test.ts
git commit -m "feat(i18n): locale detection (browser sync + native device async)"
```

---

### Task 2: Wire device refinement into I18nContext

**Files:**
- Modify: `src/contexts/I18nContext.tsx`

Currently the file has an inline `getBrowserLocale()` and `resolveInitialLocale()`, a `useState(() => resolveInitialLocale())`, and an effect that writes localStorage + `document.documentElement.lang`. `STORAGE_KEY = 'vfit.locale'`.

- [ ] **Step 1: Replace inline browser detection with the shared module**

Remove the local `getBrowserLocale` function. Add an import at the top:

```ts
import { detectBrowserLocale, detectDeviceLocale } from '@/lib/i18n/detectLocale';
```

Change `resolveInitialLocale` so its browser branch uses the shared helper:

```ts
function resolveInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && isSupportedLocale(stored)) {
    return stored;
  }
  return detectBrowserLocale() ?? DEFAULT_LOCALE;
}
```

- [ ] **Step 2: Add the async native device-refinement effect**

Inside `I18nProvider`, after the existing `useState`/effects, add a mount-only effect that refines the locale on native **only when the user has no stored choice** (so it never overrides an explicit selection):

```ts
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) return; // explicit/prior choice wins
    let cancelled = false;
    detectDeviceLocale().then((deviceLocale) => {
      if (!cancelled && deviceLocale) setLocaleState(deviceLocale);
    });
    return () => {
      cancelled = true;
    };
  }, []);
```

(`setLocaleState` is the existing `useState` setter. `isSupportedLocale` and `DEFAULT_LOCALE` are already imported in this file.)

- [ ] **Step 3: Build to verify types**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/I18nContext.tsx
git commit -m "feat(i18n): refine default to device language on native"
```

---

### Task 3: useChangeLocale hook (account sync)

**Files:**
- Create: `src/hooks/useChangeLocale.ts`
- Test: `src/hooks/useChangeLocale.test.ts`

Facts: `db` from `@/lib/firebase/config`; `useAuthStore` (Zustand) state has `user: User | null` and `loadUserData(uid)`; `useI18n()` (`@/hooks/useI18n`) returns `{ setLocale, ... }`. The `users` Firestore update rule already allows `preferredLanguage` + `updatedAt`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useChangeLocale.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const setLocale = vi.fn();
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ setLocale }) }));

const loadUserData = vi.fn().mockResolvedValue(null);
let mockUser: { uid: string } | null = null;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: mockUser, loadUserData }) },
}));

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 'TS'),
}));

import { updateDoc } from 'firebase/firestore';
import { useChangeLocale } from './useChangeLocale';

beforeEach(() => { vi.clearAllMocks(); mockUser = null; });

it('logged-out: sets locale, does not persist', async () => {
  const { result } = renderHook(() => useChangeLocale());
  await result.current('fr');
  expect(setLocale).toHaveBeenCalledWith('fr');
  expect(updateDoc).not.toHaveBeenCalled();
});

it('logged-in: sets locale and persists preferredLanguage', async () => {
  mockUser = { uid: 'u1' };
  const { result } = renderHook(() => useChangeLocale());
  await result.current('de');
  expect(setLocale).toHaveBeenCalledWith('de');
  expect(updateDoc).toHaveBeenCalledWith({ col: 'users', id: 'u1' }, expect.objectContaining({ preferredLanguage: 'de' }));
  expect(loadUserData).toHaveBeenCalledWith('u1');
});

it('persist failure does not throw and still sets locale', async () => {
  mockUser = { uid: 'u1' };
  vi.mocked(updateDoc).mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useChangeLocale());
  await expect(result.current('es')).resolves.toBeUndefined();
  expect(setLocale).toHaveBeenCalledWith('es');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useChangeLocale.test.ts`
Expected: FAIL — cannot resolve `./useChangeLocale`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useChangeLocale.ts`:

```ts
import { useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import type { AppLocale } from '@/types/locale';

/**
 * Switch the active locale. Updates the i18n context + localStorage, and — when a
 * user is logged in — persists preferredLanguage to their Firestore doc so the
 * choice follows them across devices. A persist failure is logged, not thrown.
 */
export function useChangeLocale() {
  const { setLocale } = useI18n();
  return useCallback(
    async (locale: AppLocale) => {
      setLocale(locale);
      const { user, loadUserData } = useAuthStore.getState();
      if (!user?.uid) return;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          preferredLanguage: locale,
          updatedAt: serverTimestamp(),
        });
        await loadUserData(user.uid);
      } catch (e) {
        console.error('[useChangeLocale] failed to persist preferredLanguage', e);
      }
    },
    [setLocale]
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useChangeLocale.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useChangeLocale.ts src/hooks/useChangeLocale.test.ts
git commit -m "feat(i18n): useChangeLocale persists choice to account"
```

---

### Task 4: New-user default = detected locale

**Files:**
- Modify: `src/lib/firebase/auth.ts` (`completeRegistration`, ~line 258-296)
- Modify: `src/stores/authStore.ts` (`registerWithEmail`, ~line 514-525, and the `AuthState` interface signature ~line 41)
- Modify: `src/app/auth/register/page.tsx` (both submit handlers)

- [ ] **Step 1: `completeRegistration` accepts `preferredLanguage`**

In `src/lib/firebase/auth.ts`, ensure `AppLocale` and `DEFAULT_LOCALE` are imported (add `import { DEFAULT_LOCALE, type AppLocale } from '@/types/locale';` if not present). Change the `completeRegistration` options type and the create write:

```ts
export async function completeRegistration(
  userId: string,
  data: {
    fullName: string;
    email?: string;
    dateOfBirth?: Date;
    preferredSection?: "fit" | "fun" | "life";
    preferredLanguage?: AppLocale;
  }
): Promise<void> {
```

In the `setDoc(...)` new-user branch, replace the hardcoded `preferredLanguage: "it",` line with:

```ts
      preferredLanguage: data.preferredLanguage ?? DEFAULT_LOCALE,
```

(Leave the existing-user update branch unchanged.)

- [ ] **Step 2: `registerWithEmail` threads `preferredLanguage`**

In `src/stores/authStore.ts`, update the interface signature (~line 41):

```ts
  registerWithEmail: (email: string, password: string, fullName: string, preferredLanguage?: AppLocale) => Promise<void>;
```

Ensure `AppLocale` is imported in this file (`import type { AppLocale } from '@/types/locale';` if missing). Update the action (~line 514) signature and its internal `completeRegistration` call:

```ts
  registerWithEmail: async (email: string, password: string, fullName: string, preferredLanguage?: AppLocale) => {
    set({ isLoading: true, error: null });
    try {
      const firebaseUser = await registerWithEmail(email, password);
      const { completeRegistration } = await import('@/lib/firebase/auth');
      await completeRegistration(firebaseUser.uid, {
        fullName,
        email,
        preferredSection: 'fit',
        preferredLanguage,
      });
      set({ firebaseUser, isLoading: false, isInitialized: true });
```

(Keep the rest of the action unchanged.)

- [ ] **Step 3: Register flows pass the current locale**

In `src/app/auth/register/page.tsx`, the component already calls `useI18n()` (or add `const { locale } = useI18n();` near the other hooks — confirm `useI18n` is imported; it is used widely, import from `@/hooks/useI18n` if needed).

- In `handleEmailSubmit`, change the registration call to pass the locale:
```ts
      await registerWithEmail(email.trim(), password, fullName.trim(), locale);
```
- In `handleSocialSubmit`, add `preferredLanguage: locale` to the existing `completeRegistration(firebaseUser.uid, { ... })` call.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/auth.ts src/stores/authStore.ts src/app/auth/register/page.tsx
git commit -m "feat(i18n): new accounts default to the detected language"
```

---

### Task 5: LanguageSwitcher component + profile rewire + pre-login switcher

**Files:**
- Create: `src/components/i18n/LanguageSwitcher.tsx`
- Modify: `src/components/screens/ProfileSectionScreen.tsx` (switcher block ~line 580-604)
- Modify: `src/app/auth/login/page.tsx`, `src/app/auth/register/page.tsx`, `src/app/auth/permissions/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/i18n/LanguageSwitcher.tsx`:

```tsx
'use client';

import { Globe } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useChangeLocale } from '@/hooks/useChangeLocale';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  variant?: 'row' | 'menu';
  className?: string;
}

export function LanguageSwitcher({ variant = 'row', className }: LanguageSwitcherProps) {
  const { locale, locales, localeLabels } = useI18n();
  const changeLocale = useChangeLocale();

  if (variant === 'menu') {
    return (
      <div className={cn('relative inline-flex items-center', className)}>
        <Globe className="pointer-events-none absolute left-2 h-4 w-4 text-white/60" />
        <select
          aria-label="Language"
          value={locale}
          onChange={(e) => changeLocale(e.target.value as typeof locale)}
          className="appearance-none rounded-lg border border-white/15 bg-white/5 py-2 pl-8 pr-3 text-xs font-semibold uppercase text-white"
        >
          {locales.map((l) => (
            <option key={l} value={l} className="text-black">
              {localeLabels[l]}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => changeLocale(l)}
          className={cn(
            'rounded-xl border px-3 py-2 text-xs font-semibold uppercase transition-colors',
            locale === l
              ? 'border-section-primary bg-section-primary text-background-dark'
              : 'border-white/15 bg-white/5 text-text-tertiary'
          )}
        >
          <Globe className="mr-1 inline-block h-3.5 w-3.5" />
          {localeLabels[l]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rewire the profile switcher**

In `src/components/screens/ProfileSectionScreen.tsx`, replace the inline `<div className="mt-2 flex gap-2">{locales.map(...)}</div>` switcher block (the buttons calling `setPreferredLanguage`/`setLocale`, ~lines 584-603) with:

```tsx
                <LanguageSwitcher variant="row" className="mt-2" />
```

Add the import: `import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';`. Keep the surrounding label (`profileSection.settings.language`). Remove the now-unused local `preferredLanguage` switcher wiring ONLY if it's not referenced elsewhere in the file (search for `preferredLanguage` and `setLocale` usages; the load effect at ~line 128-130 that calls `setLocale(selectedLocale)` on user load can stay or be removed since `(main)/layout` already applies it — leave it to avoid behavior change unless it causes an unused-var error). If `localeLabels`/`locales`/`setLocale` become unused after this change, remove them from the `useI18n()` destructure to avoid lint errors.

- [ ] **Step 3: Add the pre-login switcher to auth screens**

In each of `src/app/auth/login/page.tsx`, `src/app/auth/register/page.tsx`, `src/app/auth/permissions/page.tsx`: import `LanguageSwitcher` and render `<LanguageSwitcher variant="menu" />` in a discreet top-right position of the screen container (read each page's top-level wrapper and place it there, e.g. an absolutely-positioned element in the header area or a flex row at the top). Match each page's existing layout; keep it unobtrusive.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds, no type/lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/i18n/LanguageSwitcher.tsx src/components/screens/ProfileSectionScreen.tsx src/app/auth/login/page.tsx src/app/auth/register/page.tsx src/app/auth/permissions/page.tsx
git commit -m "feat(i18n): reusable LanguageSwitcher in profile + pre-login screens"
```

---

### Task 6: Catalog gap-fill (es/fr/de)

**Files:**
- Modify: `src/i18n/messages/es.ts`, `src/i18n/messages/fr.ts`, `src/i18n/messages/de.ts`

The override files are currently `Partial<Messages>` and each omits ~32 of the 556 keys in `it.ts`, so those keys silently fall back to Italian. Fill them.

- [ ] **Step 1: List the missing keys per locale**

Run this to print, for each locale, the keys present in `it.ts` but missing from the override:

```bash
node -e '
const path=require("path");
const ts=require("typescript");
function keys(f){const src=require("fs").readFileSync(f,"utf8");const m=[...src.matchAll(/^\s*(\x27[^\x27]+\x27)\s*:/gm)].map(x=>x[1].slice(1,-1));return new Set(m);}
const it=keys("src/i18n/messages/it.ts");
for(const loc of ["es","fr","de"]){const k=keys(`src/i18n/messages/${loc}.ts`);const missing=[...it].filter(x=>!k.has(x));console.log(`\n=== ${loc}: ${missing.length} missing ===`);console.log(missing.join("\n"));}
'
```

(If `typescript` import is unused it is fine; the regex extraction is what matters.) Expected: prints ~32 keys per locale.

- [ ] **Step 2: Add translations for each missing key**

For every missing key, look up its Italian source string in `src/i18n/messages/it.ts` and add a correctly-translated entry to the corresponding override file (`es`/`fr`/`de`), preserving any `{{placeholder}}` interpolation tokens verbatim. Also correct obvious existing accent mistakes you encounter in these files (e.g. `es` `'Espanol'`→`'Español'`, `'Ingles'`→`'Inglés'`). Keep keys grouped near related existing keys.

- [ ] **Step 3: Verify no key is missing**

Re-run the Step 1 command.
Expected: `0 missing` for es, fr, and de.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts
git commit -m "i18n: complete es/fr/de catalog (fill missing keys + accent fixes)"
```

---

### Task 7: Compile-time completeness + parity test

**Files:**
- Modify: `src/i18n/messages/{en,es,fr,de}.ts` (type annotation), `src/i18n/messages/index.ts`
- Test: `src/i18n/messages/completeness.test.ts`

- [ ] **Step 1: Flip override files to full `Messages`**

In each of `en.ts`, `es.ts`, `fr.ts`, `de.ts`, change the export type from `Partial<Messages>` to `Messages`:

```ts
export const enMessages: Messages = {   // (es: esMessages, fr: frMessages, de: deMessages)
```

(After Task 6 these are complete, so this typechecks. If the build now reports missing keys, add them — that is exactly the gap this enforces.)

- [ ] **Step 2: Simplify the locale map**

In `src/i18n/messages/index.ts`, since each locale object is now complete, map locales directly (keep the `getMessage` DEFAULT_LOCALE fallback as a runtime safety net):

```ts
import { DEFAULT_LOCALE, type AppLocale } from '@/types/locale';
import { deMessages } from './de';
import { enMessages } from './en';
import { esMessages } from './es';
import { frMessages } from './fr';
import { itMessages, type MessageKey, type Messages } from './it';

export const messagesByLocale: Record<AppLocale, Messages> = {
  it: itMessages,
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  de: deMessages,
};

export type { MessageKey };

export function getMessage(locale: AppLocale, key: MessageKey): string {
  return messagesByLocale[locale][key] ?? messagesByLocale[DEFAULT_LOCALE][key] ?? key;
}
```

- [ ] **Step 3: Write the parity test**

Create `src/i18n/messages/completeness.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { itMessages } from './it';
import { enMessages } from './en';
import { esMessages } from './es';
import { frMessages } from './fr';
import { deMessages } from './de';

const itKeys = Object.keys(itMessages).sort();
const locales = { en: enMessages, es: esMessages, fr: frMessages, de: deMessages } as const;

describe('i18n catalog completeness', () => {
  for (const [name, messages] of Object.entries(locales)) {
    it(`${name} has exactly the same keys as it`, () => {
      const keys = Object.keys(messages).sort();
      expect(keys).toEqual(itKeys);
    });
  }
});
```

- [ ] **Step 4: Run the test + build**

Run: `npx vitest run src/i18n/messages/completeness.test.ts`
Expected: PASS (4 locales). Then `npm run build` — succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages/en.ts src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts src/i18n/messages/index.ts src/i18n/messages/completeness.test.ts
git commit -m "i18n: enforce catalog completeness at compile time + parity test"
```

---

### Task 8: Verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite for the new/changed i18n units**

Run: `npx vitest run src/lib/i18n/detectLocale.test.ts src/hooks/useChangeLocale.test.ts src/i18n/messages/completeness.test.ts`
Expected: all pass.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: succeeds (the `Messages` typing now guarantees every locale is complete).

- [ ] **Step 3: Manual e2e (dev server + a browser)**

Run `npm run dev`, then in a browser:
1. On `/auth/login`, use the language menu → the UI strings switch language immediately.
2. Set the browser's preferred language to German, open the app fresh (clear `localStorage` `vfit.locale`) → default UI is German; register a new account → its `users/{uid}.preferredLanguage === 'de'` (verify via console/admin).
3. Log in, switch language in profile → reload the app → the language persists (loaded from the account).
4. Switch among it/en/es/fr/de in profile and confirm catalog strings render translated (not Italian) in each.

- [ ] **Step 4: Final commit (only if verification required fixes)**

```bash
git add -A
git commit -m "test(i18n): plan A verification fixes"
```

---

## Notes for the implementer

- Do not change `DEFAULT_LOCALE` (stays `it`) — unsupported device/browser languages intentionally fall back to Italian.
- The async device effect must never override an explicit stored choice — it only runs when `localStorage['vfit.locale']` is absent/invalid at mount.
- After Task 7, adding any new key to `it.ts` will fail the build until en/es/fr/de define it — this is the mechanism Plan B (the app-wide audit) relies on to guarantee no locale is left behind.

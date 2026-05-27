# Strong Password Policy

**Date:** 2026-05-27
**Branch:** `main`
**Status:** Design approved by user; ready for implementation plan

## Problem

Registration currently accepts any password ≥ 6 characters (`src/app/auth/register/page.tsx:118` checks `password.length < 6`; the field hint says "minimum 6 characters"). There are no complexity requirements, no shared validator, and no server-side enforcement. Passwords must be **strong**: lowercase + uppercase + number + symbol, with a sensible minimum length.

## Goals

- A password is valid only if it has **≥ 12 characters AND at least one lowercase, one uppercase, one digit, and one symbol**.
- Enforced at registration (the only in-app new-password entry point today), with a **live requirements checklist** so the user sees each rule pass as they type.
- A **single shared, tested validator** is the source of truth, so any future password change/reset UI enforces the identical rules.

## Non-goals

- **Server-side enforcement.** Firebase Auth blocking functions never receive the plaintext password, so they cannot check strength; the real server-side mechanism is the Identity Platform (GCIP) password policy, which the user opted not to enable. Enforcement here is **client-side only** — a determined caller hitting the Firebase SDK directly can bypass it. (Documented limitation.)
- **Breach-list check (HIBP).** Not requested; would add an external dependency.
- Wiring password change/reset: `changePassword` has no in-app UI, and forgot-password only sends a reset email (the new password is entered on Firebase's hosted page, not our form). The shared validator is built ready for these, but there is nothing to wire today.
- Max-length caps or allowed-character restrictions (standard practice: don't restrict).

## Architecture

### Shared validator — `src/lib/auth/passwordPolicy.ts` (new, pure)

```ts
export const PASSWORD_MIN_LENGTH = 12;

export type PasswordRuleId = 'minLength' | 'lowercase' | 'uppercase' | 'number' | 'symbol';

export interface PasswordRuleResult {
  id: PasswordRuleId;
  met: boolean;
}

export interface PasswordStrength {
  valid: boolean;            // true iff every rule is met
  rules: PasswordRuleResult[];
}

export function validatePasswordStrength(password: string): PasswordStrength;
```

Rule checks:
- `minLength`: `password.length >= PASSWORD_MIN_LENGTH`
- `lowercase`: `/[a-z]/.test(password)`
- `uppercase`: `/[A-Z]/.test(password)`
- `number`: `/[0-9]/.test(password)`
- `symbol`: `/[^A-Za-z0-9]/.test(password)` (any non-alphanumeric character)

`rules` is returned in a stable order (minLength, lowercase, uppercase, number, symbol) so the UI can render them deterministically. `valid` = `rules.every(r => r.met)`. Pure (no i18n, no React) — label text lives in the UI layer.

### Requirements UI — `src/components/auth/PasswordRequirements.tsx` (new)

`'use client'` component, props `{ password: string }`. Calls `validatePasswordStrength(password)` and renders the five rules as a checklist; each row shows a check (met) or neutral/cross (unmet) icon + an i18n label via `useI18n()`. Rule → message-key map (all keys exist in all 5 locales):
- `minLength` → `auth.password.rule.minLength` (e.g. it: "Almeno 12 caratteri")
- `lowercase` → `auth.password.rule.lowercase`
- `uppercase` → `auth.password.rule.uppercase`
- `number` → `auth.password.rule.number`
- `symbol` → `auth.password.rule.symbol`

### Registration wiring — `src/app/auth/register/page.tsx`

- Import `validatePasswordStrength` + `PasswordRequirements`.
- In `handleEmailSubmit`, replace the `if (!password || password.length < 6) { setError(t('auth.register.error.passwordMinLength')); return; }` block with:
  ```ts
  if (!validatePasswordStrength(password).valid) {
    setError(t('auth.register.error.passwordWeak'));
    return;
  }
  ```
  (Keep the existing `password !== confirmPassword` mismatch check that follows.)
- Replace the static hint `<p>{t('auth.register.passwordMinHint')}</p>` (~line 402) with `<PasswordRequirements password={password} />`.
- Optionally also gate the submit button's `disabled` on `validatePasswordStrength(password).valid` (in addition to the existing terms/loading conditions) so the live checklist and the button agree. Keep this consistent with how the button is currently disabled.

### i18n

Add to all 5 locale files (`it/en/es/fr/de`): `auth.password.rule.minLength`, `.lowercase`, `.uppercase`, `.number`, `.symbol`, and `auth.register.error.passwordWeak`. The existing compile-time `Messages` completeness gate fails the build if any locale is missing a key. (The now-unused `auth.register.passwordMinHint` / `auth.register.error.passwordMinLength` keys may be left in place to avoid touching unrelated usages.)

## Error handling

| Case | Behavior |
|---|---|
| Weak password submitted | Inline error `auth.register.error.passwordWeak`; submit blocked. |
| Empty password | Fails `minLength` (and all rules) → invalid → blocked. |
| Live typing | Checklist updates each keystroke via `validatePasswordStrength`; no error shown until submit (or button stays disabled). |
| Password valid but confirm mismatch | Existing mismatch error still applies (unchanged). |

## Testing

- **Unit (`src/lib/auth/passwordPolicy.test.ts`):**
  - A fully-valid 12+ char password with all classes → `valid: true`, all rules met.
  - `'Short1!aA'` (< 12) → `minLength` false, `valid` false.
  - `'alllowercase123!aaaa'` → `uppercase` false.
  - `'ALLUPPERCASE123!AAAA'` → `lowercase` false.
  - `'NoNumbersHere!!aaAA'` → `number` false.
  - `'NoSymbns12aaAAbbCC'` → `symbol` false.
  - Exactly 12 valid chars → `minLength` true (boundary).
  - `rules` array order is stable (minLength, lowercase, uppercase, number, symbol).
- **Manual:** registration shows the live checklist; a weak password is rejected with the error and (if gated) a disabled button; a strong password (e.g. `Str0ng!Passw0rd`) is accepted and creates the account.

## Implementation ordering (for writing-plans)

1. `passwordPolicy.ts` + unit tests (TDD).
2. i18n keys for the 5 rule labels + the weak error (all 5 locales).
3. `PasswordRequirements` component.
4. Register form: swap the validation check + replace the hint with the checklist (+ optional submit-disable gate).
5. Verify: unit tests, build, completeness test, manual registration check.

## Risks

| Risk | Mitigation |
|---|---|
| Client-side only ⇒ bypassable via direct SDK calls | Documented; the user declined the GCIP server policy. The shared validator is the in-app enforcement + UX. |
| New i18n keys missing in a locale ⇒ build fails | Add all 6 keys to all 5 locales in the same step (the completeness gate enforces it). |
| Forced composition can frustrate users / isn't pure NIST guidance | Explicitly requested (4 classes + length); show a live checklist so requirements are transparent; no max-length or char restrictions. |

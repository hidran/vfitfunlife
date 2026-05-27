# Strong Password Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require strong passwords at registration — min 12 chars + lowercase + uppercase + number + symbol — via a shared validator and a live requirements checklist.

**Architecture:** A pure `validatePasswordStrength` module is the single source of truth. The register form validates against it (replacing the min-6 check) and shows a live `PasswordRequirements` checklist. Client-side only (per design).

**Tech Stack:** TypeScript, React/Next.js, `useI18n`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-strong-password-design.md`

---

## File Structure

- `src/lib/auth/passwordPolicy.ts` — **new.** Pure validator (`PASSWORD_MIN_LENGTH`, `validatePasswordStrength`).
- `src/lib/auth/passwordPolicy.test.ts` — **new.** Unit tests.
- `src/components/auth/PasswordRequirements.tsx` — **new.** Live checklist UI.
- `src/app/auth/register/page.tsx` — **modify.** Swap validation; render checklist; bump `minLength`.
- `src/i18n/messages/{it,en,es,fr,de}.ts` — **modify.** 6 new keys each.

---

### Task 1: Password validator + tests

**Files:**
- Create: `src/lib/auth/passwordPolicy.ts`
- Test: `src/lib/auth/passwordPolicy.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/auth/passwordPolicy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validatePasswordStrength, PASSWORD_MIN_LENGTH } from './passwordPolicy';

describe('validatePasswordStrength', () => {
  it('accepts a 12+ char password with all classes', () => {
    const r = validatePasswordStrength('Str0ng!Passw0rd');
    expect(r.valid).toBe(true);
    expect(r.rules.every((x) => x.met)).toBe(true);
  });
  it('rejects < 12 chars', () => {
    const r = validatePasswordStrength('Short1!aA');
    expect(r.valid).toBe(false);
    expect(r.rules.find((x) => x.id === 'minLength')?.met).toBe(false);
  });
  it('requires a lowercase letter', () => {
    expect(validatePasswordStrength('ALLUPPER123!ABCDE').rules.find((x) => x.id === 'lowercase')?.met).toBe(false);
  });
  it('requires an uppercase letter', () => {
    expect(validatePasswordStrength('alllower123!abcde').rules.find((x) => x.id === 'uppercase')?.met).toBe(false);
  });
  it('requires a number', () => {
    expect(validatePasswordStrength('NoNumbersHere!!aaAA').rules.find((x) => x.id === 'number')?.met).toBe(false);
  });
  it('requires a symbol', () => {
    expect(validatePasswordStrength('NoSymbols12aaAAbbCC').rules.find((x) => x.id === 'symbol')?.met).toBe(false);
  });
  it('treats exactly 12 valid chars as long enough', () => {
    expect(validatePasswordStrength('Abcdef1!ghiJ').rules.find((x) => x.id === 'minLength')?.met).toBe(true);
  });
  it('returns rules in a stable order', () => {
    expect(validatePasswordStrength('x').rules.map((x) => x.id)).toEqual(['minLength', 'lowercase', 'uppercase', 'number', 'symbol']);
  });
  it('exposes the min length constant', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — `npx vitest run src/lib/auth/passwordPolicy.test.ts` (module not found).

- [ ] **Step 3: Implement** — `src/lib/auth/passwordPolicy.ts`:

```ts
export const PASSWORD_MIN_LENGTH = 12;

export type PasswordRuleId = 'minLength' | 'lowercase' | 'uppercase' | 'number' | 'symbol';

export interface PasswordRuleResult {
  id: PasswordRuleId;
  met: boolean;
}

export interface PasswordStrength {
  valid: boolean;
  rules: PasswordRuleResult[];
}

/** Validate a password against the strong-password policy: min length + 4 character classes. Pure; no i18n. */
export function validatePasswordStrength(password: string): PasswordStrength {
  const rules: PasswordRuleResult[] = [
    { id: 'minLength', met: password.length >= PASSWORD_MIN_LENGTH },
    { id: 'lowercase', met: /[a-z]/.test(password) },
    { id: 'uppercase', met: /[A-Z]/.test(password) },
    { id: 'number', met: /[0-9]/.test(password) },
    { id: 'symbol', met: /[^A-Za-z0-9]/.test(password) },
  ];
  return { valid: rules.every((r) => r.met), rules };
}
```

- [ ] **Step 4: Run, confirm PASS** — `npx vitest run src/lib/auth/passwordPolicy.test.ts` (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/passwordPolicy.ts src/lib/auth/passwordPolicy.test.ts
git commit -m "feat(auth): strong-password validator (min 12 + 4 classes)"
```

---

### Task 2: i18n keys

**Files:**
- Modify: `src/i18n/messages/it.ts`, `en.ts`, `es.ts`, `fr.ts`, `de.ts`

- [ ] **Step 1: Add 6 keys to each locale** (the compile-time `Messages` completeness gate requires all 5 to match). Add under an `auth.password.rule.*` group + the error key. Values:

`it.ts`:
```ts
  'auth.password.rule.minLength': 'Almeno 12 caratteri',
  'auth.password.rule.lowercase': 'Una lettera minuscola',
  'auth.password.rule.uppercase': 'Una lettera maiuscola',
  'auth.password.rule.number': 'Un numero',
  'auth.password.rule.symbol': 'Un simbolo',
  'auth.register.error.passwordWeak': 'La password non soddisfa i requisiti di sicurezza.',
```
`en.ts`:
```ts
  'auth.password.rule.minLength': 'At least 12 characters',
  'auth.password.rule.lowercase': 'A lowercase letter',
  'auth.password.rule.uppercase': 'An uppercase letter',
  'auth.password.rule.number': 'A number',
  'auth.password.rule.symbol': 'A symbol',
  'auth.register.error.passwordWeak': "Password doesn't meet the security requirements.",
```
`es.ts`:
```ts
  'auth.password.rule.minLength': 'Al menos 12 caracteres',
  'auth.password.rule.lowercase': 'Una letra minúscula',
  'auth.password.rule.uppercase': 'Una letra mayúscula',
  'auth.password.rule.number': 'Un número',
  'auth.password.rule.symbol': 'Un símbolo',
  'auth.register.error.passwordWeak': 'La contraseña no cumple los requisitos de seguridad.',
```
`fr.ts`:
```ts
  'auth.password.rule.minLength': 'Au moins 12 caractères',
  'auth.password.rule.lowercase': 'Une lettre minuscule',
  'auth.password.rule.uppercase': 'Une lettre majuscule',
  'auth.password.rule.number': 'Un chiffre',
  'auth.password.rule.symbol': 'Un symbole',
  'auth.register.error.passwordWeak': 'Le mot de passe ne respecte pas les exigences de sécurité.',
```
`de.ts`:
```ts
  'auth.password.rule.minLength': 'Mindestens 12 Zeichen',
  'auth.password.rule.lowercase': 'Ein Kleinbuchstabe',
  'auth.password.rule.uppercase': 'Ein Großbuchstabe',
  'auth.password.rule.number': 'Eine Zahl',
  'auth.password.rule.symbol': 'Ein Sonderzeichen',
  'auth.register.error.passwordWeak': 'Das Passwort erfüllt die Sicherheitsanforderungen nicht.',
```

- [ ] **Step 2: Verify completeness + build** — `npx vitest run src/i18n/messages/completeness.test.ts` (4/4) and `npm run build` (succeeds).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/messages/it.ts src/i18n/messages/en.ts src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts
git commit -m "i18n(auth): password requirement labels + weak-password error"
```

---

### Task 3: PasswordRequirements component

**Files:**
- Create: `src/components/auth/PasswordRequirements.tsx`

- [ ] **Step 1: Implement** — `src/components/auth/PasswordRequirements.tsx`:

```tsx
'use client';

import { Check, X } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { validatePasswordStrength, type PasswordRuleId } from '@/lib/auth/passwordPolicy';
import type { MessageKey } from '@/i18n/messages';
import { cn } from '@/lib/utils';

const RULE_LABEL_KEYS: Record<PasswordRuleId, MessageKey> = {
  minLength: 'auth.password.rule.minLength',
  lowercase: 'auth.password.rule.lowercase',
  uppercase: 'auth.password.rule.uppercase',
  number: 'auth.password.rule.number',
  symbol: 'auth.password.rule.symbol',
};

export function PasswordRequirements({ password }: { password: string }) {
  const { t } = useI18n();
  const { rules } = validatePasswordStrength(password);

  return (
    <ul className="mt-2 space-y-1">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className={cn(
            'flex items-center gap-2 text-xs',
            rule.met ? 'text-success-DEFAULT' : 'text-text-tertiary'
          )}
        >
          {rule.met ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 opacity-60" />}
          {t(RULE_LABEL_KEYS[rule.id])}
        </li>
      ))}
    </ul>
  );
}
```
(If `text-success-DEFAULT` is not a valid theme class in this project, use the success color other components use — check an existing success usage; otherwise `text-green-400`.)

- [ ] **Step 2: Build** — `npm run build` (succeeds; the `MessageKey` typing confirms all rule keys exist).

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/PasswordRequirements.tsx
git commit -m "feat(auth): live password requirements checklist component"
```

---

### Task 4: Register form wiring

**Files:**
- Modify: `src/app/auth/register/page.tsx` (validation block ~118-121, password field `minLength={6}` ~391, hint ~402)

- [ ] **Step 1: Imports** — add near the top:
```ts
import { validatePasswordStrength } from '@/lib/auth/passwordPolicy';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
```

- [ ] **Step 2: Swap the validation check** — in `handleEmailSubmit`, replace:
```ts
    if (!password || password.length < 6) {
      setError(t('auth.register.error.passwordMinLength'));
      return;
    }
```
with:
```ts
    if (!validatePasswordStrength(password).valid) {
      setError(t('auth.register.error.passwordWeak'));
      return;
    }
```

- [ ] **Step 3: Replace the hint with the live checklist** — replace the line:
```tsx
              <p className="text-xs text-text-tertiary">{t('auth.register.passwordMinHint')}</p>
```
with:
```tsx
              <PasswordRequirements password={password} />
```

- [ ] **Step 4: Bump the input minLength** — change the password `<Input ... minLength={6} ... />` to `minLength={12}`.

- [ ] **Step 5: Build** — `npm run build` (succeeds, no unused-var errors; if `auth.register.passwordMinHint`/`passwordMinLength` keys are now unused that's fine — leave the keys in the catalog).

- [ ] **Step 6: Commit**

```bash
git add src/app/auth/register/page.tsx
git commit -m "feat(auth): enforce strong password + live checklist at registration"
```

---

### Task 5: Verification

**Files:** none.

- [ ] **Step 1: Unit + completeness** — `npx vitest run src/lib/auth/passwordPolicy.test.ts src/i18n/messages/completeness.test.ts` (all pass).
- [ ] **Step 2: Build** — `npm run build` (succeeds).
- [ ] **Step 3: Manual** — `npm run dev`, open `/auth/register` → email path:
  1. Type a weak password (e.g. `abc`) → checklist shows unmet rules; submitting shows the weak-password error.
  2. Type `Str0ng!Passw0rd` → all 5 rules show as met; registration proceeds (with a unique test email).
- [ ] **Step 4: Final commit (if fixes needed)** — `git add -A && git commit -m "test(auth): strong-password verification fixes"`

---

## Notes for the implementer
- Enforcement is client-side only by design (the GCIP server policy was declined). Don't add a blocking function (it can't see the password).
- Don't restrict allowed characters or add a max length.
- The shared `validatePasswordStrength` is the single source of truth — if a password change/reset UI is added later, it should reuse it.

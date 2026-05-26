# Provider Self-Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user opt in as a provider (at signup or from profile), landing in a `pending` state — hidden from search — until an admin verifies them, without changing the single-`role` model.

**Architecture:** Layer a `providerStatus` field on `users/{uid}` (role stays `customer`) and create the public profile in `instructors/{uid}` with `applicationStatus` + `providerProfile.isVerified:false`. Search already filters `isVerified === true`, so pending providers are auto-hidden. Opt-in and admin verify/reject write both docs in one `writeBatch`. Admin sees pending applications via a new `instructors where applicationStatus == 'pending'` query (separate from the legacy `users`-based verification queue).

**Tech Stack:** Next.js (static export) + React, TypeScript, Firebase Firestore, Zustand (`authStore`), TanStack Query, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-27-provider-self-registration-design.md`

---

## File Structure

- `src/lib/serviceCategories.ts` — **new.** Shared service-category constant (was inline in booking page). Used by booking page, register form, profile card.
- `src/types/firebase.ts` — **modify.** Add `ProviderStatus` type + `providerStatus?` on `User`.
- `src/types/instructor.ts` — **modify.** Add `applicationStatus?` on `Provider`.
- `src/lib/firebase/providers.ts` — **modify.** Map `applicationStatus` in `flattenProvider`; add `fetchProviderApplications()`.
- `src/lib/firebase/providerApplication.ts` — **new.** `submitProviderApplication`, `setProviderApplicationStatus` (batched writes).
- `src/lib/providerStatus.ts` — **new.** Pure helpers `providerCardState`, `canAccessProviderArea`.
- `src/hooks/useProviderApplication.ts` — **new.** `useProviderStatus`, `useSubmitProviderApplication`.
- `firestore.rules` — **modify.** Whitelist `providerStatus`; constrain self-set; split instructors create/update.
- `src/app/auth/register/page.tsx` — **modify.** Opt-in toggle + category picker + opt-in call.
- `src/components/profile/BecomeProviderCard.tsx` — **new.** Status-driven profile card.
- `src/app/(main)/profile/page.tsx` — **modify.** Render the card.
- `src/app/(main)/provider/layout.tsx` — **modify.** Access guard + pending banner.
- `src/components/admin/ProviderApplicationsPanel.tsx` — **new.** Pending applications list + verify/reject.
- `src/app/admin/providers/page.tsx` — **modify.** Mount the panel.

Tests: `src/lib/firebase/providerApplication.test.ts`, `src/lib/providerStatus.test.ts`, plus an added case in `src/lib/firebase/providers.test.ts`.

---

### Task 1: Shared service categories + type fields

**Files:**
- Create: `src/lib/serviceCategories.ts`
- Modify: `src/app/(main)/booking/page.tsx:31-38`
- Modify: `src/types/firebase.ts` (after `export type UserRole = ...` line 8, and the `User` interface ~line 121)
- Modify: `src/types/instructor.ts:4-22`
- Modify: `src/lib/firebase/providers.ts:26-46`

- [ ] **Step 1: Create the shared categories constant**

Create `src/lib/serviceCategories.ts`:

```ts
export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
}

// Single source of truth for service categories shown in booking search,
// the registration provider opt-in, and the profile "become a provider" card.
// `name` is the Italian label stored on instructors.providerProfile.specialties
// (booking search matches specialties by this name).
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: 'personal_training', name: 'Personal Training', icon: '💪' },
  { id: 'yoga', name: 'Yoga', icon: '🧘' },
  { id: 'pilates', name: 'Pilates', icon: '🤸' },
  { id: 'massage', name: 'Massaggio', icon: '💆' },
  { id: 'nutrition', name: 'Nutrizione', icon: '🥗' },
  { id: 'physio', name: 'Fisioterapia', icon: '🏥' },
];
```

- [ ] **Step 2: Point the booking page at the shared constant**

In `src/app/(main)/booking/page.tsx`, delete the local `const CATEGORIES = [...]` block (lines 31-38) and import the shared one. Add near the other imports:

```ts
import { SERVICE_CATEGORIES } from '@/lib/serviceCategories';
```

Then replace remaining references to `CATEGORIES` in that file with `SERVICE_CATEGORIES`. (Search the file for `CATEGORIES` and update each usage.)

- [ ] **Step 3: Add `ProviderStatus` + `providerStatus` to the User type**

In `src/types/firebase.ts`, just after line 8 (`export type UserRole = ...`):

```ts
// Provider application status (layered on top of role; role stays "customer")
export type ProviderStatus = "none" | "pending" | "verified" | "rejected";
```

Inside `interface User`, right after the `role: UserRole;` field (line 121), add:

```ts
  // Provider application status (absent ⇒ "none")
  providerStatus?: ProviderStatus;
```

- [ ] **Step 4: Add `applicationStatus` to the Provider type**

In `src/types/instructor.ts`, inside `interface Provider` (after `isVerified: boolean;`, line 10), add:

```ts
  applicationStatus?: 'pending' | 'verified' | 'rejected';
```

- [ ] **Step 5: Map `applicationStatus` in `flattenProvider`**

In `src/lib/firebase/providers.ts`, inside the object returned by `flattenProvider` (after the `isVerified:` line, line 34), add:

```ts
    applicationStatus: (data.applicationStatus as 'pending' | 'verified' | 'rejected') ?? undefined,
```

- [ ] **Step 6: Typecheck + build**

Run: `npm run build`
Expected: build succeeds (static export). No type errors from the booking page or types.

- [ ] **Step 7: Commit**

```bash
git add src/lib/serviceCategories.ts "src/app/(main)/booking/page.tsx" src/types/firebase.ts src/types/instructor.ts src/lib/firebase/providers.ts
git commit -m "feat(provider): shared service categories + providerStatus/applicationStatus types"
```

---

### Task 2: Provider application data layer (`providerApplication.ts`)

**Files:**
- Create: `src/lib/firebase/providerApplication.ts`
- Test: `src/lib/firebase/providerApplication.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/firebase/providerApplication.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(() => 'TS'),
}));

import { writeBatch } from 'firebase/firestore';
import { submitProviderApplication, setProviderApplicationStatus } from './providerApplication';

function makeBatch() {
  return { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => vi.clearAllMocks());

describe('submitProviderApplication', () => {
  it('creates a pending unverified instructor doc and sets user providerStatus=pending', async () => {
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    await submitProviderApplication('u1', { fullName: 'Mia Rossi', categoryName: 'Yoga' });

    expect(batch.set).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      expect.objectContaining({
        uid: 'u1',
        applicationStatus: 'pending',
        providerProfile: expect.objectContaining({ isVerified: false, specialties: ['Yoga'] }),
      }),
      { merge: true }
    );
    expect(batch.update).toHaveBeenCalledWith(
      { col: 'users', id: 'u1' },
      expect.objectContaining({ providerStatus: 'pending' })
    );
    expect(batch.commit).toHaveBeenCalled();
  });
});

describe('setProviderApplicationStatus', () => {
  it('verifying sets isVerified true + both statuses verified', async () => {
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    await setProviderApplicationStatus('u1', 'verified');

    expect(batch.update).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      expect.objectContaining({ applicationStatus: 'verified', 'providerProfile.isVerified': true })
    );
    expect(batch.update).toHaveBeenCalledWith(
      { col: 'users', id: 'u1' },
      expect.objectContaining({ providerStatus: 'verified' })
    );
  });

  it('rejecting sets rejected and leaves isVerified false', async () => {
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    await setProviderApplicationStatus('u1', 'rejected');

    expect(batch.update).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      expect.objectContaining({ applicationStatus: 'rejected', 'providerProfile.isVerified': false })
    );
    expect(batch.update).toHaveBeenCalledWith(
      { col: 'users', id: 'u1' },
      expect.objectContaining({ providerStatus: 'rejected' })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/firebase/providerApplication.test.ts`
Expected: FAIL — cannot resolve `./providerApplication` (module not created yet).

- [ ] **Step 3: Implement the module**

Create `src/lib/firebase/providerApplication.ts`:

```ts
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

/**
 * User opts in as a provider. Creates/merges instructors/{uid} as an unverified
 * pending profile and marks users/{uid}.providerStatus = 'pending'. Both docs are
 * written in one batch so the mirrored status never drifts. Idempotent: re-running
 * merges into an existing instructor doc (does not reset a verified provider's
 * isVerified — callers gate this behind providerStatus === 'none').
 */
export async function submitProviderApplication(
  uid: string,
  opts: { fullName: string; categoryName: string }
): Promise<void> {
  const batch = writeBatch(db);
  const instructorRef = doc(db, 'instructors', uid);
  const userRef = doc(db, 'users', uid);

  batch.set(
    instructorRef,
    {
      uid,
      name: opts.fullName,
      fullName: opts.fullName,
      isActive: true,
      providerProfile: {
        isVerified: false,
        specialties: [opts.categoryName],
        bio: '',
        rating: 0,
        reviewCount: 0,
      },
      applicationStatus: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  batch.update(userRef, { providerStatus: 'pending', updatedAt: serverTimestamp() });

  await batch.commit();
}

/**
 * Admin decision on a pending application. Sets instructors/{uid}.applicationStatus
 * and providerProfile.isVerified together with users/{uid}.providerStatus, in one batch.
 */
export async function setProviderApplicationStatus(
  uid: string,
  status: 'verified' | 'rejected'
): Promise<void> {
  const batch = writeBatch(db);
  const instructorRef = doc(db, 'instructors', uid);
  const userRef = doc(db, 'users', uid);

  batch.update(instructorRef, {
    applicationStatus: status,
    'providerProfile.isVerified': status === 'verified',
    updatedAt: serverTimestamp(),
  });
  batch.update(userRef, { providerStatus: status, updatedAt: serverTimestamp() });

  await batch.commit();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/firebase/providerApplication.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/providerApplication.ts src/lib/firebase/providerApplication.test.ts
git commit -m "feat(provider): batched submit + admin status helpers"
```

---

### Task 3: Pure status helpers + hooks

**Files:**
- Create: `src/lib/providerStatus.ts`
- Test: `src/lib/providerStatus.test.ts`
- Create: `src/hooks/useProviderApplication.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/providerStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { providerCardState, canAccessProviderArea } from './providerStatus';

describe('providerCardState', () => {
  it('maps status to card variant', () => {
    expect(providerCardState(undefined)).toBe('cta');
    expect(providerCardState('none')).toBe('cta');
    expect(providerCardState('pending')).toBe('pending');
    expect(providerCardState('verified')).toBe('verified');
    expect(providerCardState('rejected')).toBe('rejected');
  });
});

describe('canAccessProviderArea', () => {
  it('allows only pending and verified', () => {
    expect(canAccessProviderArea('pending')).toBe(true);
    expect(canAccessProviderArea('verified')).toBe(true);
    expect(canAccessProviderArea('rejected')).toBe(false);
    expect(canAccessProviderArea('none')).toBe(false);
    expect(canAccessProviderArea(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/providerStatus.test.ts`
Expected: FAIL — cannot resolve `./providerStatus`.

- [ ] **Step 3: Implement the pure helpers**

Create `src/lib/providerStatus.ts`:

```ts
import type { ProviderStatus } from '@/types/firebase';

export type ProviderCardVariant = 'cta' | 'pending' | 'verified' | 'rejected';

/** Which variant of the "become a provider" card to show for a given status. */
export function providerCardState(status: ProviderStatus | undefined): ProviderCardVariant {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'verified':
      return 'verified';
    case 'rejected':
      return 'rejected';
    default:
      return 'cta';
  }
}

/** Whether a user may enter the provider dashboard area. */
export function canAccessProviderArea(status: ProviderStatus | undefined): boolean {
  return status === 'pending' || status === 'verified';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/providerStatus.test.ts`
Expected: PASS (2 suites).

- [ ] **Step 5: Implement the hooks**

Create `src/hooks/useProviderApplication.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { submitProviderApplication } from '@/lib/firebase/providerApplication';
import type { ProviderStatus } from '@/types/firebase';

/** Current user's provider status, from the already-loaded auth user. */
export function useProviderStatus(): ProviderStatus {
  return useAuthStore((s) => s.user?.providerStatus ?? 'none');
}

/** Submit a provider opt-in for the current user, then refresh the auth user. */
export function useSubmitProviderApplication() {
  const user = useAuthStore((s) => s.user);
  const loadUserData = useAuthStore((s) => s.loadUserData);
  return useMutation({
    mutationFn: async (categoryName: string) => {
      if (!user) throw new Error('Not authenticated');
      await submitProviderApplication(user.uid, { fullName: user.fullName, categoryName });
    },
    onSuccess: async () => {
      if (user) await loadUserData(user.uid);
    },
  });
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If the project has no `tsc` script handy, `npm run build` also validates types.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/providerStatus.ts src/lib/providerStatus.test.ts src/hooks/useProviderApplication.ts
git commit -m "feat(provider): status helpers + opt-in hooks"
```

---

### Task 4: Firestore security rules

**Files:**
- Modify: `firestore.rules` (helpers ~101-131, users block ~144-160, instructors block ~272-280)

No automated rules test harness exists in this repo; this task is edit + build-time review + manual emulator/console verification (see Task 9).

- [ ] **Step 1: Allow `providerStatus` on user create**

In `firestore.rules`, in `isValidUserCreate()` (line 101), add `'providerStatus'` to the `hasOnly([...])` key list (e.g. on the `'role', 'userType', ...` line):

```
        'role', 'userType', 'permissions', 'providerProfile', 'providerStatus',
```

- [ ] **Step 2: Allow `providerStatus` on user update**

In `isValidUserUpdate()` (line 117), add `'providerStatus'` to its `hasOnly([...])` list:

```
        'socialLinks', 'notificationSettings', 'privacySettings', 'providerProfile', 'providerStatus'
```

- [ ] **Step 3: Constrain the value an owner may self-set**

In the `match /users/{userId}` create rule (line 144), add a clause to the owner branch so a self-created doc can only be `none`/`pending`:

```
      allow create: if isSuperAdmin() ||
                       (isOwner(userId) &&
                        request.resource.data.role in ['customer', 'provider'] &&
                        request.resource.data.get('providerStatus', 'none') in ['none', 'pending'] &&
                        isValidUserCreate());
```

In the owner branch of the update rule (line 152), add a clause that only constrains `providerStatus` when it is being changed (so verified providers can still edit other fields):

```
        (isOwner(userId) && isValidUserUpdate() && !isValidRoleUpdate() &&
         (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['providerStatus']) ||
          request.resource.data.providerStatus in ['none', 'pending']))
```

- [ ] **Step 4: Split instructors create/update so owners cannot self-verify**

In `match /instructors/{instructorId}` (line 272), replace the single `allow write` (lines 278-280) with:

```
      // Create: admin, or the user creating their OWN unverified pending profile
      allow create: if isAdmin() ||
        (isAuthenticated() &&
         request.resource.data.uid == request.auth.uid &&
         request.resource.data.get(['providerProfile', 'isVerified'], false) == false &&
         request.resource.data.get('applicationStatus', 'pending') == 'pending');

      // Update: admin can change anything; the owner may edit their profile but may
      // NOT change isVerified or applicationStatus (only admin verifies/rejects).
      allow update: if isAdmin() ||
        (isAuthenticated() &&
         resource.data.uid == request.auth.uid &&
         request.resource.data.get(['providerProfile', 'isVerified'], false) ==
           resource.data.get(['providerProfile', 'isVerified'], false) &&
         request.resource.data.get('applicationStatus', 'pending') ==
           resource.data.get('applicationStatus', 'pending'));

      allow delete: if isAdmin();
```

Keep the existing `read` rule (line 274) and the `reviews`/`services`/`availability` sub-rules unchanged.

- [ ] **Step 5: Validate rules syntax**

Run: `npx firebase deploy --only firestore:rules --dry-run --project vfit-funlife` (if the CLI is configured) OR open the rules in the Firebase console rules playground.
Expected: rules compile with no syntax errors. (If `.get([...])` nested-path syntax is rejected by the deployed ruleset version, fall back to guarded access: `('providerProfile' in request.resource.data) ? request.resource.data.providerProfile.get('isVerified', false) : false`.)

- [ ] **Step 6: Commit**

```bash
git add firestore.rules
git commit -m "feat(provider): rules allow self opt-in, forbid self-verify"
```

---

### Task 5: Registration opt-in (toggle + category picker)

**Files:**
- Modify: `src/app/auth/register/page.tsx` (state ~34-43, submit handler ~67, the form section that renders `preferredSection` ~416 and/or ~567)

This is a UI task; verify by build + manual check (Task 9). The register page renders the profile fields in the email-registration form; place the new control alongside the existing `preferredSection` selector.

- [ ] **Step 1: Add imports + state**

Near the top imports of `src/app/auth/register/page.tsx`, add:

```ts
import { SERVICE_CATEGORIES } from '@/lib/serviceCategories';
import { submitProviderApplication } from '@/lib/firebase/providerApplication';
```

In the component body, alongside the other `useState` hooks (after `acceptTerms`, ~line 40):

```ts
  const [wantsProvider, setWantsProvider] = useState(false);
  const [providerCategory, setProviderCategory] = useState('');
```

- [ ] **Step 2: Add the opt-in control to the form**

Immediately after the block that renders the `preferredSection` selector (the interests buttons), add:

```tsx
            {/* Provider opt-in */}
            <div className="mt-4 rounded-xl border border-white/10 p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantsProvider}
                  onChange={(e) => setWantsProvider(e.target.checked)}
                  className="w-5 h-5 accent-vfit-primary"
                />
                <span className="text-sm text-white">
                  Voglio anche offrire servizi come professionista
                </span>
              </label>

              {wantsProvider && (
                <div className="mt-3">
                  <p className="text-sm text-white/60 mb-2">Che tipo di servizio offri?</p>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setProviderCategory(c.name)}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm border transition-colors',
                          providerCategory === c.name
                            ? 'border-vfit-primary bg-vfit-primary/10 text-white'
                            : 'border-white/10 text-white/70 hover:bg-white/5'
                        )}
                      >
                        <span className="mr-1">{c.icon}</span>{c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
```

(`cn` is already imported in this file — confirm; if not, add `import { cn } from '@/lib/utils';`.)

- [ ] **Step 3: Validate + submit the application in the handler**

In the submit handler (the one calling `completeRegistration`, ~line 67), after the existing `await completeRegistration(firebaseUser.uid, {...})` call, add:

```ts
      if (wantsProvider) {
        if (!providerCategory) {
          setError('Seleziona il tipo di servizio che offri.');
          setIsLoading(false);
          return;
        }
        await submitProviderApplication(firebaseUser.uid, {
          fullName,
          categoryName: providerCategory,
        });
      }
```

If a guard exists earlier that blocks submit before `completeRegistration` (e.g. the `Create account` disabled condition), do not change it — the category validation above runs only when the toggle is on.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/register/page.tsx
git commit -m "feat(provider): provider opt-in toggle on registration"
```

---

### Task 6: Profile "Diventa un professionista" card

**Files:**
- Create: `src/components/profile/BecomeProviderCard.tsx`
- Modify: `src/components/profile/index.ts` (barrel, if present — add the export)
- Modify: `src/app/(main)/profile/page.tsx` (render the card)

- [ ] **Step 1: Create the card component**

Create `src/components/profile/BecomeProviderCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, Clock, CheckCircle, XCircle } from 'lucide-react';
import { SERVICE_CATEGORIES } from '@/lib/serviceCategories';
import { providerCardState } from '@/lib/providerStatus';
import { useProviderStatus, useSubmitProviderApplication } from '@/hooks/useProviderApplication';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function BecomeProviderCard() {
  const status = useProviderStatus();
  const variant = providerCardState(status);
  const submit = useSubmitProviderApplication();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');

  if (variant === 'verified') {
    return (
      <Link
        href="/provider/dashboard"
        className="flex items-center gap-3 rounded-xl border border-white/10 p-4 hover:bg-white/5"
      >
        <CheckCircle className="w-5 h-5 text-[#10B981]" />
        <div>
          <p className="text-white font-medium">Sei un professionista</p>
          <p className="text-sm text-white/50">Vai alla dashboard provider</p>
        </div>
      </Link>
    );
  }

  if (variant === 'pending') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4">
        <Clock className="w-5 h-5 text-[#F59E0B]" />
        <div>
          <p className="text-white font-medium">Richiesta in revisione</p>
          <p className="text-sm text-white/60">Sarai visibile dopo l'approvazione di un amministratore.</p>
        </div>
      </div>
    );
  }

  if (variant === 'rejected') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 p-4">
        <XCircle className="w-5 h-5 text-[#EF4444]" />
        <div>
          <p className="text-white font-medium">Richiesta non approvata</p>
          <p className="text-sm text-white/60">Contatta il supporto per maggiori informazioni.</p>
        </div>
      </div>
    );
  }

  // variant === 'cta'
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-3">
        <Briefcase className="w-5 h-5 text-vfit-primary" />
        <div className="flex-1">
          <p className="text-white font-medium">Diventa un professionista</p>
          <p className="text-sm text-white/50">Offri i tuoi servizi sulla piattaforma.</p>
        </div>
        {!open && (
          <Button size="sm" onClick={() => setOpen(true)}>Inizia</Button>
        )}
      </div>

      {open && (
        <div className="mt-4">
          <p className="text-sm text-white/60 mb-2">Che tipo di servizio offri?</p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.name)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm border transition-colors',
                  category === c.name
                    ? 'border-vfit-primary bg-vfit-primary/10 text-white'
                    : 'border-white/10 text-white/70 hover:bg-white/5'
                )}
              >
                <span className="mr-1">{c.icon}</span>{c.name}
              </button>
            ))}
          </div>
          {submit.isError && (
            <p className="text-sm text-[#EF4444] mt-2">Qualcosa è andato storto. Riprova.</p>
          )}
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              disabled={!category || submit.isPending}
              onClick={() => submit.mutate(category)}
            >
              {submit.isPending ? 'Invio…' : 'Invia richiesta'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Export from the profile barrel (if one exists)**

If `src/components/profile/index.ts` exists, add:

```ts
export { BecomeProviderCard } from './BecomeProviderCard';
```

- [ ] **Step 3: Render the card in the profile page**

In `src/app/(main)/profile/page.tsx`, import it (via barrel if present, else direct path):

```ts
import { BecomeProviderCard } from '@/components/profile';
```

Render `<BecomeProviderCard />` in the page body — place it near the top of the account section (above or below the existing menu sections). Pick a sensible spot in the existing JSX layout.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/BecomeProviderCard.tsx "src/app/(main)/profile/page.tsx"
git commit -m "feat(provider): profile become-a-provider card (status-driven)"
```

---

### Task 7: Provider area guard + pending banner

**Files:**
- Modify: `src/app/(main)/provider/layout.tsx`

- [ ] **Step 1: Add guard + banner to the layout**

In `src/app/(main)/provider/layout.tsx`, add imports:

```ts
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { canAccessProviderArea } from '@/lib/providerStatus';
```

Inside `ProviderLayout`, before the `return`, add:

```ts
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const status = user?.providerStatus ?? 'none';

  useEffect(() => {
    if (isInitialized && user && !canAccessProviderArea(status)) {
      router.replace('/profile');
    }
  }, [isInitialized, user, status, router]);

  if (isInitialized && user && !canAccessProviderArea(status)) {
    return null; // redirecting
  }
```

(Confirm `isInitialized` exists on the auth store — it is referenced as `isInitialized` in `authStore.ts`. If the exact selector name differs, use the store's initialized flag.)

Then, inside the `<main>`'s content container (just before `{children}`), add the pending banner:

```tsx
          {status === 'pending' && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4">
              <Clock className="w-5 h-5 text-[#F59E0B]" />
              <p className="text-sm text-white/80">
                Profilo in revisione — sarai visibile dopo l'approvazione.
              </p>
            </div>
          )}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/provider/layout.tsx"
git commit -m "feat(provider): gate provider area + pending banner"
```

---

### Task 8: Admin pending-applications panel

**Files:**
- Modify: `src/lib/firebase/providers.ts` (add `fetchProviderApplications`)
- Test: `src/lib/firebase/providers.test.ts` (add a case)
- Create: `src/components/admin/ProviderApplicationsPanel.tsx`
- Modify: `src/app/admin/providers/page.tsx` (mount the panel)

- [ ] **Step 1: Write the failing test for `fetchProviderApplications`**

Add to `src/lib/firebase/providers.test.ts` (the `firebase/firestore` mock there already includes `getDocs`, `collection`, `query`, `where`):

```ts
import { fetchProviderApplications } from './providers';

describe('fetchProviderApplications', () => {
  it('returns instructors with a pending application', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'u1', data: () => ({ fullName: 'Mia', isActive: true, applicationStatus: 'pending', providerProfile: { isVerified: false, specialties: ['Yoga'] } }) },
      ],
    } as never);
    const apps = await fetchProviderApplications();
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe('u1');
    expect(apps[0].applicationStatus).toBe('pending');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/firebase/providers.test.ts`
Expected: FAIL — `fetchProviderApplications` is not exported.

- [ ] **Step 3: Implement `fetchProviderApplications`**

In `src/lib/firebase/providers.ts`, add (uses the already-imported `collection`, `query`, `where`, `getDocs`, `flattenProvider`):

```ts
export async function fetchProviderApplications(): Promise<Provider[]> {
  try {
    const q = query(collection(db, 'instructors'), where('applicationStatus', '==', 'pending'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => flattenProvider(d.id, d.data() as Record<string, unknown>));
  } catch (error) {
    console.error('[fetchProviderApplications]', error);
    return [];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/firebase/providers.test.ts`
Expected: PASS (existing cases + the new one).

- [ ] **Step 5: Create the admin panel component**

Create `src/components/admin/ProviderApplicationsPanel.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { fetchProviderApplications } from '@/lib/firebase/providers';
import { setProviderApplicationStatus } from '@/lib/firebase/providerApplication';
import type { Provider } from '@/types/instructor';
import { Button } from '@/components/ui/button';

export function ProviderApplicationsPanel() {
  const [apps, setApps] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setApps(await fetchProviderApplications());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, status: 'verified' | 'rejected') => {
    setBusyId(id);
    try {
      await setProviderApplicationStatus(id, status);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-[#F59E0B]" />
        <h2 className="text-lg font-semibold text-white">Richieste in attesa</h2>
        <span className="text-sm text-white/50">({apps.length})</span>
      </div>

      {loading ? (
        <p className="text-white/50 text-sm">Caricamento…</p>
      ) : apps.length === 0 ? (
        <p className="text-white/50 text-sm">Nessuna richiesta in attesa.</p>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-white font-medium">{a.fullName}</p>
                <p className="text-sm text-white/50">{a.specialties.join(', ') || '—'}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busyId === a.id} onClick={() => decide(a.id, 'verified')}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Verifica
                </Button>
                <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => decide(a.id, 'rejected')}>
                  <XCircle className="w-4 h-4 mr-1" /> Rifiuta
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Mount the panel on the admin providers page**

In `src/app/admin/providers/page.tsx`, import and render `<ProviderApplicationsPanel />` near the top of the page content:

```ts
import { ProviderApplicationsPanel } from '@/components/admin/ProviderApplicationsPanel';
```

Place `<ProviderApplicationsPanel />` in the JSX (e.g. above the existing providers list/table). If `src/components/admin/index.ts` is a barrel, also add `export { ProviderApplicationsPanel } from './ProviderApplicationsPanel';` and import from `@/components/admin`.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/firebase/providers.ts src/lib/firebase/providers.test.ts src/components/admin/ProviderApplicationsPanel.tsx src/app/admin/providers/page.tsx
git commit -m "feat(provider): admin pending-applications panel + verify/reject"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npx vitest run`
Expected: all tests pass, including `providerApplication`, `providerStatus`, and the new `providers` case.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: static export build succeeds with no type errors.

- [ ] **Step 3: Deploy rules to the dev project (or emulator) and manually verify security**

Run: `npx firebase deploy --only firestore:rules --project vfit-funlife` (or run the emulator).
Manually confirm in the console/playground:
- A signed-in non-admin user **can** create `instructors/{their-uid}` with `isVerified:false`, `applicationStatus:'pending'`.
- The same user **cannot** update that doc to `isVerified:true` or `applicationStatus:'verified'`.
- The same user **cannot** set `users/{their-uid}.providerStatus` to `'verified'`.

- [ ] **Step 4: Manual end-to-end (deployed web or `npm run dev`)**

1. Register a new account with the provider toggle ON + pick a category → after signup the user's `providerStatus` is `pending` and `instructors/{uid}` exists unverified.
2. Go to `/booking` and search — the new pending provider does **not** appear.
3. Visit `/provider/dashboard` as that user — the area is reachable and shows the "Profilo in revisione" banner; adding a service/photo works.
4. As an admin, open `/admin/providers` → "Richieste in attesa" lists the applicant → click **Verifica**.
5. Re-search `/booking` — the provider now appears. Their profile shows the "Sei un professionista" card linking to the dashboard; the pending banner is gone.
6. Repeat the opt-in via the profile **"Diventa un professionista"** card for an existing customer and confirm the same pending → verified flow. Test **Rifiuta** shows the rejected state and keeps them out of search.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(provider): verification fixes for self-registration flow"
```

---

## Notes for the implementer

- **Do not** modify the legacy `users`-based admin verification path (`getPendingVerifications`/`verifyProvider` in `src/lib/firebase/admin.ts`). This feature deliberately uses the `instructors` collection (what public search reads) and a new `applicationStatus` field. The two paths coexist.
- The mirrored status (`users.providerStatus` ↔ `instructors.applicationStatus`/`isVerified`) is only ever written by `submitProviderApplication` and `setProviderApplicationStatus`. Don't introduce other writers.
- Search/discovery code is intentionally untouched — pending providers are hidden purely because `providerProfile.isVerified` stays `false`.

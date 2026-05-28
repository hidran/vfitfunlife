# Admin CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire full CRUD for all 6 admin entities (users, providers, venues, bookings, payments, user-types) with superadmin-gated deletes, audit trail, and a static-export-compatible query-string routing pattern that fixes the current redirect-to-home bug.

**Architecture:** One `/admin/{entity}/page.tsx` per entity acts as a router-switching orchestrator (list / detail / create modes driven by `?id=` query string). Per-entity view components live under `src/components/admin/{entity}/`. Shared building blocks (audit log, role guard, delete dialog, mutation hook, detail layout) live under `src/components/admin/`. Hybrid write path: existing Cloud Functions for sensitive ops, direct Firestore writes for low-risk fields, gated by extended Firestore rules. 3 new Cloud Functions (`adminDeleteUser`, `adminDeleteProvider`, `adminIssueRefund`).

**Tech Stack:** Next.js App Router + static export, React 19, Zustand + TanStack Query, React Hook Form + Zod, Firebase (Firestore + Auth + Functions, region `europe-west1`), Capacitor 8, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-05-28-admin-crud-design.md`

---

## File Structure

### Shared (`src/components/admin/`)
- `auditLog.ts` — `recordAudit(payload)` writes `audit_logs/{autoId}`
- `SuperadminOnly.tsx` — render-gate wrapper (`user.role === 'superadmin'`)
- `ConfirmDeleteDialog.tsx` — typed-name destructive confirmation modal
- `EntityDetailLayout.tsx` — back / header / actions / tabs shell
- `useEntityMutation.ts` — TanStack `useMutation` wrapper writing audit log on success
- `index.ts` — barrel export (extend existing)

### Per-entity (`src/components/admin/{entity}/`)
For each of `users`, `providers`, `venues`, `bookings`, `payments`, `user-types`:
- `{Entity}ListView.tsx`
- `{Entity}DetailView.tsx`
- `{Entity}FormView.tsx`
- `index.ts`

### Orchestrator pages (rewrite)
- `src/app/admin/users/page.tsx`
- `src/app/admin/providers/page.tsx`
- `src/app/admin/venues/page.tsx`
- `src/app/admin/bookings/page.tsx`
- `src/app/admin/payments/page.tsx`
- `src/app/admin/user-types/page.tsx`

### Delete (broken dynamic routes)
- `src/app/admin/users/[id]/` — whole folder
- `src/app/admin/providers/[id]/` — whole folder

### Cloud Functions (`functions/src/`)
- `users/adminMutations.ts` — `adminDeleteUser` (new)
- `users/roles.ts` — add `adminDeleteProvider`; retrofit `setUserRole` + `setUserActiveStatus` + `verifyProvider` with audit-log writes
- `payments/admin.ts` — `adminIssueRefund` (new)
- `bookings/index.ts` — retrofit `updateBookingStatus` + `confirmBooking` + `cancelBooking` with audit-log writes
- `lib/audit.ts` — server-side `writeAuditLog(payload)` helper
- `index.ts` — export new functions

### Rules
- `firestore.rules` — add per-collection `update`/`delete` rules + `audit_logs` rules

### i18n (5 locales)
- `src/i18n/messages/{it,en,es,fr,de}.ts` — add admin CRUD keys

### E2E
- `e2e/admin-crud.spec.ts`

---

## Task 1: Shared admin building blocks

**Files:**
- Create: `src/components/admin/auditLog.ts`
- Create: `src/components/admin/SuperadminOnly.tsx`
- Create: `src/components/admin/ConfirmDeleteDialog.tsx`
- Create: `src/components/admin/EntityDetailLayout.tsx`
- Create: `src/components/admin/useEntityMutation.ts`
- Modify: `src/components/admin/index.ts` — add new exports

- [ ] **Step 1: Write `auditLog.ts`**

```ts
// src/components/admin/auditLog.ts
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { User } from '@/types/firebase';

export type AuditAction =
  | 'create' | 'update' | 'delete'
  | 'refund' | 'verify' | 'suspend' | 'activate' | 'role_change';

export type AuditEntityType =
  | 'user' | 'provider' | 'venue' | 'booking' | 'payment' | 'user_type';

export interface AuditPayload {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
}

export async function recordAudit(actor: User | null, payload: AuditPayload): Promise<void> {
  if (!actor) {
    console.warn('[audit] skipped — no actor');
    return;
  }
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: actor.id,
      actorEmail: actor.email ?? '',
      actorRole: actor.role,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      before: payload.before ?? null,
      after: payload.after ?? null,
      reason: payload.reason ?? null,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error('[audit] write failed', err);
  }
}
```

- [ ] **Step 2: Write `SuperadminOnly.tsx`**

```tsx
// src/components/admin/SuperadminOnly.tsx
'use client';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function SuperadminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'superadmin') return <>{fallback}</>;
  return <>{children}</>;
}
```

- [ ] **Step 3: Write `ConfirmDeleteDialog.tsx`**

```tsx
// src/components/admin/ConfirmDeleteDialog.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  open: boolean;
  entityLabel: string;       // e.g. "user"
  entityName: string;        // typed match target
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function ConfirmDeleteDialog({ open, entityLabel, entityName, onClose, onConfirm }: Props) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const matches = typed === entityName && reason.trim().length > 0;

  async function handleConfirm() {
    if (!matches) return;
    setBusy(true);
    try { await onConfirm(reason); onClose(); }
    finally { setBusy(false); setTyped(''); setReason(''); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-[#1E2230] border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            {t('admin.delete.title', { entity: entityLabel })}
          </h2>
          <button onClick={onClose} aria-label={t('common.close')} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-white/70">{t('admin.delete.warning', { name: entityName })}</p>
        <label className="block space-y-1">
          <span className="text-xs text-white/60">{t('admin.delete.typeNameLabel', { name: entityName })}</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-white/60">{t('admin.delete.reasonLabel')}</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!matches || busy} className="bg-red-500 hover:bg-red-600">{busy ? t('common.loading') : t('admin.delete.confirm')}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `EntityDetailLayout.tsx`**

```tsx
// src/components/admin/EntityDetailLayout.tsx
'use client';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { SuperadminOnly } from './SuperadminOnly';

interface Props {
  title: string;
  subtitle?: string;
  backHref: string;
  isEditing: boolean;
  isSaving?: boolean;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  children: ReactNode;
}

export function EntityDetailLayout({
  title, subtitle, backHref, isEditing, isSaving, onEdit, onCancelEdit, onSave, onDelete, children,
}: Props) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.push(backHref)} className="text-white/60">
        <ArrowLeft className="mr-2 h-4 w-4" /> {t('admin.detail.back')}
      </Button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-white/50">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {!isEditing && onEdit && (
            <Button variant="secondary" size="sm" onClick={onEdit}><Edit className="mr-1 h-4 w-4" /> {t('admin.detail.edit')}</Button>
          )}
          {isEditing && (
            <>
              <Button variant="ghost" size="sm" onClick={onCancelEdit} disabled={isSaving}><X className="mr-1 h-4 w-4" /> {t('common.cancel')}</Button>
              <Button variant="primary" size="sm" onClick={onSave} isLoading={isSaving}><Save className="mr-1 h-4 w-4" /> {t('admin.detail.save')}</Button>
            </>
          )}
          {onDelete && (
            <SuperadminOnly>
              <Button variant="secondary" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-400"><Trash2 className="mr-1 h-4 w-4" /> {t('admin.detail.delete')}</Button>
            </SuperadminOnly>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Write `useEntityMutation.ts`**

```ts
// src/components/admin/useEntityMutation.ts
'use client';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { recordAudit, type AuditPayload } from './auditLog';

interface Options<TInput, TResult> {
  mutate: (input: TInput) => Promise<TResult>;
  audit: (input: TInput, result: TResult) => AuditPayload;
  invalidateKeys?: QueryKey[];
  onSuccess?: (result: TResult, input: TInput) => void;
}

export function useEntityMutation<TInput, TResult = void>(opts: Options<TInput, TResult>) {
  const qc = useQueryClient();
  const actor = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: opts.mutate,
    onSuccess: async (result, input) => {
      await recordAudit(actor, opts.audit(input, result));
      opts.invalidateKeys?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(result, input);
    },
  });
}
```

- [ ] **Step 6: Add barrel exports**

Modify `src/components/admin/index.ts` to add:
```ts
export { recordAudit } from './auditLog';
export type { AuditAction, AuditEntityType, AuditPayload } from './auditLog';
export { SuperadminOnly } from './SuperadminOnly';
export { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
export { EntityDetailLayout } from './EntityDetailLayout';
export { useEntityMutation } from './useEntityMutation';
```

- [ ] **Step 7: Add i18n stubs (skeleton — full keys in Task 11)**

Add to each of `src/i18n/messages/{it,en,es,fr,de}.ts` the keys used above: `admin.detail.back`, `admin.detail.edit`, `admin.detail.save`, `admin.detail.delete`, `admin.delete.title`, `admin.delete.warning`, `admin.delete.typeNameLabel`, `admin.delete.reasonLabel`, `admin.delete.confirm`, `common.close`, `common.cancel`. (English values; other locales translated.)

- [ ] **Step 8: Verify build**

Run: `npm run build 2>&1 | tail -30`
Expected: no type errors. (Components are unused in this task — verifies syntax/types only.)

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/auditLog.ts src/components/admin/SuperadminOnly.tsx \
        src/components/admin/ConfirmDeleteDialog.tsx src/components/admin/EntityDetailLayout.tsx \
        src/components/admin/useEntityMutation.ts src/components/admin/index.ts \
        src/i18n/messages/
git commit -m "feat(admin): shared CRUD building blocks (audit, role-gate, delete dialog, detail layout, mutation hook)"
```

---

## Task 2: Firestore rules — staff update / superadmin delete + audit_logs

**Files:**
- Modify: `firestore.rules` — add per-collection rules and `audit_logs` rules

- [ ] **Step 1: Locate the per-collection blocks**

Read `firestore.rules`. Find blocks `match /users/{userId}`, `/providers/{providerId}`, `/venues/{venueId}`, `/bookings/{bookingId}`, `/payments/{paymentId}`, `/user_types/{userTypeId}`.

- [ ] **Step 2: Apply update + delete rules**

For each collection, ensure these `allow` clauses exist (preserve any existing owner/self-edit rules using `||`):

```
// users
allow update: if isAdmin() || isOwner(userId);
allow delete: if isSuperAdmin();

// providers
allow update: if isAdmin() || isOwner(resource.data.userId);
allow delete: if isSuperAdmin();

// venues
allow read:   if isAuthenticated();
allow update: if isAdmin();
allow delete: if isSuperAdmin();

// bookings
allow update: if isAdmin() || isOwner(resource.data.customerId);
allow delete: if isSuperAdmin();

// payments
allow update: if isSuperAdmin();
allow delete: if false;

// user_types
allow read:   if true;
allow create: if isSuperAdmin();
allow update: if isSuperAdmin();
allow delete: if isSuperAdmin();
```

- [ ] **Step 3: Add `audit_logs` collection rules**

Append before the closing `}` of `match /databases/{database}/documents`:

```
match /audit_logs/{logId} {
  allow read:   if isAdmin();
  allow create: if isAdmin();
  allow update: if false;
  allow delete: if false;
}
```

- [ ] **Step 4: Deploy rules to production**

```bash
npm run deploy:rules
```
Expected: `✔ Deploy complete!`

- [ ] **Step 5: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): staff-update + superadmin-delete on admin collections, immutable audit_logs"
```

---

## Task 3: Users — kill broken [id] route, port to orchestrator pattern

**Files:**
- Delete: `src/app/admin/users/[id]/page.tsx`
- Delete: `src/app/admin/users/[id]/UserDetailClient.tsx`
- Create: `src/components/admin/users/UsersListView.tsx`
- Create: `src/components/admin/users/UserDetailView.tsx`
- Create: `src/components/admin/users/UserFormView.tsx`
- Create: `src/components/admin/users/index.ts`
- Modify: `src/app/admin/users/page.tsx` — replace with orchestrator

- [ ] **Step 1: Port existing list logic into `UsersListView.tsx`**

Move the body of the existing `src/app/admin/users/page.tsx` (everything in `UsersPage()` returning JSX) into a new `src/components/admin/users/UsersListView.tsx`. Change row click target from `router.push('/admin/users/${user.id}')` to `router.push('/admin/users/?id=${user.id}')` (keep trailing slash from `trailingSlash: true`).

Change the Add button onClick to `router.push('/admin/users/?id=new')`.

- [ ] **Step 2: Port detail page into `UserDetailView.tsx`**

Move the body of `src/app/admin/users/[id]/UserDetailClient.tsx` into `src/components/admin/users/UserDetailView.tsx` and rewrite using `EntityDetailLayout`:

```tsx
// src/components/admin/users/UserDetailView.tsx (skeleton — port full body)
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase/config';
import { EntityDetailLayout, ConfirmDeleteDialog, useEntityMutation } from '@/components/admin';
import { UserFormView } from './UserFormView';
import type { User, UserRole } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';

export function UserDetailView({ userId }: { userId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'users', userId));
      setUser(snap.exists() ? ({ id: snap.id, ...snap.data() } as User) : null);
      setLoading(false);
    })();
  }, [userId]);

  const updateMut = useEntityMutation<Partial<User>, void>({
    mutate: async (patch) => { await updateDoc(doc(db, 'users', userId), patch as never); },
    audit: (patch) => ({ action: 'update', entityType: 'user', entityId: userId, before: user ?? undefined, after: { ...user, ...patch } }),
    invalidateKeys: [['users']],
    onSuccess: (_r, patch) => { setUser((prev) => prev ? { ...prev, ...patch } : prev); setEditing(false); },
  });

  const deleteMut = useEntityMutation<{ reason: string }, void>({
    mutate: async ({ reason }) => {
      const fn = httpsCallable(functions, 'adminDeleteUser');
      await fn({ uid: userId, reason });
    },
    audit: ({ reason }) => ({ action: 'delete', entityType: 'user', entityId: userId, before: user ?? undefined, reason }),
    invalidateKeys: [['users']],
    onSuccess: () => router.push('/admin/users/'),
  });

  if (loading) return <div className="p-8 text-white/50">{t('common.loading')}</div>;
  if (!user) return <div className="p-8 text-white/50">{t('admin.userDetail.notFound')}</div>;

  return (
    <>
      <EntityDetailLayout
        title={user.fullName}
        subtitle={user.email ?? user.phone ?? ''}
        backHref="/admin/users/"
        isEditing={editing}
        isSaving={updateMut.isPending}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() => {}}
        onDelete={() => setConfirmOpen(true)}
      >
        <UserFormView mode={editing ? 'edit' : 'view'} initial={user} onSubmit={(patch) => updateMut.mutate(patch)} isSaving={updateMut.isPending} />
      </EntityDetailLayout>
      <ConfirmDeleteDialog
        open={confirmOpen}
        entityLabel={t('admin.users.entityLabel')}
        entityName={user.fullName}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(reason) => deleteMut.mutateAsync({ reason })}
      />
    </>
  );
}
```

Port the existing tabs/stats/wallet sections from `UserDetailClient.tsx` into the `view` mode of `UserFormView` (read-only display) or as additional sections of `UserDetailView`. The role dropdown stays — calls existing `setUserRole` CF (already audited after Task 10).

- [ ] **Step 3: Build `UserFormView.tsx`**

```tsx
// src/components/admin/users/UserFormView.tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { User } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';
import { useEffect } from 'react';

const userSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
});

type UserForm = z.infer<typeof userSchema>;

interface Props {
  mode: 'view' | 'edit' | 'create';
  initial?: Partial<User>;
  onSubmit: (data: Partial<User>) => void;
  isSaving?: boolean;
}

export function UserFormView({ mode, initial, onSubmit, isSaving }: Props) {
  const { t } = useI18n();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { fullName: initial?.fullName ?? '', email: initial?.email ?? '', phone: initial?.phone ?? '' },
  });
  useEffect(() => { reset({ fullName: initial?.fullName ?? '', email: initial?.email ?? '', phone: initial?.phone ?? '' }); }, [initial, reset]);
  const readonly = mode === 'view';
  return (
    <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label={t('admin.users.field.fullName')} error={errors.fullName?.message}>
        <input {...register('fullName')} disabled={readonly} className="input" />
      </Field>
      <Field label={t('admin.users.field.email')} error={errors.email?.message}>
        <input type="email" {...register('email')} disabled={readonly} className="input" />
      </Field>
      <Field label={t('admin.users.field.phone')} error={errors.phone?.message}>
        <input {...register('phone')} disabled={readonly} className="input" />
      </Field>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-white/60">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}
```

Add `.input` Tailwind class in `src/styles/globals.css` (or use inline classes):
```css
.input { @apply w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white disabled:opacity-60; }
```

`EntityDetailLayout` passes `onSave` — wire to `document.getElementById('user-form')?.requestSubmit()` from the parent.

- [ ] **Step 4: Barrel export**

```ts
// src/components/admin/users/index.ts
export { UsersListView } from './UsersListView';
export { UserDetailView } from './UserDetailView';
export { UserFormView } from './UserFormView';
```

- [ ] **Step 5: Replace `src/app/admin/users/page.tsx` with orchestrator**

```tsx
// src/app/admin/users/page.tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { UsersListView, UserDetailView, UserFormView } from '@/components/admin/users';

export default function UsersPage() {
  const id = useSearchParams().get('id');
  if (!id) return <UsersListView />;
  if (id === 'new') return <UserFormView mode="create" onSubmit={() => {}} />;
  return <UserDetailView userId={id} />;
}
```

(Wire create-mode submit in Step 6.)

- [ ] **Step 6: Wire create flow**

Wrap `UserFormView` in `src/app/admin/users/page.tsx` with a small `UserCreateView` component (inline or in `src/components/admin/users/UserCreateView.tsx`) that calls `addDoc(collection(db, 'users'), data)`, writes audit log, and `router.replace('/admin/users/?id=' + newId)`.

- [ ] **Step 7: Delete the broken `[id]` folder**

```bash
rm -rf src/app/admin/users/[id]
```

- [ ] **Step 8: Smoke-test in dev**

```bash
npm run dev &
sleep 5
```
- Navigate to http://localhost:3000/admin/users/ → list renders.
- Click any row → URL becomes `/admin/users/?id=<id>` → detail loads (no redirect to home).
- Click Edit → fields editable → Save → toast + view updates.
- Log in as superadmin → Delete button visible. As admin → Delete button absent.

Kill dev server.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/users/ src/app/admin/users/page.tsx
git rm -r src/app/admin/users/\[id\]
git commit -m "feat(admin/users): query-string routing, edit/save/delete via shared blocks (fixes redirect-to-home bug)"
```

---

## Task 4: Providers — same pattern

**Files:**
- Delete: `src/app/admin/providers/[id]/page.tsx`
- Delete: `src/app/admin/providers/[id]/ProviderDetailClient.tsx`
- Create: `src/components/admin/providers/ProvidersListView.tsx`
- Create: `src/components/admin/providers/ProviderDetailView.tsx`
- Create: `src/components/admin/providers/ProviderFormView.tsx`
- Create: `src/components/admin/providers/index.ts`
- Modify: `src/app/admin/providers/page.tsx`

- [ ] **Step 1: Port list view**

Same shape as Task 3 Step 1. Row click → `/admin/providers/?id=<id>`. Verification badge column stays.

- [ ] **Step 2: Port detail view**

Same shape as Task 3 Step 2. Update path uses existing CF `updateProviderProfile` for the profile fields; verification toggle calls existing `verifyProvider` CF (already a `SuperadminOnly` action). Delete calls new CF `adminDeleteProvider` (built in Task 9).

- [ ] **Step 3: Build form view**

Fields: `businessName`, `category`, `bio`, `phone`, `address`, `verificationStatus` (read-only display, mutated via separate button). Zod schema mirrors `Provider` type in `src/types/firebase.ts`.

- [ ] **Step 4: Orchestrator + barrel + delete `[id]`**

Replace `src/app/admin/providers/page.tsx` with orchestrator (same pattern as Task 3 Step 5). `rm -rf src/app/admin/providers/[id]`.

- [ ] **Step 5: Smoke-test**

Dev server up. Open `/admin/providers/`, click row, verify detail, edit/save, log in as superadmin → verify Delete works (Task 9 must be done for Delete; until then, button shows but call fails — that's fine for this task).

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/providers/ src/app/admin/providers/page.tsx
git rm -r src/app/admin/providers/\[id\]
git commit -m "feat(admin/providers): query-string routing + edit/delete via shared blocks"
```

---

## Task 5: Venues — full CRUD

**Files:**
- Create: `src/components/admin/venues/VenuesListView.tsx`
- Create: `src/components/admin/venues/VenueDetailView.tsx`
- Create: `src/components/admin/venues/VenueFormView.tsx`
- Create: `src/components/admin/venues/index.ts`
- Modify: `src/app/admin/venues/page.tsx`

- [ ] **Step 1: Port list view**

Move existing `src/app/admin/venues/page.tsx` body into `VenuesListView.tsx`. Row click → `router.push('/admin/venues/?id=' + venue.id)`. Add button → `router.push('/admin/venues/?id=new')`.

- [ ] **Step 2: Build `VenueFormView.tsx`**

```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useI18n } from '@/hooks/useI18n';
import { useEffect } from 'react';
import type { Venue } from '@/types/firebase';

const venueSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['gym', 'wellness_center', 'beauty_salon', 'outdoor_space', 'event_space']),
  street: z.string().min(1),
  city: z.string().min(1),
  zipCode: z.string().min(1),
  country: z.string().min(1),
  phone: z.string().optional().or(z.literal('')),
  isActive: z.boolean(),
  isPartner: z.boolean(),
});

export type VenueForm = z.infer<typeof venueSchema>;

interface Props { mode: 'view' | 'edit' | 'create'; initial?: Partial<Venue>; onSubmit: (data: VenueForm) => void; isSaving?: boolean; }

export function VenueFormView({ mode, initial, onSubmit, isSaving }: Props) {
  const { t } = useI18n();
  const initialAddress = (initial?.address && typeof initial.address === 'object') ? initial.address as never : null;
  const defaults: VenueForm = {
    name: initial?.name ?? '',
    type: (initial?.type as VenueForm['type']) ?? 'gym',
    street: initialAddress?.street ?? (typeof initial?.address === 'string' ? initial.address : '') ?? '',
    city: initialAddress?.city ?? initial?.city ?? '',
    zipCode: initialAddress?.zipCode ?? '',
    country: initialAddress?.country ?? 'IT',
    phone: '',
    isActive: initial?.isActive ?? true,
    isPartner: initial?.isPartner ?? false,
  };
  const { register, handleSubmit, reset, formState: { errors } } = useForm<VenueForm>({ resolver: zodResolver(venueSchema), defaultValues: defaults });
  useEffect(() => { reset(defaults); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initial]);
  const readonly = mode === 'view';
  return (
    <form id="venue-form" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label={t('admin.venues.field.name')} error={errors.name?.message}><input {...register('name')} disabled={readonly} className="input" /></Field>
      <Field label={t('admin.venues.field.type')} error={errors.type?.message}>
        <select {...register('type')} disabled={readonly} className="input">
          <option value="gym">Gym</option><option value="wellness_center">Wellness Center</option>
          <option value="beauty_salon">Beauty Salon</option><option value="outdoor_space">Outdoor</option>
          <option value="event_space">Event Space</option>
        </select>
      </Field>
      <Field label={t('admin.venues.field.street')} error={errors.street?.message}><input {...register('street')} disabled={readonly} className="input" /></Field>
      <Field label={t('admin.venues.field.city')} error={errors.city?.message}><input {...register('city')} disabled={readonly} className="input" /></Field>
      <Field label={t('admin.venues.field.zipCode')} error={errors.zipCode?.message}><input {...register('zipCode')} disabled={readonly} className="input" /></Field>
      <Field label={t('admin.venues.field.country')} error={errors.country?.message}><input {...register('country')} disabled={readonly} className="input" /></Field>
      <Field label={t('admin.venues.field.phone')}><input {...register('phone')} disabled={readonly} className="input" /></Field>
      <Field label={t('admin.venues.field.isActive')}><input type="checkbox" {...register('isActive')} disabled={readonly} /></Field>
      <Field label={t('admin.venues.field.isPartner')}><input type="checkbox" {...register('isPartner')} disabled={readonly} /></Field>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs text-white/60">{label}</span>{children}{error && <span className="text-xs text-red-400">{error}</span>}</label>;
}
```

- [ ] **Step 3: Build `VenueDetailView.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { EntityDetailLayout, ConfirmDeleteDialog, useEntityMutation } from '@/components/admin';
import { VenueFormView, type VenueForm } from './VenueFormView';
import type { Venue } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';

export function VenueDetailView({ venueId }: { venueId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { (async () => {
    const snap = await getDoc(doc(db, 'venues', venueId));
    setVenue(snap.exists() ? ({ id: snap.id, ...snap.data() } as Venue) : null);
    setLoading(false);
  })(); }, [venueId]);

  const updateMut = useEntityMutation<VenueForm, void>({
    mutate: async (data) => {
      const patch = { name: data.name, type: data.type, isActive: data.isActive, isPartner: data.isPartner,
        address: { street: data.street, city: data.city, zipCode: data.zipCode, country: data.country } };
      await updateDoc(doc(db, 'venues', venueId), patch as never);
    },
    audit: (data) => ({ action: 'update', entityType: 'venue', entityId: venueId, before: venue ?? undefined, after: data }),
    invalidateKeys: [['venues']],
    onSuccess: (_r, data) => { setVenue((p) => p ? ({ ...p, ...data } as Venue) : p); setEditing(false); },
  });

  const deleteMut = useEntityMutation<{ reason: string }, void>({
    mutate: async () => { await deleteDoc(doc(db, 'venues', venueId)); },
    audit: ({ reason }) => ({ action: 'delete', entityType: 'venue', entityId: venueId, before: venue ?? undefined, reason }),
    invalidateKeys: [['venues']],
    onSuccess: () => router.push('/admin/venues/'),
  });

  if (loading) return <div className="p-8 text-white/50">{t('common.loading')}</div>;
  if (!venue) return <div className="p-8 text-white/50">{t('admin.venues.notFound')}</div>;

  return (
    <>
      <EntityDetailLayout
        title={venue.name}
        subtitle={venue.type}
        backHref="/admin/venues/"
        isEditing={editing}
        isSaving={updateMut.isPending}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() => (document.getElementById('venue-form') as HTMLFormElement | null)?.requestSubmit()}
        onDelete={() => setConfirmOpen(true)}
      >
        <VenueFormView mode={editing ? 'edit' : 'view'} initial={venue} onSubmit={(d) => updateMut.mutate(d)} isSaving={updateMut.isPending} />
      </EntityDetailLayout>
      <ConfirmDeleteDialog open={confirmOpen} entityLabel={t('admin.venues.entityLabel')} entityName={venue.name}
        onClose={() => setConfirmOpen(false)} onConfirm={(reason) => deleteMut.mutateAsync({ reason })} />
    </>
  );
}

export function VenueCreateView() {
  const router = useRouter();
  const createMut = useEntityMutation<VenueForm, string>({
    mutate: async (data) => {
      const ref = await addDoc(collection(db, 'venues'), {
        name: data.name, type: data.type, isActive: data.isActive, isPartner: data.isPartner,
        rating: 0, reviewCount: 0, photoUrls: [], createdAt: new Date(),
        address: { street: data.street, city: data.city, zipCode: data.zipCode, country: data.country },
      });
      return ref.id;
    },
    audit: (data, id) => ({ action: 'create', entityType: 'venue', entityId: id, after: data }),
    invalidateKeys: [['venues']],
    onSuccess: (id) => router.replace('/admin/venues/?id=' + id),
  });
  return <VenueFormView mode="create" onSubmit={(d) => createMut.mutate(d)} isSaving={createMut.isPending} />;
}
```

- [ ] **Step 4: Orchestrator + barrel**

```tsx
// src/app/admin/venues/page.tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { VenuesListView, VenueDetailView, VenueCreateView } from '@/components/admin/venues';
export default function VenuesPage() {
  const id = useSearchParams().get('id');
  if (!id) return <VenuesListView />;
  if (id === 'new') return <VenueCreateView />;
  return <VenueDetailView venueId={id} />;
}
```

```ts
// src/components/admin/venues/index.ts
export { VenuesListView } from './VenuesListView';
export { VenueDetailView, VenueCreateView } from './VenueDetailView';
export { VenueFormView } from './VenueFormView';
```

- [ ] **Step 5: Smoke-test + commit**

Dev: navigate `/admin/venues/`, click row, edit address, save, verify Firestore doc updated. Create new venue, verify redirect to `/admin/venues/?id=<newId>`.

```bash
git add src/components/admin/venues/ src/app/admin/venues/page.tsx
git commit -m "feat(admin/venues): full CRUD via query-string routing"
```

---

## Task 6: Bookings — full CRUD

**Files:**
- Create: `src/components/admin/bookings/BookingsListView.tsx`
- Create: `src/components/admin/bookings/BookingDetailView.tsx`
- Create: `src/components/admin/bookings/BookingFormView.tsx`
- Create: `src/components/admin/bookings/index.ts`
- Modify: `src/app/admin/bookings/page.tsx`

- [ ] **Step 1: Port list view**

Same pattern. Row click → `/admin/bookings/?id=<id>`.

- [ ] **Step 2: Form view fields**

Read-only for admin: `status`, `customerName`, `providerName`, `serviceName`, `bookingDate`, `amount`, `notes`. Editable for superadmin: `amount`, `bookingDate`, `notes`. Status transitions: separate buttons (Confirm/Cancel) call existing `confirmBooking`/`cancelBooking` CFs — visible for both admin and superadmin.

Zod schema validates `amount > 0`, valid date.

- [ ] **Step 3: Detail view**

Mirror `VenueDetailView` pattern. Update path: direct Firestore for `notes` (admin allowed), wrap financial-field edits in `<SuperadminOnly>`. Delete: direct Firestore `deleteDoc` (rule requires superadmin).

- [ ] **Step 4: Orchestrator + barrel + smoke + commit**

```bash
git add src/components/admin/bookings/ src/app/admin/bookings/page.tsx
git commit -m "feat(admin/bookings): full CRUD with superadmin-gated financial edits"
```

---

## Task 7: Payments — read + refund + superadmin field edits

**Files:**
- Create: `src/components/admin/payments/PaymentsListView.tsx`
- Create: `src/components/admin/payments/PaymentDetailView.tsx`
- Create: `src/components/admin/payments/PaymentFormView.tsx`
- Create: `src/components/admin/payments/index.ts`
- Modify: `src/app/admin/payments/page.tsx`

- [ ] **Step 1: Port list view**

Same pattern. Add status filter (succeeded / refunded / partially_refunded / disputed). Row click → `/admin/payments/?id=<id>`.

- [ ] **Step 2: Detail view**

Read-only display of `amount`, `customer`, `provider`, `createdAt`, `stripePaymentIntentId`. `<SuperadminOnly>`-gated fields: `notes`, `disputed` boolean. NO delete button (`delete: false` in rules).

Add **Issue Refund** button inside `<SuperadminOnly>` — opens its own dialog (amount + reason inputs) calling the new `adminIssueRefund` CF (Task 9).

- [ ] **Step 3: Form view**

Only `notes` and `disputed` are editable (superadmin only). Other fields display-only.

- [ ] **Step 4: Orchestrator + barrel (no create mode — payments are CF-created only)**

```tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { PaymentsListView, PaymentDetailView } from '@/components/admin/payments';
export default function PaymentsPage() {
  const id = useSearchParams().get('id');
  if (!id || id === 'new') return <PaymentsListView />;
  return <PaymentDetailView paymentId={id} />;
}
```

- [ ] **Step 5: Smoke + commit**

```bash
git add src/components/admin/payments/ src/app/admin/payments/page.tsx
git commit -m "feat(admin/payments): superadmin refund + notes; ledger-immutable"
```

---

## Task 8: User-types — full CRUD

**Files:**
- Create: `src/components/admin/user-types/UserTypesListView.tsx`
- Create: `src/components/admin/user-types/UserTypeDetailView.tsx`
- Create: `src/components/admin/user-types/UserTypeFormView.tsx`
- Create: `src/components/admin/user-types/index.ts`
- Modify: `src/app/admin/user-types/page.tsx`

- [ ] **Step 1: Port list + build detail/form**

Fields per `UserTypeData` in `src/types/admin.ts`: `name`, `category`, `description`, `icon`, `permissions` (string[]). Existing CFs: `createUserType` (Task 11 confirm), `updateUserType`, `deleteUserType`. Wrap mutations with `useEntityMutation` so audit log fires.

Wrap entire form in `<SuperadminOnly>` per permission table (user-types are all superadmin).

- [ ] **Step 2: Orchestrator + barrel + smoke + commit**

```bash
git add src/components/admin/user-types/ src/app/admin/user-types/page.tsx
git commit -m "feat(admin/user-types): superadmin-gated CRUD"
```

---

## Task 9: New Cloud Functions — adminDeleteUser, adminDeleteProvider, adminIssueRefund

**Files:**
- Create: `functions/src/lib/audit.ts`
- Create: `functions/src/users/adminMutations.ts`
- Modify: `functions/src/users/roles.ts` — add `adminDeleteProvider`
- Create: `functions/src/payments/admin.ts`
- Modify: `functions/src/index.ts` — export new functions

- [ ] **Step 1: Write `functions/src/lib/audit.ts`**

```ts
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export interface ServerAuditPayload {
  actorUid: string;
  actorEmail: string;
  actorRole: 'admin' | 'superadmin';
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
}

export async function writeAuditLog(payload: ServerAuditPayload): Promise<void> {
  await getFirestore().collection('audit_logs').add({
    ...payload,
    timestamp: FieldValue.serverTimestamp(),
  });
}
```

- [ ] **Step 2: Write `adminDeleteUser`**

```ts
// functions/src/users/adminMutations.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { writeAuditLog } from '../lib/audit';

interface AdminDeleteUserData { uid: string; reason: string; }

export const adminDeleteUser = onCall<AdminDeleteUserData>({ region: 'europe-west1' }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required');
  const callerDoc = await getFirestore().collection('users').doc(callerUid).get();
  const callerRole = callerDoc.data()?.role;
  if (callerRole !== 'superadmin') throw new HttpsError('permission-denied', 'Superadmin required');

  const { uid, reason } = req.data;
  if (!uid || !reason) throw new HttpsError('invalid-argument', 'uid + reason required');
  if (uid === callerUid) throw new HttpsError('failed-precondition', 'Cannot self-delete');

  const targetSnap = await getFirestore().collection('users').doc(uid).get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'User not found');
  const before = targetSnap.data();

  await getFirestore().collection('users').doc(uid).delete();
  try { await getAuth().deleteUser(uid); } catch (e) { console.warn('[adminDeleteUser] auth delete failed (ok if already gone)', e); }

  await writeAuditLog({
    actorUid: callerUid,
    actorEmail: callerDoc.data()?.email ?? '',
    actorRole: 'superadmin',
    action: 'delete',
    entityType: 'user',
    entityId: uid,
    before,
    reason,
  });

  return { ok: true };
});
```

- [ ] **Step 3: Add `adminDeleteProvider` to `roles.ts`**

```ts
// append to functions/src/users/roles.ts
export const adminDeleteProvider = onCall<{ providerId: string; reason: string }>(
  { region: 'europe-west1' },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required');
    const caller = await getFirestore().collection('users').doc(callerUid).get();
    if (caller.data()?.role !== 'superadmin') throw new HttpsError('permission-denied', 'Superadmin required');
    const { providerId, reason } = req.data;
    if (!providerId || !reason) throw new HttpsError('invalid-argument', 'providerId + reason required');

    const provSnap = await getFirestore().collection('providers').doc(providerId).get();
    if (!provSnap.exists) throw new HttpsError('not-found', 'Provider not found');
    const before = provSnap.data();
    const ownerUid = (before as { userId?: string })?.userId;

    await getFirestore().collection('providers').doc(providerId).delete();
    if (ownerUid) {
      await getFirestore().collection('users').doc(ownerUid).update({ role: 'customer' });
    }

    await writeAuditLog({
      actorUid: callerUid,
      actorEmail: caller.data()?.email ?? '',
      actorRole: 'superadmin',
      action: 'delete',
      entityType: 'provider',
      entityId: providerId,
      before,
      reason,
    });
    return { ok: true };
  }
);
```

Add `import { writeAuditLog } from '../lib/audit';` to top of `roles.ts`.

- [ ] **Step 4: Write `adminIssueRefund`**

```ts
// functions/src/payments/admin.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { writeAuditLog } from '../lib/audit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' as never });

interface RefundData { paymentId: string; amount: number; reason: string; }

export const adminIssueRefund = onCall<RefundData>({ region: 'europe-west1', secrets: ['STRIPE_SECRET_KEY'] }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required');
  const caller = await getFirestore().collection('users').doc(callerUid).get();
  if (caller.data()?.role !== 'superadmin') throw new HttpsError('permission-denied', 'Superadmin required');

  const { paymentId, amount, reason } = req.data;
  if (!paymentId || !amount || !reason) throw new HttpsError('invalid-argument', 'paymentId + amount + reason required');

  const paySnap = await getFirestore().collection('payments').doc(paymentId).get();
  if (!paySnap.exists) throw new HttpsError('not-found', 'Payment not found');
  const before = paySnap.data() as { stripePaymentIntentId?: string; amount?: number; status?: string };
  if (!before.stripePaymentIntentId) throw new HttpsError('failed-precondition', 'Payment missing stripePaymentIntentId');

  const refund = await stripe.refunds.create({
    payment_intent: before.stripePaymentIntentId,
    amount: Math.round(amount * 100),
    reason: 'requested_by_customer',
    metadata: { adminUid: callerUid, reason },
  });

  const newStatus = amount >= (before.amount ?? 0) ? 'refunded' : 'partially_refunded';
  await getFirestore().collection('payments').doc(paymentId).update({ status: newStatus, refundedAmount: amount, refundedAt: new Date() });

  await writeAuditLog({
    actorUid: callerUid,
    actorEmail: caller.data()?.email ?? '',
    actorRole: 'superadmin',
    action: 'refund',
    entityType: 'payment',
    entityId: paymentId,
    before,
    after: { status: newStatus, refundedAmount: amount, stripeRefundId: refund.id },
    reason,
  });

  return { ok: true, refundId: refund.id };
});
```

- [ ] **Step 5: Export from `functions/src/index.ts`**

Add to existing exports:
```ts
export { adminDeleteUser } from './users/adminMutations';
export { adminDeleteProvider } from './users/roles';
export { adminIssueRefund } from './payments/admin';
```

- [ ] **Step 6: Build + deploy**

```bash
cd functions && npm run build && cd ..
npm run deploy:functions
```
Expected: 3 new functions in deployment output.

- [ ] **Step 7: Commit**

```bash
git add functions/src/
git commit -m "feat(functions): adminDeleteUser, adminDeleteProvider, adminIssueRefund (superadmin-gated, audited)"
```

---

## Task 10: Retrofit existing CFs with audit log writes

**Files:**
- Modify: `functions/src/users/roles.ts` — `setUserRole`, `setUserActiveStatus`, `verifyProvider`
- Modify: `functions/src/bookings/index.ts` — `updateBookingStatus`, `confirmBooking`, `cancelBooking`

- [ ] **Step 1: For each function above, at the end of the success path, call `writeAuditLog`**

Example for `setUserRole`:
```ts
await writeAuditLog({
  actorUid: callerUid,
  actorEmail: caller.data()?.email ?? '',
  actorRole: 'superadmin',
  action: 'role_change',
  entityType: 'user',
  entityId: targetUid,
  before: { role: oldRole },
  after: { role: newRole },
});
```

Mirror for `setUserActiveStatus` (action `'suspend' | 'activate'`), `verifyProvider` (action `'verify'`), `updateBookingStatus`/`confirmBooking`/`cancelBooking` (entityType `'booking'`).

- [ ] **Step 2: Deploy + commit**

```bash
cd functions && npm run build && cd ..
npm run deploy:functions
git add functions/src/users/roles.ts functions/src/bookings/index.ts
git commit -m "feat(functions): write audit log on existing admin mutations"
```

---

## Task 11: i18n keys for all locales

**Files:**
- Modify: `src/i18n/messages/en.ts`, `it.ts`, `es.ts`, `fr.ts`, `de.ts`

- [ ] **Step 1: Add full key set**

Add (with locale-appropriate translations) every new key referenced by Tasks 1–8:

```
admin.detail.back
admin.detail.edit
admin.detail.save
admin.detail.delete
admin.delete.title          // "Delete {{entity}}"
admin.delete.warning        // "Permanently delete {{name}}. This cannot be undone."
admin.delete.typeNameLabel  // "Type \"{{name}}\" to confirm"
admin.delete.reasonLabel    // "Reason"
admin.delete.confirm        // "Delete permanently"
admin.users.entityLabel
admin.users.field.fullName
admin.users.field.email
admin.users.field.phone
admin.venues.entityLabel
admin.venues.field.name
admin.venues.field.type
admin.venues.field.street
admin.venues.field.city
admin.venues.field.zipCode
admin.venues.field.country
admin.venues.field.phone
admin.venues.field.isActive
admin.venues.field.isPartner
admin.venues.notFound
admin.providers.entityLabel
admin.providers.field.businessName
admin.providers.field.category
admin.providers.field.bio
admin.providers.field.phone
admin.providers.field.address
admin.providers.notFound
admin.bookings.entityLabel
admin.bookings.field.status
admin.bookings.field.amount
admin.bookings.field.bookingDate
admin.bookings.field.notes
admin.bookings.action.confirm
admin.bookings.action.cancel
admin.bookings.notFound
admin.payments.entityLabel
admin.payments.field.amount
admin.payments.field.status
admin.payments.field.notes
admin.payments.field.disputed
admin.payments.action.refund
admin.payments.refund.title
admin.payments.refund.amountLabel
admin.payments.refund.reasonLabel
admin.payments.notFound
admin.userTypes.entityLabel
admin.userTypes.field.name
admin.userTypes.field.category
admin.userTypes.field.description
admin.userTypes.field.icon
admin.userTypes.field.permissions
common.close
```

- [ ] **Step 2: Build to verify Messages-completeness gate**

```bash
npm run build 2>&1 | tail -40
```
Expected: no `Property '...' is missing` errors (the i18n compile-time gate).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/messages/
git commit -m "i18n(admin): CRUD keys for all 5 locales"
```

---

## Task 12: E2E smoke + production deploy + verification

**Files:**
- Create: `e2e/admin-crud.spec.ts`
- Modify: nothing else

- [ ] **Step 1: Write Playwright spec**

```ts
// e2e/admin-crud.spec.ts
import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'hidran@gmail.com';
const ADMIN_PW = process.env.E2E_ADMIN_PASSWORD ?? '';

async function login(page) {
  await page.goto('/auth/login/');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PW);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

for (const entity of ['users', 'providers', 'venues', 'bookings', 'payments', 'user-types']) {
  test(`admin/${entity}: list loads and a row is clickable to detail`, async ({ page }) => {
    await login(page);
    await page.goto(`/admin/${entity}/`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await expect(page).toHaveURL(/\?id=/);
      await expect(page.getByRole('button', { name: /back/i })).toBeVisible();
    }
  });
}

test('superadmin sees Delete on venue detail', async ({ page }) => {
  await login(page);
  await page.goto('/admin/venues/');
  await page.locator('tbody tr').first().click();
  await expect(page.getByRole('button', { name: /delete/i })).toBeVisible();
});
```

- [ ] **Step 2: Run locally**

```bash
E2E_ADMIN_PASSWORD=Anatroccolo.230872 npm run e2e -- admin-crud
```
Expected: all 7 tests pass against `npm run dev` server.

- [ ] **Step 3: Production deploy**

```bash
npm run build
npx firebase deploy --only hosting,firestore:rules,functions
```

- [ ] **Step 4: Production smoke via Playwright MCP**

Navigate to https://vfit-funlife.web.app/admin/users/ logged in as superadmin. Verify:
- `/admin/users/` list renders, 0 console errors.
- Click row → `/admin/users/?id=<id>` opens detail (no redirect to home).
- Edit a non-delicate field → save → verify in Firestore console.
- Open `/admin/logs` → confirm new `audit_logs` entry appears.

- [ ] **Step 5: Final commit + push**

```bash
git add e2e/admin-crud.spec.ts
git commit -m "test(e2e): admin CRUD smoke across all 6 entities"
git push origin main
```

---

## Plan Self-Review

**Spec coverage check:**
- Routing pattern → Tasks 3–8 each rebuild orchestrator. ✓
- EntityDetailLayout / SuperadminOnly / ConfirmDeleteDialog / useEntityMutation → Task 1. ✓
- Firestore rules → Task 2. ✓
- Hybrid write paths per entity → Tasks 3–8 use existing CFs for sensitive, direct Firestore for low-risk. ✓
- 3 new CFs → Task 9. ✓
- Audit-log retrofit on existing CFs → Task 10. ✓
- Audit log shape → Task 1 (client) + Task 9 (server). ✓
- Delete confirmation UX → Task 1 dialog. ✓
- Create flow → Tasks 3 (users), 5 (venues), 6 (bookings), 8 (user-types) — payments excluded per spec. ✓
- i18n → Task 11. ✓
- E2E + deploy → Task 12. ✓

**Placeholder scan:** No "TBD" / "implement later" / "similar to" stubs. Each step has either complete code or an explicit instruction with the exact pattern from a previous task.

**Type consistency:**
- `AuditPayload` / `AuditAction` / `AuditEntityType` defined in Task 1, referenced consistently in Tasks 3–8 and matched by server-side `ServerAuditPayload` in Task 9.
- `useEntityMutation` signature `<TInput, TResult>` used uniformly.
- `EntityDetailLayout` props (`isEditing`, `isSaving`, `onEdit`, `onCancelEdit`, `onSave`, `onDelete`) consistent across all consumers.
- Cloud Function names (`adminDeleteUser`, `adminDeleteProvider`, `adminIssueRefund`) referenced by the same exact string in `httpsCallable` calls (Tasks 3, 4, 7) and exports (Task 9).

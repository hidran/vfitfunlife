# Admin CRUD — Design Spec

**Date:** 2026-05-28
**Status:** Approved, ready for implementation planning
**Cycle:** C2 (admin dashboard)

## Goal

Enable superadmin/admin staff to perform Create, Read, Update, Delete operations on every primary entity in the VFit dashboard (`users`, `providers`, `venues`, `bookings`, `payments`, `user-types`) — with consistent UX, role-gated deletes, full audit trail, and working static-export-compatible routing.

## Problem

Two concrete defects + two structural gaps:

1. **Broken edit routes.** `/admin/users/[id]/page.tsx` and `/admin/providers/[id]/page.tsx` use Next.js dynamic routes with `dynamicParams = false`. Under `next.config.js` `output: 'export'`, only the placeholder `/admin/users/dummy/` is statically generated. Any real Firestore ID resolves to the static 404, which the app shell routes back to home. **Symptom:** clicking a user row "redirects to home".
2. **Missing CRUD surfaces.** `venues`, `bookings`, `payments`, `user-types` have list views only — no detail/edit/create/delete UI.
3. **No unified permission model in UI.** Delete buttons in `UserDetailClient` are visible to any admin; no role gate.
4. **No audit trail.** Mutations from admin pages write directly to Firestore without an `audit_logs` entry.

## Non-Goals (out of scope this cycle)

- Bulk edit beyond the existing user activate/suspend/delete actions.
- Inline-row editing in the data tables.
- Field-level audit diffs surfaced in the `/admin/logs` UI (collection writes happen now; viewer enhancements are a separate cycle).
- Generic `<EntityForm>` code-generation abstraction. Each entity gets its own form component — fields differ too much for premature abstraction.
- Mobile-app admin views (admin is desktop-first per `docs/features.md`).

## Architecture

### Routing — query-string detail pages

All entity routes collapse to a single `page.tsx` per entity that switches mode by `useSearchParams()`:

| URL | Mode | Component |
|---|---|---|
| `/admin/{entity}/` | List | `{Entity}ListView` |
| `/admin/{entity}/?id=new` | Create | `{Entity}FormView mode="create"` |
| `/admin/{entity}/?id=<firestoreId>` | Detail/Edit | `{Entity}DetailView` |

This is the same pattern recorded in the `static-export-dynamic-routes` memory. The existing `[id]` folders for `users` and `providers` are deleted; their logic ports into `src/components/admin/{entity}/`.

### Per-entity orchestrator pattern

```tsx
// src/app/admin/users/page.tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { UsersListView, UserDetailView, UserFormView } from '@/components/admin/users';

export default function UsersPage() {
  const id = useSearchParams().get('id');
  if (!id) return <UsersListView />;
  if (id === 'new') return <UserFormView mode="create" />;
  return <UserDetailView userId={id} />;
}
```

Every admin entity page follows this exact shape.

### Shared building blocks (`src/components/admin/`)

- **`EntityDetailLayout`** — Back button + page header + Edit/Save/Delete action bar + tabs slot. The shell every detail view uses.
- **`ConfirmDeleteDialog`** — Modal requiring the user to type the entity's display name to enable the Delete button. Two-step destructive confirmation.
- **`SuperadminOnly`** — Wrapper component; renders children iff `useAuthStore().user?.role === 'superadmin'`. Used to hide Delete buttons and delicate-field inputs from non-superadmin admins.
- **`useEntityMutation`** — TanStack `useMutation` wrapper. Takes `{ mutate: () => Promise<void>, audit: AuditPayload, invalidateKeys: QueryKey[] }`. On success: writes audit log, invalidates queries, shows toast.
- **`auditLog.ts`** — `recordAudit(payload)` helper. Writes to `audit_logs/{autoId}` with actor info pulled from `useAuthStore`.

### Per-entity components

Each entity gets three components in `src/components/admin/{entity}/`:
- `{Entity}ListView.tsx` — ports the existing list-page logic
- `{Entity}DetailView.tsx` — view + edit toggle, uses `EntityDetailLayout`
- `{Entity}FormView.tsx` — controlled form, React Hook Form + Zod, shared by create and edit modes

For `users` and `providers`, port logic from existing `UsersPage`/`UserDetailClient` and `ProvidersPage`/`ProviderDetailClient`.

## Permission Model

| Operation | admin | superadmin |
|---|---|---|
| Read all entities | ✓ | ✓ |
| Update non-delicate fields (name, address, phone, photos, notes, tags, descriptions) | ✓ | ✓ |
| Status transitions (booking confirm/cancel, user suspend/activate) | ✓ | ✓ |
| Role changes (set user role) | ✗ | ✓ |
| Provider verification toggle | ✗ | ✓ |
| Payment refund issuance | ✗ | ✓ |
| Booking financial-field edits (amount, customer attribution) | ✗ | ✓ |
| Delete any entity | ✗ | ✓ |
| User-type schema mutations | ✗ | ✓ |

Enforcement is two-layered:
1. **UI:** `SuperadminOnly` hides UI controls for non-superadmin staff.
2. **Firestore rules + Cloud Functions:** server-side gating mirrors the UI policy. Even if a client crafts a request, the rule/function rejects it.

### Firestore rules helpers (added to `firestore.rules`)

```
function isStaff()      { return request.auth.token.role in ['admin', 'superadmin']; }
function isSuperadmin() { return request.auth.token.role == 'superadmin'; }
```

Per collection:

| Collection | read | create | update | delete |
|---|---|---|---|---|
| `users` | isStaff() | (existing self-create) | isStaff() (excl. role, isVip) + isSuperadmin() (any field) | isSuperadmin() |
| `providers` | isStaff() | isStaff() | isStaff() (excl. verified) + isSuperadmin() (any field) | isSuperadmin() |
| `venues` | isStaff() | isStaff() | isStaff() | isSuperadmin() |
| `bookings` | isStaff() | (existing user create) | isStaff() (status only) + isSuperadmin() (financial fields) | isSuperadmin() |
| `payments` | isStaff() | (CF only) | isSuperadmin() (notes, disputed flag) | false (ledger immutable) |
| `user_types` | public | isSuperadmin() | isSuperadmin() | isSuperadmin() |
| `audit_logs` | isStaff() | isStaff() | false | false |

Where rule conditions need to check "which fields are being changed", use `request.resource.data.diff(resource.data).affectedKeys()` with allowed-key sets.

## Write paths per entity

Hybrid: existing Cloud Functions for sensitive ops, direct Firestore writes (rules-gated) for low-risk fields.

| Entity | Update path | Delete path |
|---|---|---|
| **users** | Non-delicate fields → direct Firestore. Role change → existing `setUserRole` CF. Suspend/activate → existing `setUserActiveStatus` CF. | New CF `adminDeleteUser` (superadmin-gated, also deletes Auth record) |
| **providers** | Non-delicate fields → direct Firestore or existing `updateProviderProfile` CF. Verification → existing `verifyProvider` CF. | New CF `adminDeleteProvider` (superadmin-gated) |
| **venues** | Direct Firestore write (rules: `isStaff()`) | Direct Firestore delete (rules: `isSuperadmin()`) |
| **bookings** | Status → existing `updateBookingStatus` / `confirmBooking` / `cancelBooking` CFs. Financial fields → direct Firestore (rules require superadmin). | Direct Firestore delete (rules: `isSuperadmin()`). NB: deleting a booking is semantically unusual — UI labels this "Permanently remove" and warns. |
| **payments** | Notes/dispute flag → direct Firestore. Refund → new CF `adminIssueRefund` (calls Stripe + writes ledger row). | Not allowed (rules: `delete: false`). |
| **user-types** | Existing `updateUserType` CF. | Direct Firestore delete (rules: `isSuperadmin()`). |

### New Cloud Functions (3)

1. **`adminDeleteUser`** (`functions/src/users/adminMutations.ts`)
   - Input: `{ uid: string, reason: string }`
   - Auth: superadmin only
   - Action: delete Firestore `users/{uid}` doc, delete Auth user, cancel active bookings, write audit log.
2. **`adminDeleteProvider`** (add to `functions/src/users/roles.ts`)
   - Input: `{ providerId: string, reason: string }`
   - Auth: superadmin only
   - Action: delete `providers/{id}` doc, demote user role to 'customer', write audit log.
3. **`adminIssueRefund`** (`functions/src/payments/admin.ts`)
   - Input: `{ paymentId: string, amount: number, reason: string }`
   - Auth: superadmin only
   - Action: call Stripe refund API, write new `payments/{refundId}` ledger row, update original payment status to 'refunded' or 'partially_refunded', write audit log.

## Audit Trail

New collection `audit_logs/{autoId}` written on every admin mutation:

```ts
interface AuditLogEntry {
  actorUid: string;
  actorEmail: string;
  actorRole: 'admin' | 'superadmin';
  action: 'create' | 'update' | 'delete' | 'refund' | 'verify' | 'suspend' | 'activate' | 'role_change';
  entityType: 'user' | 'provider' | 'venue' | 'booking' | 'payment' | 'user_type';
  entityId: string;
  before?: Record<string, unknown>;   // present for update + delete
  after?: Record<string, unknown>;    // present for create + update
  reason?: string;                     // free-text from operator (required for delete + refund + suspend)
  timestamp: FirebaseFirestore.Timestamp;
}
```

Written by:
- **Direct Firestore writes** via the `useEntityMutation` hook's success callback. The hook accepts an `audit: AuditPayload` argument and writes the entry after the main mutation succeeds.
- **Cloud Functions** (`adminDeleteUser`, `adminDeleteProvider`, `adminIssueRefund`) write their own entries server-side via the Admin SDK.
- **Existing Cloud Functions** (`setUserRole`, `setUserActiveStatus`, `verifyProvider`, `updateBookingStatus`) — extended to write audit entries (currently silent).

## Delete confirmation UX

`ConfirmDeleteDialog` flow:

1. User clicks the Delete button (only rendered inside `<SuperadminOnly>`).
2. Modal opens with: entity name, irreversibility warning, free-text "reason" field (required), and a text input that must exactly match the entity's display name before the Delete button enables.
3. On confirm: call the delete path (CF or direct Firestore). On success: toast + redirect to the list view.

## Create flow

`/admin/{entity}/?id=new` renders `{Entity}FormView mode="create"` with the same fields as edit mode. On Save:
1. POST to the create path.
2. On success, `router.replace('/admin/{entity}/?id=' + newDocId)`.

## Files

### Delete

- `src/app/admin/users/[id]/page.tsx`, `UserDetailClient.tsx` (entire `[id]` folder)
- `src/app/admin/providers/[id]/page.tsx`, `ProviderDetailClient.tsx` (entire `[id]` folder)

### Modify

- `src/app/admin/users/page.tsx` — collapse to orchestrator (~20 lines)
- `src/app/admin/providers/page.tsx` — same
- `src/app/admin/venues/page.tsx` — same
- `src/app/admin/bookings/page.tsx` — same
- `src/app/admin/payments/page.tsx` — same
- `src/app/admin/user-types/page.tsx` — same
- `firestore.rules` — add helpers + per-collection update/delete rules + `audit_logs` rules
- `functions/src/users/roles.ts` — add `adminDeleteProvider`; add audit-log writes to `setUserRole` + `setUserActiveStatus` + `verifyProvider`
- `functions/src/bookings/index.ts` — add audit-log writes to `updateBookingStatus`/`confirmBooking`/`cancelBooking`
- `functions/src/index.ts` — export the new functions

### Create

**Shared:** `src/components/admin/`
- `EntityDetailLayout.tsx`
- `ConfirmDeleteDialog.tsx`
- `SuperadminOnly.tsx`
- `useEntityMutation.ts`
- `auditLog.ts`

**Per entity:** `src/components/admin/{entity}/` for users / providers / venues / bookings / payments / user-types
- `{Entity}ListView.tsx` (ports existing list logic)
- `{Entity}DetailView.tsx` (view + edit toggle)
- `{Entity}FormView.tsx` (React Hook Form + Zod)
- `index.ts` (barrel export)

**Cloud Functions:**
- `functions/src/users/adminMutations.ts` — `adminDeleteUser`
- `functions/src/payments/admin.ts` — `adminIssueRefund`

**i18n keys:** new keys for each entity's form labels, confirm dialog copy, delete warnings, toast messages — added to all 5 locales (it, en, es, fr, de).

## Testing

- **E2E (Playwright):** one happy-path test per entity covering List → Detail → Edit → Save → Verify the change persisted. One delete test per entity (logged in as superadmin). One role-gate test (admin sees no Delete button on at least one entity).
- **Unit (Vitest):** `useEntityMutation` hook — verifies audit log written, invalidation happens, toast fires, error path doesn't write audit log.
- **Cloud Functions tests:** auth-rejection tests for the 3 new CFs (non-superadmin caller → permission error).
- **Manual smoke** in production after deploy: log in as hidran@gmail.com, edit one user (non-delicate field), edit one venue, attempt one delete, verify audit log entry appears in `/admin/logs`.

## Risk & mitigations

| Risk | Mitigation |
|---|---|
| Admin clicks Delete on a critical record | Typed-name confirmation + superadmin-only + immutable audit log |
| Firestore rules diverge from UI policy | Both layers tested; CI rule emulator tests in a follow-up cycle |
| Booking financial-field edit breaks ledger consistency | Audit log captures before/after; superadmin-only; future cycle adds derived "reconciliation" view in `/admin/logs` |
| Direct Firestore writes from admin bypass business logic in Cloud Functions | Scoped to low-risk fields only; sensitive ops still funneled through CFs |
| Audit log write fails after main mutation succeeds | `useEntityMutation` logs error to console + Sentry but doesn't roll back — audit log is best-effort accountability, not transactional integrity. Acceptable for v1. |

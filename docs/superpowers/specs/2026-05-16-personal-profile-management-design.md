# Personal Profile Management (Cycle C1)

**Status:** ✅ Shipped 2026-05-16
**Created:** 2026-05-16
**Parent initiative:** Close API/backend gaps — sub-cycle 1 of 2 (C1 = personal profile; C2 = provider credentials, to follow)
**Owner:** TBD
**Stack impact:** Cloud Functions (`functions/src/users/`), Firestore + Storage rules, frontend (`src/app/(main)/profile/`, `src/components/profile/`)

---

## 1. Goal

Ship the 4 backend functions and their UI so any authenticated user can self-service-manage four personal profile facets: **avatar**, **social links**, **notification preferences**, **privacy settings**.

This closes 4 of the ~30 vapor functions currently flagged in `docs/api/reference.md`. Permission boundary is "owner self-write only" — applies to customers and providers alike (provider-specific fields are deferred to cycle C2).

### Success criteria

A logged-in user can:

1. Upload a new avatar from the profile edit screen on web or native; the image appears on their profile within ~2 seconds; the previous avatar is removed from Storage.
2. Add/edit/remove social links (Instagram, Facebook, X/Twitter, LinkedIn, TikTok, website) with per-platform URL validation.
3. Toggle notification preferences per channel (push, email, SMS) per event class (booking, promotion, system, chat, weekly digest, reminder) and have those preferences honored by the existing notification dispatch path.
4. Control profile visibility (`public` / `verified_only` / `private`), choose whether email and phone are visible to other users, allow or disallow direct messages, and opt in/out of analytics tracking.
5. All four actions emit audit log entries.
6. Existing `notificationsEnabled` boolean on user docs is migrated transparently to the new shape on first touch.

### Non-goals

- Provider-only fields (certifications, education, availability) — cycle C2.
- Phone re-verification (existing TODO in `src/app/(main)/profile/verify-phone/page.tsx`).
- Email change flow with re-verification.
- Account deletion / GDPR right-to-be-forgotten.
- Wiring CI/CD for the new tests (production-readiness cycle).
- Scheduled job to sweep orphan avatar Storage objects (hardening cycle).
- Retroactive enforcement of `privacySettings.profileVisibility` in `getProvider`/`listProviders` reads (downstream read code; this cycle only writes the field).
- Designing new wireframes — UI extends existing `/profile/edit` and adds settings sub-routes consistent with the current design system.

---

## 2. Architecture

### Boundary with existing code

- Existing `updateProfile` (in `functions/src/users/index.ts`) **stays**. It owns core identity fields (fullName, phone, email, DOB). The 4 new functions are **siblings**, each narrow.
- Each new function is a callable (`onCall`) in a **new file** `functions/src/users/profile.ts`, re-exported through `functions/src/users/index.ts` → `functions/src/index.ts`.
- Region: `europe-west1` (matches existing functions).
- Validation: Zod schemas shared between frontend forms and backend handlers. Source of truth: `src/types/profile.ts`. Functions import from it via a relative path (`../../src/types/profile`); if the functions tsconfig cannot resolve outside its `rootDir` cleanly, copy the schemas into `functions/src/types/profile.ts` and add a CI lint to fail when the two files diverge (the plan will pick one definitively after a 5-min spike).

### Data shapes (definitive)

Added to `functions/src/types.ts` and mirrored in `src/types/profile.ts`:

```ts
export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  twitter?: string;   // accepts twitter.com and x.com URLs
  linkedin?: string;
  tiktok?: string;
  website?: string;   // arbitrary HTTPS URL
}

export type ProfileVisibility = 'public' | 'verified_only' | 'private';

export interface NotificationSettings {
  push: {
    booking: boolean;
    promotion: boolean;
    system: boolean;
    chat: boolean;
  };
  email: {
    booking: boolean;
    promotion: boolean;
    system: boolean;
    chat: boolean;
    weeklyDigest: boolean;
  };
  sms: {
    booking: boolean;
    reminder: boolean;
  };
}

export interface PrivacySettings {
  profileVisibility: ProfileVisibility;
  showEmail: boolean;
  showPhone: boolean;
  allowDirectMessages: boolean;
  shareAnalytics: boolean;
}
```

All four mount on `users/{uid}` as `avatarUrl: string`, `socialLinks: SocialLinks`, `notificationSettings: NotificationSettings`, `privacySettings: PrivacySettings`. Replacement semantics throughout (no merge).

### Migration of `notificationsEnabled`

On the first call to `updateNotificationSettings` for a given user:

1. Read the user doc.
2. If `notificationsEnabled` field is present, treat the new write as authoritative regardless of the legacy field, and delete the legacy field in the same write (via `FieldValue.delete()`).
3. If no `notificationSettings` exists and a non-write read happens (in other parts of the codebase), code should fall back to defaults: every channel × event = `notificationsEnabled` value if legacy field is true, else `false`.

Migration is **on-demand** (first write), not a batch job. Acceptable because the legacy field only ever resolved to a single boolean.

### Boundaries / interfaces

- **Function ↔ Firestore**: each function writes only to `users/{uid}` and `auditLogs/{autoId}` in a single transaction. No reads of other users' data.
- **Function ↔ Storage**: only `updateAvatar` touches Storage, and only to delete the previous file after the Firestore write succeeds.
- **Frontend ↔ Function**: TanStack Query mutations call each function via `httpsCallable`. No Zustand store touched.
- **Frontend ↔ Storage**: only `AvatarUploader` uploads directly via Firebase Storage SDK using current user creds.

---

## 3. Backend Detail

### File: `functions/src/users/profile.ts` (new)

```ts
export const updateAvatar = onCall<UpdateAvatarData>(
  { region: 'europe-west1' }, async (request) => { /* ... */ }
);

export const updateSocialLinks = onCall<UpdateSocialLinksData>(
  { region: 'europe-west1' }, async (request) => { /* ... */ }
);

export const updateNotificationSettings = onCall<UpdateNotificationSettingsData>(
  { region: 'europe-west1' }, async (request) => { /* ... */ }
);

export const updatePrivacySettings = onCall<UpdatePrivacySettingsData>(
  { region: 'europe-west1' }, async (request) => { /* ... */ }
);
```

### Function contracts

| Function | Input | Output | Auth |
|---|---|---|---|
| `updateAvatar` | `{ avatarUrl: string }` | `{ success: true, avatarUrl: string, previousUrl: string \| null }` | authenticated; writes own doc only |
| `updateSocialLinks` | `{ socialLinks: SocialLinks }` | `{ success: true }` | authenticated; writes own doc only |
| `updateNotificationSettings` | `{ settings: NotificationSettings }` | `{ success: true }` | authenticated; writes own doc only |
| `updatePrivacySettings` | `{ settings: PrivacySettings }` | `{ success: true }` | authenticated; writes own doc only |

### Validation rules

- **Avatar URL**: must match regex `^https://firebasestorage\.googleapis\.com/v0/b/[^/]+/o/avatars%2F<uid>%2F[^?]+(\?.*)?$` where `<uid>` is the caller's uid. Reject otherwise with `invalid-argument`.
- **Social links**: per-platform regex (see Appendix A). Empty string clears that link. Unknown keys rejected by Zod strict mode.
- **Notification / privacy settings**: strict Zod shape, no unknown keys, no missing required keys (full-object replacement requires complete payload).

### Audit logging

Each successful call writes one document to `auditLogs/{autoId}`:

```ts
{
  uid: string;          // affected user (same as actor for self-writes)
  actor: string;        // caller uid
  action: 'profile.avatar.update' | 'profile.social.update' 
        | 'profile.notifications.update' | 'profile.privacy.update';
  changes: { before: unknown; after: unknown };
  timestamp: FirebaseFirestore.Timestamp;
  ip?: string;          // from rawRequest if available
  userAgent?: string;   // from rawRequest if available
}
```

Audit write happens in the same Firestore transaction as the user doc update. If the audit write fails, the whole function fails (atomic).

### Error model

Standard `HttpsError` types only:

- `unauthenticated` — no `request.auth`
- `invalid-argument` — Zod validation failure or avatar URL bucket mismatch
- `permission-denied` — caller attempting to write a different uid (defense in depth; shouldn't be reachable since functions only write own)
- `internal` — Firestore/Storage failure

### Firestore rules update (`firestore.rules`)

Extend the `users/{userId}` update rule:

```javascript
match /users/{userId} {
  // ... existing rules ...
  
  allow update: if isOwner(userId) && 
    request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly([
        'avatarUrl', 'socialLinks', 'notificationSettings', 
        'privacySettings', 'updatedAt'
      ]);
  
  // Existing admin/superadmin update rule unchanged.
}
```

Existing self-update paths for identity fields (handled by `updateProfile`) continue to bypass this rule because `updateProfile` runs with admin SDK in the function context.

### Storage rules update (`storage.rules`)

```javascript
match /avatars/{uid}/{file} {
  allow read: if true;  // public
  allow write: if request.auth != null
                && request.auth.uid == uid
                && request.resource.size < 5 * 1024 * 1024
                && request.resource.contentType.matches('image/.*');
}
```

---

## 4. Frontend Detail

### Routes

- **Extend** `src/app/(main)/profile/edit/page.tsx` with 4 new sections (anchored): `#avatar`, `#social`, `#notifications`, `#privacy`. Tabbed nav on desktop (≥md), accordion on mobile.
- **New** `src/app/(main)/profile/settings/notifications/page.tsx` — dedicated full-screen settings page; same form component as the section in `/profile/edit`. Deep-link target from notification inbox "Notification preferences" link.
- **New** `src/app/(main)/profile/settings/privacy/page.tsx` — same pattern.
- Avatar and social links live only in `/profile/edit` (no dedicated route — too lightweight to warrant one).

### New components (`src/components/profile/`)

| Component | Responsibility |
|---|---|
| `AvatarUploader.tsx` | File picker (`@capacitor/camera` on native, `<input type="file">` on web), client-side resize-to-512×512 (canvas API, auto-center-crop, no UI crop tool in v1), preview, upload progress bar, error states. |
| `SocialLinksForm.tsx` | RHF + Zod; one input per platform with platform icon, URL validation, optimistic save. |
| `NotificationSettingsForm.tsx` | Matrix layout (channels × event types), toggle switches, single Save button. Confirmation toast on success. |
| `PrivacySettingsForm.tsx` | Radio group for `profileVisibility`, toggles for the rest. Inline help text per setting. |

All components use the existing design system (Tailwind v4 tokens, shadcn/ui primitives). No new tokens or design language.

### State / data flow

- TanStack Query mutations for each save (`useMutation`).
- On success: invalidate the user profile query (`['user', uid]`), show toast, navigate back if on dedicated settings page.
- Optimistic updates for toggles (notification/privacy); rollback on error with toast.
- Avatar uses pessimistic update (wait for server) because we want the returned `avatarUrl` to confirm.

### i18n

All new strings under `profile.settings.*` keys in `src/i18n/<locale>/profile.json` (file may need to be created if not present in current locale tree). All three locales (`it`, `en`, `es`) must be populated before merge.

### Accessibility

- Form labels via `htmlFor`/`id`
- Error messages via `aria-describedby`
- Toggle switches use `role="switch"` + `aria-checked`
- Focus restored to triggering element after modal/sheet close
- Touch targets minimum 44×44 px (matches CLAUDE.md guideline)

### Mobile

- `@capacitor/camera` invoked on `Capacitor.isNativePlatform()`; web falls back to file input.
- Safe-area insets honored on settings sub-routes (already supported by existing layouts).

---

## 5. Testing

### Backend unit tests (`functions/test/profile.test.ts`)

For each of the 4 functions:

- Happy path: valid input → Firestore updated, audit log written, expected return shape.
- Unauthenticated → `unauthenticated` HttpsError.
- Validation failure (per shape) → `invalid-argument`.
- Avatar-specific:
  - URL outside our bucket → reject.
  - URL with wrong uid segment → reject.
  - Previous-avatar deletion failure → function still succeeds, warning logged.
- Notification migration:
  - User doc with `notificationsEnabled: true` → first call writes `notificationSettings` and deletes legacy field in same op.
- Audit log: written for every successful call; fails atomically with user doc.

Test runner: Vitest (already configured for `functions/` per `package.json`). Use Firebase Functions test SDK (`firebase-functions-test`) for mocking callable context.

### Firestore rules tests (`functions/test/profile-rules.test.ts`)

Using `@firebase/rules-unit-testing`:

- Owner can update only the 4 new fields + `updatedAt`. Updating `fullName` via the new self-update path is rejected.
- Non-owner cannot update.
- Admin/superadmin update path (existing rule) still allows arbitrary field updates.

### Frontend tests

- **Vitest** for each new form component: valid submit triggers mutation, validation errors render, save triggers query invalidation.
- **Playwright E2E** (`e2e/profile-settings.spec.ts`):
  - Log in as customer → navigate to `/profile/edit` → upload fixture avatar → see preview update → reload → still there.
  - Edit social links → save → reload → persisted.
  - Toggle notification preferences → save → reload → persisted.
  - Change privacy settings → save → reload → persisted.

Tests use the existing Playwright config and `e2e/` directory. No CI wiring in this cycle.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Storage upload + Firestore write race (user uploads, then drops connection before calling `updateAvatar`) | Orphan file in Storage; cleanup deferred to scheduled job (hardening cycle). Storage cost impact is small (5 MB cap × few users). |
| `notificationsEnabled` migration unintended side effects (some part of code reads legacy field directly) | Plan task: grep codebase for `notificationsEnabled` reads and update them to read `notificationSettings` with fallback. |
| Zod schema duplication between `functions/` and `src/` if shared module not configured | Plan task: verify TS path config or duplicate the schemas (single source of truth preferred; if path config blocks it, document the duplication). |
| Privacy settings `profileVisibility` not enforced in read code | Explicitly out of scope. Documented as known gap; cycle C2 or a follow-up "privacy enforcement" cycle handles. |
| Avatar URL trusted from client could be abused (e.g. pointing at someone else's path) | Backend regex validates bucket + uid path segment matches caller's uid. |
| Capacitor camera plugin permissions vary by OS version | Use existing permissions screen at `/auth/permissions` (already in the auth flow); document the required `NSCameraUsageDescription` (iOS) and `READ_MEDIA_IMAGES` (Android 13+) — should already be configured given camera is already a listed plugin. |

---

## 7. Out of Scope (Deferred)

- Cycle C2 (Provider Credentials) — certifications, education, availability.
- Phone re-verification (existing TODO).
- Email change flow.
- Account deletion / GDPR.
- CI/CD wiring.
- Orphan avatar cleanup scheduled job.
- `profileVisibility` enforcement in `getProvider`/`listProviders` reads.

---

## Appendix A — Social link URL regexes

| Platform | Regex (case-insensitive) |
|---|---|
| Instagram | `^https?://(www\.)?instagram\.com/[A-Za-z0-9._-]+/?$` |
| Facebook | `^https?://(www\.)?facebook\.com/[A-Za-z0-9.-]+/?$` |
| Twitter | `^https?://(www\.)?(twitter|x)\.com/[A-Za-z0-9_]+/?$` |
| LinkedIn | `^https?://(www\.)?linkedin\.com/(in|company)/[A-Za-z0-9_-]+/?$` |
| TikTok | `^https?://(www\.)?tiktok\.com/@[A-Za-z0-9._-]+/?$` |
| Website | `^https?://[^\s]+\.[^\s]+$` (loose; HTTPS preferred but HTTP allowed for dev) |

---

## Appendix B — Default `NotificationSettings` and `PrivacySettings`

Used when a user doc has neither the new fields nor the legacy `notificationsEnabled`:

```ts
const defaultNotificationSettings: NotificationSettings = {
  push:  { booking: true,  promotion: false, system: true,  chat: true },
  email: { booking: true,  promotion: false, system: true,  chat: false, weeklyDigest: false },
  sms:   { booking: true,  reminder: true },
};

const defaultPrivacySettings: PrivacySettings = {
  profileVisibility: 'public',
  showEmail: false,
  showPhone: false,
  allowDirectMessages: true,
  shareAnalytics: true,
};
```

When migrating from `notificationsEnabled: true`, the default above is used as-is (all reasonable defaults active). When `notificationsEnabled: false`, every channel × event flag is set to `false`.

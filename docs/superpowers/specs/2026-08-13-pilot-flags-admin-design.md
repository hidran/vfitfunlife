# Superadmin Pilot-Flag Panel — Design Spec

**Date:** 2026-08-13
**Status:** Approved (design)
**Author:** Hidran Arias (with Claude Code)
**Follows:** `2026-08-09-pilot-feature-flags-design.md`

## 1. Summary

The pilot flags added on 2026-08-09 live only in the Firebase console. A superadmin looking for
"where do I turn VFun and VLife on" finds nothing in `/admin` — and worse, finds a **Feature
Flags panel that does nothing**, which the original spec's own risk table predicted:

> *"The dead `featureFlags` settings UI now sits next to a real flag system … two flag
> mechanisms, one of which does nothing, is a trap."*

This spec replaces that trap with a real control, and deletes the dead mechanism.

## 2. Current state

Live Remote Config template on `vfit-funlife` (version 3, published 2026-08-09 via REST):

| Parameter | Value |
|---|---|
| `pilot_mode` | `true` |
| `show_vfun` | `false` |
| `show_vlife` | `false` |
| `pilot_city` | `Torino` |

The dead mechanism is confined to four places: `PlatformSettings.featureFlags`
(`src/types/admin.ts:92`), the hardcoded defaults and `handleFeatureToggle` in
`src/app/admin/settings/page.tsx`, `featureFlags: {}` in `src/lib/firebase/admin.ts:518`, and
four `admin.settings.featureFlags.*` keys per locale. Nothing reads it at runtime.

## 3. Why a Cloud Function

Remote Config has no client write API — publishing is admin-only. `firebase-admin@12.7.0`,
already a dependency of `functions/`, exposes `getTemplate` / `validateTemplate` /
`publishTemplate` / `listVersions` / `rollback`, so this needs no raw REST and no
service-account key handling.

The panel must also **read** through the callable rather than through `usePilotFlags`. The
client SDK returns throttled, cached values; a panel reading those would show the old value
immediately after a successful publish. The callable returns live server truth.

## 4. Backend — `functions/src/config/pilotFlags.ts`

Two callables, `region: "europe-west1"`, modelled on `functions/src/payments/admin.ts`.

**`getPilotFlagsAdmin`** — superadmin gate; returns the four whitelisted values plus
`versionNumber`, `updateTime` and `updateUser.email` so the panel can show who last changed what.

**`setPilotFlags`** — superadmin gate; accepts a partial of the four, then
`getTemplate` → mutate → `validateTemplate` → `publishTemplate`.

A hardcoded whitelist carries each key's type, default and description:

```ts
const PILOT_FLAGS = {
  pilot_mode: { valueType: "BOOLEAN", description: "…" },
  show_vfun:  { valueType: "BOOLEAN", description: "…" },
  show_vlife: { valueType: "BOOLEAN", description: "…" },
  pilot_city: { valueType: "STRING",  description: "…" },
} as const;
```

Any key outside it is rejected with `invalid-argument`. This is what stops the panel becoming a
raw Remote Config editor able to damage unrelated parameters. If a whitelisted parameter has
been deleted from the console, the callable recreates it from this table rather than failing.

Two details that break the template if missed:

- Remote Config parameter values are **strings**. Booleans serialise as `"true"` / `"false"`
  with `valueType: "BOOLEAN"`; writing a JS boolean produces an invalid template.
- `publishTemplate` sends the template's ETag as `If-Match` unless `{ force: true }`. We do
  **not** force, so two superadmins editing concurrently produce a conflict instead of a silent
  clobber. That maps to `HttpsError("aborted")`, and the panel re-reads and asks for a retry.

## 5. Audit

`writeAuditLog` with `action: "update"`, `entityId: "pilot_flags"`, and `before` / `after`
holding all four values. `"feature_flag"` is added to the `entityType` union in
`functions/src/lib/audit.ts`.

Noted, not fixed: `ServerAuditPayload.entityType` and the client's `AuditEntityType` in
`src/components/admin/auditLog.ts` have already drifted — the client has `service_category`,
the server has `migration` / `ai_settings` / `ai_plan` / `recipe`. This audit is written
server-side, so only the server union matters here.

## 6. Frontend

| File | Responsibility |
|---|---|
| `src/lib/firebase/pilotFlagsAdmin.ts` | **Create.** Typed `httpsCallable` wrappers, in the style of `src/lib/firebase/functions.ts` |
| `src/hooks/usePilotFlagsAdmin.ts` | **Create.** `useQuery(['pilot-flags-admin'])` + `useMutation` invalidating it |
| `src/app/admin/settings/page.tsx` | **Modify.** Replace the fake Feature Flags card with the real one |

The card has **its own Save button**, separate from the page's existing one. The page's
`handleSave` writes `PlatformSettings` to Firestore; pilot flags go to Remote Config over a
different path with different failure modes, and one button spanning both would make partial
failure unreadable.

Toggles stage locally until Save, so one deliberate change produces one Remote Config version
rather than one per click — which keeps version history legible for rollback.

Enabling `show_vfun` / `show_vlife` makes a section publicly visible, so Save shows a
confirmation listing the exact diff before publishing.

A footer line shows the last published version, timestamp and author, read from the template, so
the panel reflects the server rather than what was last typed.

## 7. Propagation

`minimumFetchIntervalMillis` in `src/lib/firebase/remoteConfig.ts` drops from `60 * 60 * 1000`
to `5 * 60 * 1000` in production. Development stays at 0.

**Honest limit, stated in the UI copy:** `usePilotFlags` caches resolved flags in a module-level
variable for the lifetime of a page load, so a user with the app already open will not see a
change until they reload. The five minutes governs *new* loads. The copy therefore reads
"visible to users the next time they open the app, within about 5 minutes" — not "within 5
minutes", which the code does not guarantee. Making live clients re-poll is a separate change.

## 8. Deletions

The dead `featureFlags` mechanism is removed entirely: the field from `PlatformSettings`, the
`{}` from `src/lib/firebase/admin.ts:518`, the defaults and `handleFeatureToggle` from the
settings page, and `admin.settings.featureFlags.*` from all five locales. New
`admin.settings.pilot.*` keys replace them.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Runtime service account lacks `firebaseremoteconfig.admin` | Covered by the default Editor role on the gen-2 compute SA; the API is enabled (version 3 was published via REST). The callable catches this failure specifically and returns a message naming the missing permission rather than a generic error |
| Concurrent edits by two superadmins | ETag `If-Match`, no `force`; conflict surfaces as `aborted` and the panel re-reads |
| Panel used to edit arbitrary parameters | Hardcoded whitelist; unknown keys rejected |
| A section enabled while its content is still empty | Flags are independent and instantly revertible; the confirm dialog states what is about to become public |

No Firestore rules change (Remote Config is not Firestore) and no change to how flags are
**read**, so the pilot's hiding behaviour is untouched.

## 10. Testing

| Level | Coverage |
|---|---|
| Unit | Whitelist rejects unknown keys; booleans encode as `"true"`/`"false"` with the right `valueType`; ETag conflict maps to `aborted`; a deleted parameter is recreated from the table |
| Manual | Playwright: as superadmin, flip `show_vfun` in `/admin/settings`; confirm the template version increments and `updateUser.email` matches; reload signed-out and confirm the VFun tab appears; flip back and confirm it disappears |

## 11. Definition of done

- A superadmin can read and publish all four pilot flags from `/admin/settings`.
- Every publish writes an `audit_logs` entry naming the actor and the before/after values.
- The dead Feature Flags mechanism no longer exists in the codebase.
- Changes reach new app loads within about five minutes.
- Five locales complete; build and tests green.

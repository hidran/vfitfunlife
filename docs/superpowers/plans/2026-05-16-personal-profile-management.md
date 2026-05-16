# Personal Profile Management (Cycle C1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 4 callable cloud functions (`updateAvatar`, `updateSocialLinks`, `updateNotificationSettings`, `updatePrivacySettings`) plus matching frontend so any authenticated user can self-service their personal profile.

**Architecture:** Schema-first (shared Zod between frontend and backend), TDD for every function and form, full-object replace semantics, on-demand migration of legacy `notificationsEnabled` field, all writes audit-logged.

**Tech Stack:** Firebase Cloud Functions (Node 24, callable, `europe-west1`), Firestore + Storage, Zod, Vitest, Firebase Functions Test SDK, `@firebase/rules-unit-testing`, Next.js App Router, React Hook Form, TanStack Query, Tailwind CSS v4, shadcn/ui primitives, Capacitor (camera plugin), Playwright.

**Spec:** [`docs/superpowers/specs/2026-05-16-personal-profile-management-design.md`](../specs/2026-05-16-personal-profile-management-design.md)

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src/types/profile.ts` | Single source of truth — Zod schemas + inferred TS types for `SocialLinks`, `NotificationSettings`, `PrivacySettings`, `ProfileVisibility` |
| `functions/src/users/profile.ts` | The 4 callable cloud functions + audit-write helper |
| `functions/vitest.config.ts` | Vitest config for the `functions/` workspace (Node env) |
| `functions/test/setup.ts` | Functions test bootstrap (Firebase Admin emulator init) |
| `functions/test/profile.test.ts` | Backend unit tests for the 4 functions |
| `functions/test/profile-rules.test.ts` | Firestore rules tests |
| `src/components/profile/AvatarUploader.tsx` | Avatar picker + resize-to-512 + upload + preview |
| `src/components/profile/SocialLinksForm.tsx` | Per-platform validated URL inputs |
| `src/components/profile/NotificationSettingsForm.tsx` | Channels × event-types toggle matrix |
| `src/components/profile/PrivacySettingsForm.tsx` | Visibility radio + toggles |
| `src/app/(main)/profile/settings/notifications/page.tsx` | Dedicated notification preferences page |
| `src/app/(main)/profile/settings/privacy/page.tsx` | Dedicated privacy settings page |
| `e2e/profile-settings.spec.ts` | End-to-end Playwright test |
| `tests/components/profile/AvatarUploader.test.tsx` | Component unit test |
| `tests/components/profile/SocialLinksForm.test.tsx` | Component unit test |
| `tests/components/profile/NotificationSettingsForm.test.tsx` | Component unit test |
| `tests/components/profile/PrivacySettingsForm.test.tsx` | Component unit test |

**Modified files:**

| Path | Change |
|---|---|
| `functions/package.json` | Add `vitest` + `@vitest/coverage-v8`, `@firebase/rules-unit-testing`, test scripts |
| `functions/src/types.ts` | Re-export profile types from shared `src/types/profile.ts` (relative import) |
| `functions/src/users/index.ts` | Add `export * from "./profile"` |
| `package.json` | Add `@firebase/rules-unit-testing` to root devDependencies (rules tests run from functions/ but harness needs it) |
| `storage.rules` | Add `/avatars/{uid}/{file}` match block |
| `src/app/(main)/profile/edit/page.tsx` | Add 4 new collapsible sections, wire to new components |
| `src/i18n/messages/en.ts`, `it.ts`, `es.ts`, `de.ts`, `fr.ts` | Add `profile.settings.*` keys (en/it/es priority, de/fr get English fallback) |
| `docs/api/reference.md` | Remove vapor warnings from the 4 functions; mark as implemented |

**Note on Firestore rules:** Already permits self-update of `socialLinks`, `notificationSettings`, `privacySettings` (verified line 117-124). No change needed.

---

## Phase 0 — Pre-flight checks

### Task 0: Verify working tree clean, on main, two commits ahead of origin

**Files:** None (verification only).

- [ ] **Step 1: Confirm clean state**

Run:
```bash
git status && git log --oneline -3
```
Expected: working tree clean; HEAD shows `99f2333 docs(spec): add Cycle C1...`, `f322df4 docs: audit content...`, `b5d2a89 docs: reorganize...`.

If not, stop and resolve before proceeding.

---

## Phase 1 — Test infrastructure for `functions/`

`functions/` has no test runner today. We add Vitest with a Node environment, plus the rules-testing SDK at the project level.

### Task 1: Add Vitest + rules-testing dev dependencies

**Files:**
- Modify: `functions/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Install in `functions/`**

Run:
```bash
cd functions && npm install --save-dev vitest@^2 @vitest/coverage-v8@^2 @firebase/rules-unit-testing@^3
cd ..
```

- [ ] **Step 2: Add scripts to `functions/package.json`**

Open `functions/package.json` and add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Verify install succeeded**

Run:
```bash
cd functions && npx vitest --version && cd ..
```
Expected: prints a version number (≥ 2.0.0).

- [ ] **Step 4: Commit**

```bash
git add functions/package.json functions/package-lock.json package.json package-lock.json
git commit -m "chore(functions): add vitest + rules-unit-testing dev deps"
```

### Task 2: Create `functions/vitest.config.ts`

**Files:**
- Create: `functions/vitest.config.ts`

- [ ] **Step 1: Write config**

Create `functions/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: './test/setup.ts',
    include: ['test/**/*.test.ts'],
    testTimeout: 15000,
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add functions/vitest.config.ts
git commit -m "chore(functions): add vitest config"
```

### Task 3: Create `functions/test/setup.ts` and sanity test

**Files:**
- Create: `functions/test/setup.ts`
- Create: `functions/test/sanity.test.ts` (temporary)

- [ ] **Step 1: Write setup**

Create `functions/test/setup.ts`:
```ts
// Test bootstrap for Firebase Functions tests.
// Individual tests initialize firebase-functions-test or rules-unit-testing as needed.
import { beforeAll } from 'vitest';

beforeAll(() => {
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-vfit-test';
});
```

- [ ] **Step 2: Write sanity test**

Create `functions/test/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('test infra', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run sanity test**

Run:
```bash
cd functions && npm test && cd ..
```
Expected: 1 test passes.

- [ ] **Step 4: Remove the temporary sanity test**

Delete `functions/test/sanity.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add functions/test/setup.ts
git commit -m "chore(functions): add vitest setup file"
```

---

## Phase 2 — Shared schema (`src/types/profile.ts`)

### Task 4: Write the schema with all four shapes

**Files:**
- Create: `src/types/profile.ts`

- [ ] **Step 1: Write the schema**

Create `src/types/profile.ts`:
```ts
import { z } from 'zod';

// ============================================
// Social Links
// ============================================

const instagramRegex = /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?$/i;
const facebookRegex  = /^https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9.-]+\/?$/i;
const twitterRegex   = /^https?:\/\/(www\.)?(twitter|x)\.com\/[A-Za-z0-9_]+\/?$/i;
const linkedinRegex  = /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9_-]+\/?$/i;
const tiktokRegex    = /^https?:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._-]+\/?$/i;
const websiteRegex   = /^https?:\/\/[^\s]+\.[^\s]+$/i;

const optionalUrl = (regex: RegExp, platform: string) =>
  z.string().refine(
    (v) => v === '' || regex.test(v),
    { message: `Invalid ${platform} URL` }
  ).optional();

export const SocialLinksSchema = z.object({
  instagram: optionalUrl(instagramRegex, 'Instagram'),
  facebook:  optionalUrl(facebookRegex, 'Facebook'),
  twitter:   optionalUrl(twitterRegex, 'Twitter/X'),
  linkedin:  optionalUrl(linkedinRegex, 'LinkedIn'),
  tiktok:    optionalUrl(tiktokRegex, 'TikTok'),
  website:   optionalUrl(websiteRegex, 'website'),
}).strict();

export type SocialLinks = z.infer<typeof SocialLinksSchema>;

// ============================================
// Notification Settings
// ============================================

export const NotificationSettingsSchema = z.object({
  push: z.object({
    booking: z.boolean(),
    promotion: z.boolean(),
    system: z.boolean(),
    chat: z.boolean(),
  }).strict(),
  email: z.object({
    booking: z.boolean(),
    promotion: z.boolean(),
    system: z.boolean(),
    chat: z.boolean(),
    weeklyDigest: z.boolean(),
  }).strict(),
  sms: z.object({
    booking: z.boolean(),
    reminder: z.boolean(),
  }).strict(),
}).strict();

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const defaultNotificationSettings: NotificationSettings = {
  push:  { booking: true,  promotion: false, system: true,  chat: true },
  email: { booking: true,  promotion: false, system: true,  chat: false, weeklyDigest: false },
  sms:   { booking: true,  reminder: true },
};

export const allFalseNotificationSettings: NotificationSettings = {
  push:  { booking: false, promotion: false, system: false, chat: false },
  email: { booking: false, promotion: false, system: false, chat: false, weeklyDigest: false },
  sms:   { booking: false, reminder: false },
};

// ============================================
// Privacy Settings
// ============================================

export const ProfileVisibilitySchema = z.enum(['public', 'verified_only', 'private']);
export type ProfileVisibility = z.infer<typeof ProfileVisibilitySchema>;

export const PrivacySettingsSchema = z.object({
  profileVisibility: ProfileVisibilitySchema,
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  allowDirectMessages: z.boolean(),
  shareAnalytics: z.boolean(),
}).strict();

export type PrivacySettings = z.infer<typeof PrivacySettingsSchema>;

export const defaultPrivacySettings: PrivacySettings = {
  profileVisibility: 'public',
  showEmail: false,
  showPhone: false,
  allowDirectMessages: true,
  shareAnalytics: true,
};

// ============================================
// Avatar URL validator (factory — needs caller uid + bucket name)
// ============================================

/** Returns a Zod schema that validates an avatar URL against caller's uid and our bucket. */
export const makeAvatarUrlSchema = (uid: string, bucket: string) => {
  const escapedBucket = bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `^https://firebasestorage\\.googleapis\\.com/v0/b/${escapedBucket}/o/avatars%2F${uid}%2F[^?]+(\\?.*)?$`
  );
  return z.string().regex(re, 'Avatar URL must be a Firebase Storage URL under avatars/{uid}/');
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/profile.ts
git commit -m "feat(types): add shared profile Zod schemas (social, notifications, privacy)"
```

### Task 5: Wire functions to consume the shared schema

**Files:**
- Modify: `functions/src/types.ts`
- Modify: `functions/tsconfig.json` (only if necessary)

- [ ] **Step 1: Try direct relative import**

Open `functions/src/types.ts` and append:
```ts
// ============================================
// Profile types (shared with frontend)
// ============================================
export type {
  SocialLinks,
  NotificationSettings,
  PrivacySettings,
  ProfileVisibility,
} from '../../src/types/profile';

export {
  SocialLinksSchema,
  NotificationSettingsSchema,
  PrivacySettingsSchema,
  ProfileVisibilitySchema,
  defaultNotificationSettings,
  allFalseNotificationSettings,
  defaultPrivacySettings,
  makeAvatarUrlSchema,
} from '../../src/types/profile';
```

- [ ] **Step 2: Try compiling**

Run:
```bash
cd functions && npx tsc --noEmit && cd ..
```

- [ ] **Step 3: If step 2 fails with rootDir error**

If TypeScript complains that the import is outside `rootDir`, fall back to **duplicating** the schemas:
1. Create `functions/src/types/profile.ts` with the exact same content as `src/types/profile.ts`.
2. Change the appended block in `functions/src/types.ts` to import from `./types/profile` instead.
3. Add a comment header to both files: `// SHARED SCHEMA — keep in sync with the twin file. CI lint TODO.`

(The plan's writer prefers the shared import; if it works, skip step 3.)

- [ ] **Step 4: Verify compile works (either path)**

Run:
```bash
cd functions && npx tsc --noEmit && cd ..
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add functions/src/types.ts functions/src/types/profile.ts 2>/dev/null; git add functions/tsconfig.json 2>/dev/null
git commit -m "feat(functions): re-export shared profile schemas"
```

---

## Phase 3 — Backend functions (4 functions, strict TDD)

Each function gets its own TDD task. Pattern: failing test → run → minimal impl → run → validation cases → run → audit log integration → run → commit.

### Task 6: `updateNotificationSettings` — failing happy-path test

**Files:**
- Create: `functions/src/users/profile.ts` (empty stub for now)
- Create: `functions/test/profile.test.ts`

- [ ] **Step 1: Create empty profile.ts**

Create `functions/src/users/profile.ts`:
```ts
// Profile management cloud functions.
// See docs/superpowers/specs/2026-05-16-personal-profile-management-design.md
export {};
```

- [ ] **Step 2: Write the failing test**

Create `functions/test/profile.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import functionsTest from 'firebase-functions-test';
import * as admin from 'firebase-admin';
import { defaultNotificationSettings } from '../src/types';

const testEnv = functionsTest({ projectId: 'demo-vfit-test' });

// Lazy import after env init
let profileModule: typeof import('../src/users/profile');

beforeEach(async () => {
  vi.resetModules();
  profileModule = await import('../src/users/profile');
});

afterEach(() => {
  testEnv.cleanup();
});

describe('updateNotificationSettings', () => {
  it('writes the provided settings to the user doc and returns success', async () => {
    const uid = 'user-1';
    // Seed user
    await admin.firestore().collection('users').doc(uid).set({
      uid,
      email: 'u@example.com',
      fullName: 'Test User',
      role: 'customer',
    });

    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    const result = await wrapped({
      data: { settings: defaultNotificationSettings },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });

    expect(result).toEqual({ success: true });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.notificationSettings).toEqual(defaultNotificationSettings);
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run:
```bash
cd functions && npm test 2>&1 | tail -30 && cd ..
```
Expected: test fails because `profileModule.updateNotificationSettings` is undefined.

### Task 7: `updateNotificationSettings` — minimal implementation

**Files:**
- Modify: `functions/src/users/profile.ts`

- [ ] **Step 1: Implement minimal handler**

Replace `functions/src/users/profile.ts` contents:
```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  NotificationSettingsSchema,
  type NotificationSettings,
} from '../types';

if (admin.apps.length === 0) admin.initializeApp();

const db = () => admin.firestore();

interface UpdateNotificationSettingsData {
  settings: NotificationSettings;
}

export const updateNotificationSettings = onCall<UpdateNotificationSettingsData>(
  { region: 'europe-west1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated.');
    }
    const parsed = NotificationSettingsSchema.safeParse(request.data?.settings);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', `Invalid notification settings: ${parsed.error.message}`);
    }

    const uid = request.auth.uid;
    const userRef = db().collection('users').doc(uid);

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'User document does not exist.');
      }
      const before = snap.data()?.notificationSettings ?? null;

      const update: Record<string, unknown> = {
        notificationSettings: parsed.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Migrate legacy field
      if (snap.data()?.notificationsEnabled !== undefined) {
        update.notificationsEnabled = admin.firestore.FieldValue.delete();
      }
      tx.update(userRef, update);

      const auditRef = db().collection('auditLogs').doc();
      tx.set(auditRef, {
        uid,
        actor: uid,
        action: 'profile.notifications.update',
        changes: { before, after: parsed.data },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.['user-agent'] ?? null,
      });
    });

    return { success: true } as const;
  }
);
```

- [ ] **Step 2: Run — expect failure (no Firestore emulator)**

Run:
```bash
cd functions && npm test 2>&1 | tail -40 && cd ..
```
Expected: test fails because no Firestore is available. We need the emulator OR a mocked admin.firestore. Choose the emulator path — it's closer to real and the rules tests will need it anyway.

- [ ] **Step 3: Verify Firebase CLI is available**

Run:
```bash
npx firebase --version
```
Expected: version printed (already a project dep).

- [ ] **Step 4: Add emulator config**

Open `firebase.json`; verify `emulators.firestore` block exists. If not, add:
```json
"emulators": {
  "firestore": { "port": 8080 },
  "auth":      { "port": 9099 },
  "ui":        { "enabled": false }
}
```

- [ ] **Step 5: Run tests against the emulator**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -30 && cd ..
```
Expected: `updateNotificationSettings` happy-path test passes.

- [ ] **Step 6: Commit**

```bash
git add functions/src/users/profile.ts functions/test/profile.test.ts firebase.json
git commit -m "feat(functions): add updateNotificationSettings + happy-path test"
```

### Task 8: `updateNotificationSettings` — validation, auth, migration tests

**Files:**
- Modify: `functions/test/profile.test.ts`

- [ ] **Step 1: Add three more tests**

Append to the `describe('updateNotificationSettings', ...)` block:
```ts
  it('rejects unauthenticated calls', async () => {
    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    await expect(
      wrapped({ data: { settings: defaultNotificationSettings }, auth: undefined as any })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects invalid shape', async () => {
    const uid = 'user-2';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    await expect(
      wrapped({
        data: { settings: { push: { booking: 'yes' } } as any },
        auth: { uid, token: {} as admin.auth.DecodedIdToken },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('migrates legacy notificationsEnabled on first write', async () => {
    const uid = 'user-3';
    await admin.firestore().collection('users').doc(uid).set({
      uid,
      role: 'customer',
      notificationsEnabled: true,
    });
    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    await wrapped({
      data: { settings: defaultNotificationSettings },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.notificationSettings).toEqual(defaultNotificationSettings);
    expect(after.data()?.notificationsEnabled).toBeUndefined();
  });

  it('writes one auditLogs entry per successful call', async () => {
    const uid = 'user-4';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    await wrapped({
      data: { settings: defaultNotificationSettings },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const logs = await admin.firestore()
      .collection('auditLogs')
      .where('uid', '==', uid)
      .where('action', '==', 'profile.notifications.update')
      .get();
    expect(logs.size).toBe(1);
  });
```

- [ ] **Step 2: Run — all should pass**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -30 && cd ..
```
Expected: 5 tests under `updateNotificationSettings` pass.

- [ ] **Step 3: Commit**

```bash
git add functions/test/profile.test.ts
git commit -m "test(functions): cover auth/validation/migration/audit for updateNotificationSettings"
```

### Task 9: `updatePrivacySettings` — TDD

**Files:**
- Modify: `functions/src/users/profile.ts`
- Modify: `functions/test/profile.test.ts`

- [ ] **Step 1: Write failing test**

Append a new `describe` block to `functions/test/profile.test.ts`:
```ts
import { defaultPrivacySettings } from '../src/types';

describe('updatePrivacySettings', () => {
  it('writes the provided settings and logs audit', async () => {
    const uid = 'priv-1';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updatePrivacySettings);
    await wrapped({
      data: { settings: defaultPrivacySettings },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.privacySettings).toEqual(defaultPrivacySettings);

    const logs = await admin.firestore()
      .collection('auditLogs')
      .where('uid', '==', uid)
      .where('action', '==', 'profile.privacy.update')
      .get();
    expect(logs.size).toBe(1);
  });

  it('rejects invalid profileVisibility', async () => {
    const uid = 'priv-2';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updatePrivacySettings);
    await expect(
      wrapped({
        data: { settings: { ...defaultPrivacySettings, profileVisibility: 'invalid' } as any },
        auth: { uid, token: {} as admin.auth.DecodedIdToken },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects unauthenticated', async () => {
    const wrapped = testEnv.wrap(profileModule.updatePrivacySettings);
    await expect(
      wrapped({ data: { settings: defaultPrivacySettings }, auth: undefined as any })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -20 && cd ..
```
Expected: `updatePrivacySettings` tests fail (function undefined).

- [ ] **Step 3: Implement**

Append to `functions/src/users/profile.ts`:
```ts
import { PrivacySettingsSchema, type PrivacySettings } from '../types';

interface UpdatePrivacySettingsData { settings: PrivacySettings; }

export const updatePrivacySettings = onCall<UpdatePrivacySettingsData>(
  { region: 'europe-west1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated.');
    const parsed = PrivacySettingsSchema.safeParse(request.data?.settings);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', `Invalid privacy settings: ${parsed.error.message}`);
    }
    const uid = request.auth.uid;
    const userRef = db().collection('users').doc(uid);

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'User document does not exist.');
      const before = snap.data()?.privacySettings ?? null;
      tx.update(userRef, {
        privacySettings: parsed.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db().collection('auditLogs').doc(), {
        uid, actor: uid,
        action: 'profile.privacy.update',
        changes: { before, after: parsed.data },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.['user-agent'] ?? null,
      });
    });
    return { success: true } as const;
  }
);
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -30 && cd ..
```
Expected: all `updatePrivacySettings` tests pass.

- [ ] **Step 5: Commit**

```bash
git add functions/src/users/profile.ts functions/test/profile.test.ts
git commit -m "feat(functions): add updatePrivacySettings + tests"
```

### Task 10: `updateSocialLinks` — TDD

**Files:**
- Modify: `functions/src/users/profile.ts`
- Modify: `functions/test/profile.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `functions/test/profile.test.ts`:
```ts
describe('updateSocialLinks', () => {
  it('writes valid social links', async () => {
    const uid = 'soc-1';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateSocialLinks);
    const links = {
      instagram: 'https://instagram.com/test_user',
      twitter: 'https://x.com/test_user',
      website: 'https://example.com',
    };
    await wrapped({
      data: { socialLinks: links },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.socialLinks).toEqual(links);
  });

  it('rejects invalid instagram URL', async () => {
    const uid = 'soc-2';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateSocialLinks);
    await expect(
      wrapped({
        data: { socialLinks: { instagram: 'not-a-url' } },
        auth: { uid, token: {} as admin.auth.DecodedIdToken },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('treats empty string as clear', async () => {
    const uid = 'soc-3';
    await admin.firestore().collection('users').doc(uid).set({
      uid, role: 'customer',
      socialLinks: { instagram: 'https://instagram.com/old_handle' },
    });
    const wrapped = testEnv.wrap(profileModule.updateSocialLinks);
    await wrapped({
      data: { socialLinks: { instagram: '' } },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.socialLinks).toEqual({ instagram: '' });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -15 && cd ..
```
Expected: `updateSocialLinks` tests fail.

- [ ] **Step 3: Implement**

Append to `functions/src/users/profile.ts`:
```ts
import { SocialLinksSchema, type SocialLinks } from '../types';

interface UpdateSocialLinksData { socialLinks: SocialLinks; }

export const updateSocialLinks = onCall<UpdateSocialLinksData>(
  { region: 'europe-west1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated.');
    const parsed = SocialLinksSchema.safeParse(request.data?.socialLinks);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', `Invalid social links: ${parsed.error.message}`);
    }
    const uid = request.auth.uid;
    const userRef = db().collection('users').doc(uid);

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'User document does not exist.');
      const before = snap.data()?.socialLinks ?? null;
      tx.update(userRef, {
        socialLinks: parsed.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db().collection('auditLogs').doc(), {
        uid, actor: uid,
        action: 'profile.social.update',
        changes: { before, after: parsed.data },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.['user-agent'] ?? null,
      });
    });
    return { success: true } as const;
  }
);
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -15 && cd ..
```
Expected: all `updateSocialLinks` tests pass.

- [ ] **Step 5: Commit**

```bash
git add functions/src/users/profile.ts functions/test/profile.test.ts
git commit -m "feat(functions): add updateSocialLinks + tests"
```

### Task 11: `updateAvatar` — TDD (most complex; Storage cleanup)

**Files:**
- Modify: `functions/src/users/profile.ts`
- Modify: `functions/test/profile.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `functions/test/profile.test.ts`:
```ts
import { makeAvatarUrlSchema } from '../src/types';

describe('updateAvatar', () => {
  const bucket = 'demo-vfit-test.appspot.com';

  beforeEach(() => {
    // Stub Storage so old-avatar deletion attempts don't error.
    vi.spyOn(admin.storage(), 'bucket').mockReturnValue({
      file: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue([]) }),
    } as any);
  });

  it('accepts a valid bucket+uid URL and writes to user doc', async () => {
    const uid = 'av-1';
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/avatars%2F${uid}%2F1234-abc.jpg?alt=media&token=xyz`;
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateAvatar);
    const result = await wrapped({
      data: { avatarUrl: url },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    expect(result.success).toBe(true);
    expect(result.avatarUrl).toBe(url);
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.avatarUrl).toBe(url);
  });

  it('rejects a URL pointing at someone else\'s avatar', async () => {
    const uid = 'av-2';
    const otherUid = 'av-other';
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/avatars%2F${otherUid}%2Ffoo.jpg`;
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateAvatar);
    await expect(
      wrapped({ data: { avatarUrl: url }, auth: { uid, token: {} as admin.auth.DecodedIdToken } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a non-bucket URL', async () => {
    const uid = 'av-3';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateAvatar);
    await expect(
      wrapped({
        data: { avatarUrl: 'https://evil.example.com/me.jpg' },
        auth: { uid, token: {} as admin.auth.DecodedIdToken },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('succeeds even when old-avatar deletion fails', async () => {
    const uid = 'av-4';
    const oldUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/avatars%2F${uid}%2Fold.jpg`;
    const newUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/avatars%2F${uid}%2Fnew.jpg`;
    await admin.firestore().collection('users').doc(uid).set({
      uid, role: 'customer', avatarUrl: oldUrl,
    });
    // Make delete fail
    (admin.storage().bucket as any).mockReturnValue({
      file: vi.fn().mockReturnValue({ delete: vi.fn().mockRejectedValue(new Error('boom')) }),
    });
    const wrapped = testEnv.wrap(profileModule.updateAvatar);
    const result = await wrapped({
      data: { avatarUrl: newUrl },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -25 && cd ..
```
Expected: `updateAvatar` tests fail (function not exported).

- [ ] **Step 3: Implement**

Append to `functions/src/users/profile.ts`:
```ts
import { makeAvatarUrlSchema } from '../types';

interface UpdateAvatarData { avatarUrl: string; }

const STORAGE_BUCKET = process.env.STORAGE_BUCKET 
  || `${process.env.GCLOUD_PROJECT}.appspot.com`;

/** Extract the Storage object path from a Firebase Storage download URL. */
function extractObjectPath(url: string): string | null {
  // .../o/<URL-ENCODED-PATH>?...
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

export const updateAvatar = onCall<UpdateAvatarData>(
  { region: 'europe-west1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated.');
    const uid = request.auth.uid;
    const schema = makeAvatarUrlSchema(uid, STORAGE_BUCKET);
    const parsed = schema.safeParse(request.data?.avatarUrl);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', `Invalid avatar URL: ${parsed.error.message}`);
    }
    const newUrl = parsed.data;
    const userRef = db().collection('users').doc(uid);

    let previousUrl: string | null = null;
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'User document does not exist.');
      previousUrl = snap.data()?.avatarUrl ?? null;
      tx.update(userRef, {
        avatarUrl: newUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db().collection('auditLogs').doc(), {
        uid, actor: uid,
        action: 'profile.avatar.update',
        changes: { before: previousUrl, after: newUrl },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: request.rawRequest?.ip ?? null,
        userAgent: request.rawRequest?.headers?.['user-agent'] ?? null,
      });
    });

    // Best-effort cleanup of previous avatar
    if (previousUrl && previousUrl !== newUrl) {
      const oldPath = extractObjectPath(previousUrl);
      if (oldPath && oldPath.startsWith(`avatars/${uid}/`)) {
        try {
          await admin.storage().bucket().file(oldPath).delete();
        } catch (err) {
          console.warn(`Failed to delete previous avatar ${oldPath}:`, err);
        }
      }
    }

    return { success: true, avatarUrl: newUrl, previousUrl } as const;
  }
);
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -25 && cd ..
```
Expected: all `updateAvatar` tests pass.

- [ ] **Step 5: Commit**

```bash
git add functions/src/users/profile.ts functions/test/profile.test.ts
git commit -m "feat(functions): add updateAvatar with previous-file cleanup"
```

### Task 12: Wire profile.ts exports through users/index.ts

**Files:**
- Modify: `functions/src/users/index.ts`

- [ ] **Step 1: Add the export**

Open `functions/src/users/index.ts` and append at the end:
```ts
export * from './profile';
```

- [ ] **Step 2: Verify build**

Run:
```bash
cd functions && npx tsc --noEmit && cd ..
```
Expected: no errors.

- [ ] **Step 3: Verify functions are now in the top-level export**

Run:
```bash
cd functions && npx tsc && cd .. && grep -E "updateAvatar|updateSocialLinks|updateNotificationSettings|updatePrivacySettings" functions/lib/users/index.js | head
```
Expected: each function name appears.

- [ ] **Step 4: Commit**

```bash
git add functions/src/users/index.ts
git commit -m "feat(functions): export profile functions from users module"
```

---

## Phase 4 — Storage rules

### Task 13: Add `avatars/{uid}/{file}` rule

**Files:**
- Modify: `storage.rules`

- [ ] **Step 1: Read current contents**

Run:
```bash
cat storage.rules
```

- [ ] **Step 2: Add avatar match block**

Inside the existing `match /b/{bucket}/o {` (or top-level match block — check structure), add before any catch-all `match /{allPaths=**}`:
```javascript
match /avatars/{uid}/{file} {
  allow read: if true;
  allow write: if request.auth != null
                && request.auth.uid == uid
                && request.resource.size < 5 * 1024 * 1024
                && request.resource.contentType.matches('image/.*');
}
```

- [ ] **Step 3: Verify rules syntax**

Run:
```bash
npx firebase emulators:exec --only storage --project demo-vfit-test "echo 'rules loaded'"
```
Expected: prints "rules loaded" (rules parse OK).

- [ ] **Step 4: Commit**

```bash
git add storage.rules
git commit -m "feat(storage): allow self-write to avatars/{uid}/ with size+MIME limits"
```

### Task 14: Firestore rules unit test (assert existing rules permit the 4 fields)

**Files:**
- Create: `functions/test/profile-rules.test.ts`

- [ ] **Step 1: Write test**

Create `functions/test/profile-rules.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-vfit-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1', port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

describe('users/{uid} self-update — profile fields', () => {
  it('owner can update socialLinks', async () => {
    const uid = 'owner-1';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc(uid).set({
        uid, role: 'customer', email: 'a@b.c',
      });
    });
    const ctx = testEnv.authenticatedContext(uid);
    await assertSucceeds(
      ctx.firestore().collection('users').doc(uid).update({
        socialLinks: { instagram: 'https://instagram.com/foo' },
      })
    );
  });

  it('owner can update notificationSettings + privacySettings', async () => {
    const uid = 'owner-2';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    });
    const ctx = testEnv.authenticatedContext(uid);
    await assertSucceeds(
      ctx.firestore().collection('users').doc(uid).update({
        notificationSettings: { push: { booking: true, promotion: false, system: true, chat: true } },
        privacySettings: { profileVisibility: 'public', showEmail: false, showPhone: false, allowDirectMessages: true, shareAnalytics: true },
      })
    );
  });

  it('non-owner cannot update', async () => {
    const owner = 'owner-3'; const other = 'other-3';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc(owner).set({ uid: owner, role: 'customer' });
    });
    const ctx = testEnv.authenticatedContext(other);
    await assertFails(
      ctx.firestore().collection('users').doc(owner).update({
        socialLinks: { instagram: 'https://instagram.com/foo' },
      })
    );
  });

  it('owner cannot update role via this path', async () => {
    const uid = 'owner-4';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    });
    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      ctx.firestore().collection('users').doc(uid).update({ role: 'admin' })
    );
  });
});
```

- [ ] **Step 2: Run with emulator**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore --project demo-vfit-test "npm test -- profile-rules" 2>&1 | tail -20 && cd ..
```
Expected: all 4 rules tests pass.

- [ ] **Step 3: Commit**

```bash
git add functions/test/profile-rules.test.ts
git commit -m "test(rules): verify profile-field self-update permissions"
```

---

## Phase 5 — Migration: legacy `notificationsEnabled` readers

### Task 15: Find and update legacy readers

**Files:**
- Modify: any file found that reads `notificationsEnabled` and should now use `notificationSettings`

- [ ] **Step 1: Grep for readers**

Run:
```bash
grep -rn "notificationsEnabled" --include="*.ts" --include="*.tsx" src/ functions/src/ | grep -v node_modules
```

- [ ] **Step 2: For each hit, decide:**

- If the file READS the field to make a decision (e.g. `if (user.notificationsEnabled) sendEmail(...)`), update it to:
  ```ts
  import { defaultNotificationSettings } from '@/types/profile'; // or relative for functions
  const settings = user.notificationSettings ?? (
    user.notificationsEnabled === false 
      ? { push: { booking: false, ... }, ... } 
      : defaultNotificationSettings
  );
  if (settings.email.booking) { ... }
  ```
- If the file only WRITES the field (e.g. registration), leave it; it will be migrated on first profile change.

- [ ] **Step 3: After edits, recompile**

Run:
```bash
npx tsc --noEmit -p tsconfig.json && cd functions && npx tsc --noEmit && cd ..
```
Expected: no errors.

- [ ] **Step 4: Re-run all backend tests**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -20 && cd ..
```
Expected: all tests still pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate notificationsEnabled readers to notificationSettings"
```

---

## Phase 6 — Frontend: shared TanStack mutations

### Task 16: Add typed cloud-function callers

**Files:**
- Create: `src/lib/profile-mutations.ts`

- [ ] **Step 1: Write the file**

Create `src/lib/profile-mutations.ts`:
```ts
'use client';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SocialLinks,
  NotificationSettings,
  PrivacySettings,
} from '@/types/profile';
import { useAuthStore } from '@/stores/authStore';

const region = 'europe-west1';

function fns() { return getFunctions(undefined, region); }

export function useUpdateAvatar() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  return useMutation({
    mutationFn: async (avatarUrl: string) => {
      const fn = httpsCallable<{ avatarUrl: string }, { success: true; avatarUrl: string; previousUrl: string | null }>(
        fns(), 'updateAvatar'
      );
      const r = await fn({ avatarUrl });
      return r.data;
    },
    onSuccess: () => uid && qc.invalidateQueries({ queryKey: ['user', uid] }),
  });
}

export function useUpdateSocialLinks() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  return useMutation({
    mutationFn: async (socialLinks: SocialLinks) => {
      const fn = httpsCallable<{ socialLinks: SocialLinks }, { success: true }>(fns(), 'updateSocialLinks');
      const r = await fn({ socialLinks });
      return r.data;
    },
    onSuccess: () => uid && qc.invalidateQueries({ queryKey: ['user', uid] }),
  });
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  return useMutation({
    mutationFn: async (settings: NotificationSettings) => {
      const fn = httpsCallable<{ settings: NotificationSettings }, { success: true }>(
        fns(), 'updateNotificationSettings'
      );
      const r = await fn({ settings });
      return r.data;
    },
    onSuccess: () => uid && qc.invalidateQueries({ queryKey: ['user', uid] }),
  });
}

export function useUpdatePrivacySettings() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  return useMutation({
    mutationFn: async (settings: PrivacySettings) => {
      const fn = httpsCallable<{ settings: PrivacySettings }, { success: true }>(
        fns(), 'updatePrivacySettings'
      );
      const r = await fn({ settings });
      return r.data;
    },
    onSuccess: () => uid && qc.invalidateQueries({ queryKey: ['user', uid] }),
  });
}
```

- [ ] **Step 2: TypeCheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/profile-mutations.ts
git commit -m "feat(client): add TanStack mutations for profile updates"
```

---

## Phase 7 — Frontend components (TDD per component)

### Task 17: `SocialLinksForm` — component test

**Files:**
- Create: `tests/components/profile/SocialLinksForm.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/components/profile/SocialLinksForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SocialLinksForm } from '@/components/profile/SocialLinksForm';

vi.mock('@/lib/profile-mutations', () => ({
  useUpdateSocialLinks: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  }),
}));

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe('SocialLinksForm', () => {
  it('renders inputs for all 6 platforms', () => {
    render(wrap(<SocialLinksForm initial={{}} />));
    expect(screen.getByLabelText(/instagram/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/facebook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/twitter|x/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/linkedin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tiktok/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
  });

  it('shows validation error for malformed instagram URL', async () => {
    render(wrap(<SocialLinksForm initial={{}} />));
    fireEvent.change(screen.getByLabelText(/instagram/i), { target: { value: 'not-a-url' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/Invalid Instagram URL/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
npm test -- SocialLinksForm 2>&1 | tail -20
```
Expected: fails (component not found).

### Task 18: `SocialLinksForm` — implementation

**Files:**
- Create: `src/components/profile/SocialLinksForm.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/profile/SocialLinksForm.tsx`:
```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SocialLinksSchema, type SocialLinks } from '@/types/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateSocialLinks } from '@/lib/profile-mutations';
import { Instagram, Facebook, Twitter, Linkedin, Globe, Music } from 'lucide-react';

interface Props { initial: SocialLinks; onSaved?: () => void; }

const fields: Array<{ name: keyof SocialLinks; label: string; icon: React.ComponentType<any>; placeholder: string }> = [
  { name: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/your_handle' },
  { name: 'facebook',  label: 'Facebook',  icon: Facebook,  placeholder: 'https://facebook.com/your.page' },
  { name: 'twitter',   label: 'Twitter / X', icon: Twitter, placeholder: 'https://x.com/your_handle' },
  { name: 'linkedin',  label: 'LinkedIn',  icon: Linkedin,  placeholder: 'https://linkedin.com/in/your-name' },
  { name: 'tiktok',    label: 'TikTok',    icon: Music,     placeholder: 'https://tiktok.com/@your_handle' },
  { name: 'website',   label: 'Website',   icon: Globe,     placeholder: 'https://example.com' },
];

export function SocialLinksForm({ initial, onSaved }: Props) {
  const mut = useUpdateSocialLinks();
  const { register, handleSubmit, formState } = useForm<SocialLinks>({
    resolver: zodResolver(SocialLinksSchema),
    defaultValues: initial,
  });

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (data) => {
        await mut.mutateAsync(data);
        onSaved?.();
      })}
    >
      {fields.map(({ name, label, icon: Icon, placeholder }) => (
        <div key={name}>
          <label htmlFor={`social-${name}`} className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4" /> {label}
          </label>
          <Input id={`social-${name}`} type="url" placeholder={placeholder} {...register(name)} />
          {formState.errors[name] && (
            <p className="mt-1 text-xs text-error">{String(formState.errors[name]?.message)}</p>
          )}
        </div>
      ))}
      <Button type="submit" isLoading={mut.isPending}>Save</Button>
    </form>
  );
}
```

- [ ] **Step 2: Run the test — expect pass**

Run:
```bash
npm test -- SocialLinksForm 2>&1 | tail -15
```
Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/SocialLinksForm.tsx tests/components/profile/SocialLinksForm.test.tsx
git commit -m "feat(profile): add SocialLinksForm component"
```

### Task 19: `NotificationSettingsForm` — test + impl

**Files:**
- Create: `tests/components/profile/NotificationSettingsForm.test.tsx`
- Create: `src/components/profile/NotificationSettingsForm.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/components/profile/NotificationSettingsForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { defaultNotificationSettings } from '@/types/profile';

const mockMutate = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/profile-mutations', () => ({
  useUpdateNotificationSettings: () => ({ mutate: mockMutate, mutateAsync: mockMutate, isPending: false }),
}));

function wrap(ui: React.ReactNode) { return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>; }

describe('NotificationSettingsForm', () => {
  it('renders 3 channel groups', () => {
    render(wrap(<NotificationSettingsForm initial={defaultNotificationSettings} />));
    expect(screen.getByText(/push/i)).toBeInTheDocument();
    expect(screen.getByText(/email/i)).toBeInTheDocument();
    expect(screen.getByText(/sms/i)).toBeInTheDocument();
  });

  it('saves toggled state on submit', async () => {
    render(wrap(<NotificationSettingsForm initial={defaultNotificationSettings} />));
    const promoToggle = screen.getByLabelText(/push.*promotion/i);
    fireEvent.click(promoToggle);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await vi.waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({
        push: expect.objectContaining({ promotion: true }),
      }));
    });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
npm test -- NotificationSettingsForm 2>&1 | tail -10
```
Expected: fails.

- [ ] **Step 3: Implement component**

Create `src/components/profile/NotificationSettingsForm.tsx`:
```tsx
'use client';
import { useState } from 'react';
import type { NotificationSettings } from '@/types/profile';
import { Button } from '@/components/ui/button';
import { useUpdateNotificationSettings } from '@/lib/profile-mutations';

interface Props { initial: NotificationSettings; onSaved?: () => void; }

type Channel = 'push' | 'email' | 'sms';
const labels: Record<string, string> = {
  booking: 'Booking updates',
  promotion: 'Promotions',
  system: 'System messages',
  chat: 'Chat messages',
  weeklyDigest: 'Weekly digest',
  reminder: 'Booking reminders',
};

export function NotificationSettingsForm({ initial, onSaved }: Props) {
  const [state, setState] = useState<NotificationSettings>(initial);
  const mut = useUpdateNotificationSettings();

  const setVal = (ch: Channel, key: string, val: boolean) => {
    setState((s) => ({ ...s, [ch]: { ...(s as any)[ch], [key]: val } }));
  };

  const renderChannel = (ch: Channel) => (
    <fieldset key={ch} className="space-y-2">
      <legend className="text-sm font-semibold uppercase tracking-wide">{ch}</legend>
      {Object.entries((state as any)[ch]).map(([k, v]) => (
        <label key={k} htmlFor={`${ch}-${k}`} className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm">{labels[k] ?? k}</span>
          <input
            id={`${ch}-${k}`}
            type="checkbox"
            role="switch"
            aria-checked={Boolean(v)}
            checked={Boolean(v)}
            onChange={(e) => setVal(ch, k, e.target.checked)}
            aria-label={`${ch} ${labels[k] ?? k}`}
          />
        </label>
      ))}
    </fieldset>
  );

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        await mut.mutateAsync(state);
        onSaved?.();
      }}
    >
      {renderChannel('push')}
      {renderChannel('email')}
      {renderChannel('sms')}
      <Button type="submit" isLoading={mut.isPending}>Save</Button>
    </form>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
npm test -- NotificationSettingsForm 2>&1 | tail -10
```
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/NotificationSettingsForm.tsx tests/components/profile/NotificationSettingsForm.test.tsx
git commit -m "feat(profile): add NotificationSettingsForm component"
```

### Task 20: `PrivacySettingsForm` — test + impl

**Files:**
- Create: `tests/components/profile/PrivacySettingsForm.test.tsx`
- Create: `src/components/profile/PrivacySettingsForm.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/components/profile/PrivacySettingsForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivacySettingsForm } from '@/components/profile/PrivacySettingsForm';
import { defaultPrivacySettings } from '@/types/profile';

const mockMutate = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/profile-mutations', () => ({
  useUpdatePrivacySettings: () => ({ mutate: mockMutate, mutateAsync: mockMutate, isPending: false }),
}));

function wrap(ui: React.ReactNode) { return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>; }

describe('PrivacySettingsForm', () => {
  it('renders visibility radio + toggles', () => {
    render(wrap(<PrivacySettingsForm initial={defaultPrivacySettings} />));
    expect(screen.getByLabelText(/^public$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/verified.*only/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^private$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/show email/i)).toBeInTheDocument();
  });

  it('submits changed visibility', async () => {
    render(wrap(<PrivacySettingsForm initial={defaultPrivacySettings} />));
    fireEvent.click(screen.getByLabelText(/^private$/i));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await vi.waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ profileVisibility: 'private' }));
    });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
npm test -- PrivacySettingsForm 2>&1 | tail -10
```

- [ ] **Step 3: Implement component**

Create `src/components/profile/PrivacySettingsForm.tsx`:
```tsx
'use client';
import { useState } from 'react';
import type { PrivacySettings, ProfileVisibility } from '@/types/profile';
import { Button } from '@/components/ui/button';
import { useUpdatePrivacySettings } from '@/lib/profile-mutations';

interface Props { initial: PrivacySettings; onSaved?: () => void; }

const visibilityOptions: Array<{ value: ProfileVisibility; label: string; hint: string }> = [
  { value: 'public', label: 'Public', hint: 'Anyone can find and view your profile.' },
  { value: 'verified_only', label: 'Verified only', hint: 'Only verified users can view your profile.' },
  { value: 'private', label: 'Private', hint: 'Only people you book with can view your profile.' },
];

const toggleFields: Array<{ key: keyof Omit<PrivacySettings, 'profileVisibility'>; label: string; hint: string }> = [
  { key: 'showEmail', label: 'Show email', hint: 'Display your email on your public profile.' },
  { key: 'showPhone', label: 'Show phone', hint: 'Display your phone number on your public profile.' },
  { key: 'allowDirectMessages', label: 'Allow direct messages', hint: 'Other users can message you directly.' },
  { key: 'shareAnalytics', label: 'Share analytics', hint: 'Allow anonymized usage analytics.' },
];

export function PrivacySettingsForm({ initial, onSaved }: Props) {
  const [state, setState] = useState<PrivacySettings>(initial);
  const mut = useUpdatePrivacySettings();

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        await mut.mutateAsync(state);
        onSaved?.();
      }}
    >
      <fieldset>
        <legend className="text-sm font-semibold">Profile visibility</legend>
        <div className="mt-2 space-y-2">
          {visibilityOptions.map(({ value, label, hint }) => (
            <label key={value} htmlFor={`vis-${value}`} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <input
                id={`vis-${value}`}
                type="radio"
                name="profileVisibility"
                value={value}
                checked={state.profileVisibility === value}
                onChange={() => setState((s) => ({ ...s, profileVisibility: value }))}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-text-secondary">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {toggleFields.map(({ key, label, hint }) => (
        <label key={key} htmlFor={`priv-${key}`} className="flex items-start justify-between rounded-lg border border-border p-3">
          <span>
            <span className="block text-sm font-medium">{label}</span>
            <span className="block text-xs text-text-secondary">{hint}</span>
          </span>
          <input
            id={`priv-${key}`}
            type="checkbox"
            role="switch"
            aria-checked={Boolean(state[key])}
            checked={Boolean(state[key])}
            onChange={(e) => setState((s) => ({ ...s, [key]: e.target.checked }))}
          />
        </label>
      ))}

      <Button type="submit" isLoading={mut.isPending}>Save</Button>
    </form>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
npm test -- PrivacySettingsForm 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/PrivacySettingsForm.tsx tests/components/profile/PrivacySettingsForm.test.tsx
git commit -m "feat(profile): add PrivacySettingsForm component"
```

### Task 21: `AvatarUploader` — test + impl (web file picker first)

**Files:**
- Create: `tests/components/profile/AvatarUploader.test.tsx`
- Create: `src/components/profile/AvatarUploader.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/components/profile/AvatarUploader.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AvatarUploader } from '@/components/profile/AvatarUploader';

vi.mock('@/lib/profile-mutations', () => ({
  useUpdateAvatar: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn().mockResolvedValue({}),
  getDownloadURL: vi.fn().mockResolvedValue('https://firebasestorage.googleapis.com/v0/b/demo/o/avatars%2Fu1%2Fx.jpg'),
}));

function wrap(ui: React.ReactNode) { return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>; }

describe('AvatarUploader', () => {
  it('renders a file picker', () => {
    render(wrap(<AvatarUploader currentUrl={null} uid="u1" />));
    expect(screen.getByLabelText(/upload.*avatar/i)).toBeInTheDocument();
  });

  it('shows current avatar when provided', () => {
    render(wrap(<AvatarUploader currentUrl="https://example.com/a.jpg" uid="u1" />));
    expect(screen.getByRole('img', { name: /current avatar/i })).toHaveAttribute('src', 'https://example.com/a.jpg');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
npm test -- AvatarUploader 2>&1 | tail -10
```

- [ ] **Step 3: Implement component**

Create `src/components/profile/AvatarUploader.tsx`:
```tsx
'use client';
import { useRef, useState } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { useUpdateAvatar } from '@/lib/profile-mutations';
import { Camera } from 'lucide-react';

interface Props { currentUrl: string | null; uid: string; onUploaded?: (url: string) => void; }

/** Resize an image File to a 512x512 center-cropped JPEG via canvas. */
async function resizeToSquare(file: File, size = 512): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = URL.createObjectURL(file);
  });
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const src = Math.min(img.width, img.height);
  const sx = (img.width - src) / 2;
  const sy = (img.height - src) / 2;
  ctx.drawImage(img, sx, sy, src, src, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9));
}

export function AvatarUploader({ currentUrl, uid, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mut = useUpdateAvatar();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setBusy(true);
    try {
      const blob = await resizeToSquare(file);
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const storage = getStorage();
      const objRef = ref(storage, `avatars/${uid}/${filename}`);
      await uploadBytes(objRef, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(objRef);
      await mut.mutateAsync(url);
      onUploaded?.(url);
    } catch (err) {
      setError((err as Error).message || 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      {currentUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt="Current avatar" className="h-24 w-24 rounded-full object-cover" />
      )}
      <label htmlFor="avatar-input" className="inline-flex">
        <input
          id="avatar-input"
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="sr-only"
          aria-label="Upload avatar"
        />
        <Button type="button" isLoading={busy || mut.isPending} onClick={() => inputRef.current?.click()}>
          <Camera className="mr-2 h-4 w-4" /> Upload avatar
        </Button>
      </label>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
npm test -- AvatarUploader 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/AvatarUploader.tsx tests/components/profile/AvatarUploader.test.tsx
git commit -m "feat(profile): add AvatarUploader with client-side resize"
```

---

## Phase 8 — Page integration

### Task 22: Add settings sections to `/profile/edit`

**Files:**
- Modify: `src/app/(main)/profile/edit/page.tsx`

- [ ] **Step 1: Read current structure**

Run:
```bash
wc -l 'src/app/(main)/profile/edit/page.tsx'
grep -n "export default" 'src/app/(main)/profile/edit/page.tsx'
```

- [ ] **Step 2: Add a Settings section block**

Find the JSX root in `src/app/(main)/profile/edit/page.tsx` (likely a `<main>` or `<div>` containing existing edit fields). Above the closing tag, add:

```tsx
import { AvatarUploader } from '@/components/profile/AvatarUploader';
import { SocialLinksForm } from '@/components/profile/SocialLinksForm';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { PrivacySettingsForm } from '@/components/profile/PrivacySettingsForm';
import { defaultNotificationSettings, defaultPrivacySettings } from '@/types/profile';
```

Then inside the JSX, after the existing identity-fields section:
```tsx
{user && (
  <>
    <section id="avatar" className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold">Avatar</h2>
      <AvatarUploader currentUrl={user.avatarUrl ?? null} uid={user.uid} />
    </section>

    <section id="social" className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold">Social links</h2>
      <SocialLinksForm initial={(user as any).socialLinks ?? {}} />
    </section>

    <section id="notifications" className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold">Notification preferences</h2>
      <NotificationSettingsForm initial={(user as any).notificationSettings ?? defaultNotificationSettings} />
    </section>

    <section id="privacy" className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold">Privacy</h2>
      <PrivacySettingsForm initial={(user as any).privacySettings ?? defaultPrivacySettings} />
    </section>
  </>
)}
```

(The `as any` casts cover the User type until that type is extended in a follow-up; the runtime data shape is enforced by the backend functions.)

- [ ] **Step 3: TypeCheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: no new errors.

- [ ] **Step 4: Manual smoke test (dev server)**

Run:
```bash
npm run dev
```
Open http://localhost:3000/profile/edit. Confirm all 4 new sections render. Stop with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(main)/profile/edit/page.tsx'
git commit -m "feat(profile): add avatar/social/notifications/privacy sections to /profile/edit"
```

### Task 23: Add `/profile/settings/notifications` page

**Files:**
- Create: `src/app/(main)/profile/settings/notifications/page.tsx`

- [ ] **Step 1: Write page**

Create the file:
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { defaultNotificationSettings } from '@/types/profile';

export default function NotificationSettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  return (
    <main className="container-mobile py-6">
      <button onClick={() => router.back()} aria-label="Back" className="mb-4 inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="mb-6 text-2xl font-display font-bold">Notification preferences</h1>
      {user && (
        <NotificationSettingsForm
          initial={(user as any).notificationSettings ?? defaultNotificationSettings}
          onSaved={() => router.back()}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: TypeCheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(main)/profile/settings/notifications/page.tsx'
git commit -m "feat(profile): add /profile/settings/notifications page"
```

### Task 24: Add `/profile/settings/privacy` page

**Files:**
- Create: `src/app/(main)/profile/settings/privacy/page.tsx`

- [ ] **Step 1: Write page**

Create the file (same skeleton as Task 23, swap component + defaults):
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { PrivacySettingsForm } from '@/components/profile/PrivacySettingsForm';
import { defaultPrivacySettings } from '@/types/profile';

export default function PrivacySettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  return (
    <main className="container-mobile py-6">
      <button onClick={() => router.back()} aria-label="Back" className="mb-4 inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="mb-6 text-2xl font-display font-bold">Privacy</h1>
      {user && (
        <PrivacySettingsForm
          initial={(user as any).privacySettings ?? defaultPrivacySettings}
          onSaved={() => router.back()}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: TypeCheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(main)/profile/settings/privacy/page.tsx'
git commit -m "feat(profile): add /profile/settings/privacy page"
```

---

## Phase 9 — i18n

### Task 25: Add `profile.settings.*` keys to all 5 locales

**Files:**
- Modify: `src/i18n/messages/en.ts`, `it.ts`, `es.ts`, `de.ts`, `fr.ts`

- [ ] **Step 1: Inspect existing structure of `en.ts`**

Run:
```bash
head -40 src/i18n/messages/en.ts
```
Confirm the format (whether it's a default-exported object, a named export, nested objects, etc.).

- [ ] **Step 2: Add the same key tree to each locale**

In each of the 5 files, add a `profile.settings` key tree. Use English values for `de.ts` and `fr.ts` as a fallback (acceptable per spec). Skeleton:

```ts
// Append into the appropriate location in the existing exported object:
profile: {
  // ... existing profile keys (preserve them) ...
  settings: {
    avatar: { sectionTitle: 'Avatar', uploadCta: 'Upload avatar' },
    social: { sectionTitle: 'Social links', instagram: 'Instagram', facebook: 'Facebook', twitter: 'Twitter / X', linkedin: 'LinkedIn', tiktok: 'TikTok', website: 'Website', invalidUrl: 'Invalid URL' },
    notifications: { sectionTitle: 'Notification preferences', push: 'Push', email: 'Email', sms: 'SMS', booking: 'Booking updates', promotion: 'Promotions', system: 'System messages', chat: 'Chat messages', weeklyDigest: 'Weekly digest', reminder: 'Booking reminders' },
    privacy: { sectionTitle: 'Privacy', visibility: 'Profile visibility', public: 'Public', verifiedOnly: 'Verified only', private: 'Private', showEmail: 'Show email', showPhone: 'Show phone', allowDirectMessages: 'Allow direct messages', shareAnalytics: 'Share analytics' },
    save: 'Save',
    saved: 'Saved',
    saveError: 'Could not save. Try again.',
  },
},
```

Translate the `it.ts` and `es.ts` strings (use Italian and Spanish equivalents). For `de.ts` and `fr.ts`, copy the English strings verbatim and add a `// TODO i18n: localize` comment above the block.

- [ ] **Step 3: TypeCheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/
git commit -m "i18n(profile): add profile.settings keys to all locales (en/it/es localized; de/fr placeholder)"
```

### Task 26: Wire components to use i18n (replace hardcoded strings)

**Files:**
- Modify: each of the 4 form components + 2 page files

- [ ] **Step 1: Identify the project's translation hook**

Run:
```bash
grep -rn "useTranslations\|useT(" --include="*.tsx" src/app/'(main)'/home | head -3
```
Note the import path (likely `next-intl` or a local helper).

- [ ] **Step 2: For each component file, scope the translator at `profile.settings` level (single hook call, then dot-pathed keys)**

Example diff for `SocialLinksForm.tsx`:
```tsx
import { useTranslations } from 'next-intl'; // or whatever import the codebase uses
// ...
export function SocialLinksForm({ initial, onSaved }: Props) {
  const t = useTranslations('profile.settings');
  // Inside JSX: t('social.instagram'), t('social.invalidUrl'), t('save'), etc.
  // For platform-specific labels use t(`social.${name}`).
}
```

Repeat the pattern for `NotificationSettingsForm.tsx` (`t('notifications.push')`, `t('notifications.booking')`, etc.), `PrivacySettingsForm.tsx` (`t('privacy.visibility')`, `t('privacy.public')`, etc.), `AvatarUploader.tsx` (`t('avatar.uploadCta')`), and the two settings pages (`t('notifications.sectionTitle')`, `t('privacy.sectionTitle')`).

- [ ] **Step 3: Update component tests if they assert on English strings**

Tests like `screen.getByText(/^public$/i)` should still pass against English; if the test runner mocks `next-intl` to return keys, adjust as needed.

- [ ] **Step 4: Run all relevant tests**

Run:
```bash
npm test -- profile 2>&1 | tail -20
```
Expected: all profile component tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "i18n(profile): use translations in settings components"
```

---

## Phase 10 — E2E

### Task 27: Playwright E2E

**Files:**
- Create: `e2e/profile-settings.spec.ts`
- Create: `e2e/fixtures/avatar.jpg` (small test image, ~10 KB)

- [ ] **Step 1: Add a fixture image**

Generate or copy any small JPEG to `e2e/fixtures/avatar.jpg` (~256x256 is fine).

- [ ] **Step 2: Write the spec**

Create `e2e/profile-settings.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Profile settings', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes a test user is auto-logged-in via dev fixture; if not, perform login here.
    await page.goto('/profile/edit');
  });

  test('uploads an avatar and persists across reload', async ({ page }) => {
    const fileInput = page.getByLabel(/upload avatar/i);
    await fileInput.setInputFiles(path.resolve(__dirname, 'fixtures/avatar.jpg'));
    await expect(page.getByRole('img', { name: /current avatar/i })).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByRole('img', { name: /current avatar/i })).toBeVisible();
  });

  test('saves social links', async ({ page }) => {
    await page.getByLabel(/instagram/i).fill('https://instagram.com/playwright_test');
    await page.locator('section#social').getByRole('button', { name: /save/i }).click();
    await page.reload();
    await expect(page.getByLabel(/instagram/i)).toHaveValue('https://instagram.com/playwright_test');
  });

  test('toggles notification preferences and persists', async ({ page }) => {
    const toggle = page.getByLabel(/push.*promotion/i);
    const wasChecked = await toggle.isChecked();
    await toggle.click();
    await page.locator('section#notifications').getByRole('button', { name: /save/i }).click();
    await page.reload();
    expect(await toggle.isChecked()).toBe(!wasChecked);
  });

  test('changes privacy visibility and persists', async ({ page }) => {
    await page.getByLabel(/^private$/i).click();
    await page.locator('section#privacy').getByRole('button', { name: /save/i }).click();
    await page.reload();
    await expect(page.getByLabel(/^private$/i)).toBeChecked();
  });
});
```

- [ ] **Step 3: Run Playwright (with dev server and emulator running)**

Open two terminals:
- Terminal A: `npx firebase emulators:start --only firestore,auth,storage,functions --project demo-vfit-test`
- Terminal B: `npm run dev` then in a third terminal `npm run test:e2e -- profile-settings`

(If the harness handles emulator setup, this simplifies. Otherwise document for the executor.)
Expected: all 4 E2E tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/profile-settings.spec.ts e2e/fixtures/avatar.jpg
git commit -m "test(e2e): cover profile settings — avatar, social, notifications, privacy"
```

---

## Phase 11 — Documentation close-out

### Task 28: Update `docs/api/reference.md` — unflag the 4 functions

**Files:**
- Modify: `docs/api/reference.md`

- [ ] **Step 1: Find the warning blocks**

Run:
```bash
grep -n "updateAvatar\|updateSocialLinks\|updateNotificationSettings\|updatePrivacySettings" docs/api/reference.md
```

- [ ] **Step 2: For each of the 4 functions, remove the `> ⚠️ Not currently exported` warning block above it, and update the description to reflect actual signatures**

Replace each warning paragraph with:
```markdown
> ✅ **Implemented (cycle C1, 2026-05).**
```

Update each function's request/response shape to match what's in `functions/src/users/profile.ts`.

- [ ] **Step 3: Commit**

```bash
git add docs/api/reference.md
git commit -m "docs(api): mark profile functions as implemented; sync signatures"
```

### Task 29: Update spec doc status

**Files:**
- Modify: `docs/superpowers/specs/2026-05-16-personal-profile-management-design.md`

- [ ] **Step 1: Bump status**

At the top of the spec file, change `Status: Draft → awaiting user review` to `Status: ✅ Shipped 2026-05-{day}`.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-16-personal-profile-management-design.md
git commit -m "docs(spec): mark C1 personal profile spec as shipped"
```

---

## Phase 12 — Final verification

### Task 30: Run full test suite + verify build

**Files:** None.

- [ ] **Step 1: All backend tests**

Run:
```bash
cd functions && npx firebase emulators:exec --only firestore,auth --project demo-vfit-test "npm test" 2>&1 | tail -15 && cd ..
```
Expected: all tests pass; no failures.

- [ ] **Step 2: All frontend tests**

Run:
```bash
npm test 2>&1 | tail -15
```
Expected: all tests pass.

- [ ] **Step 3: TypeScript build**

Run:
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Lint**

Run:
```bash
npm run lint
cd functions && npm run lint && cd ..
```
Expected: no new lint errors. Fix any introduced.

- [ ] **Step 5: Final commit if lint fixes needed**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: lint fixes from final pass"
```

- [ ] **Step 6: Review commit log**

Run:
```bash
git log --oneline f322df4..HEAD
```
Expected: ~25 atomic commits since the audit follow-up, each one small and reversible.

---

## Definition of Done

Every box below is checked before declaring the cycle shipped:

- [ ] All 4 cloud functions deployed and callable (verified by E2E)
- [ ] Backend test coverage ≥ 80% of `functions/src/users/profile.ts` lines
- [ ] All component tests pass
- [ ] Playwright E2E passes (4 scenarios)
- [ ] Firestore rules tests pass (4 scenarios)
- [ ] Storage rule allows authenticated owner write to `avatars/{uid}/`, rejects others
- [ ] Legacy `notificationsEnabled` readers in `src/`/`functions/src/` are updated to read `notificationSettings` with documented fallback
- [ ] i18n keys present in all 5 locales (en/it/es with translations, de/fr with placeholder + TODO comment)
- [ ] `/profile/edit` shows all 4 new sections on web and native
- [ ] `/profile/settings/notifications` and `/profile/settings/privacy` reachable and functional
- [ ] `docs/api/reference.md` shows the 4 functions as implemented
- [ ] Spec doc marked shipped
- [ ] `npm run build` succeeds; `npm run lint` clean

---

## Open follow-ups (NOT in this cycle — file as tickets for later)

- Extend the `User` TypeScript type to include the 4 new fields cleanly (removes `as any` casts in `/profile/edit`).
- Wire CI to run the new test suites on PR.
- Scheduled job: sweep orphan `avatars/{uid}/*` Storage objects.
- Enforce `privacySettings.profileVisibility` in `getProvider`/`listProviders` read paths.
- Build C2 (provider credentials: certifications, education, availability).

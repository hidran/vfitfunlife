# Native Google/Apple Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google/Apple sign-in work on native iOS (currently hangs) by performing OAuth via `@capacitor-firebase/authentication` and bridging the credential into the JS Firebase SDK with `signInWithCredential`; web unchanged.

**Architecture:** A small `nativeAuth.ts` helper (depends only on `firebase/auth` + the plugin) does plugin-sign-in → `signInWithCredential`. `auth.ts`'s `signInWithGoogle`/`signInWithApple` branch on `Capacitor.isNativePlatform()` to call it (then `updateUserLastLogin`); the web popup path is untouched. Native iOS console/Xcode config is documented for the user.

**Tech Stack:** Capacitor 8, `@capacitor-firebase/authentication`, Firebase JS SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-28-native-oauth-design.md`

---

## File Structure

- `package.json` / lockfile — **modify.** Add `@capacitor-firebase/authentication`.
- `capacitor.config.ts` — **modify.** Add the `FirebaseAuthentication` plugin block.
- `src/lib/firebase/nativeAuth.ts` — **new.** `nativeGoogleSignIn` / `nativeAppleSignIn` (plugin → `signInWithCredential`). Depends only on `firebase/auth` + the plugin → cleanly testable.
- `src/lib/firebase/nativeAuth.test.ts` — **new.** Unit tests (plugin + firebase/auth mocked).
- `src/lib/firebase/auth.ts` — **modify.** `signInWithGoogle`/`signInWithApple` branch on `Capacitor.isNativePlatform()`.
- `docs/mobile/native-google-apple-auth.md` — **new.** iOS console/Xcode config checklist (user-applied).

---

### Task 1: Install the plugin + Capacitor config

**Files:**
- Modify: `package.json` (+ lockfile)
- Modify: `capacitor.config.ts` (the `plugins` block, ~line 28)

- [ ] **Step 1: Install the plugin (Capacitor 8 line)**

```bash
npm install @capacitor-firebase/authentication@^8
```
Run `npm view @capacitor-firebase/authentication@^8 version` first to confirm a v8 exists; if `^8` fails to resolve, install the latest major that lists `@capacitor/core@^8` as a peer dependency and report the version chosen.

- [ ] **Step 2: Add the plugin config**

In `capacitor.config.ts`, inside the `plugins: { ... }` object (alongside `SplashScreen`, `StatusBar`), add:
```ts
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
```

- [ ] **Step 3: Typecheck/build the web bundle**

Run: `npm run build`
Expected: succeeds (the plugin isn't imported anywhere yet; this just confirms the dependency + config don't break the web build).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json capacitor.config.ts
git commit -m "build(native-auth): add @capacitor-firebase/authentication + plugin config"
```

---

### Task 2: Native bridge helper + tests

**Files:**
- Create: `src/lib/firebase/nativeAuth.ts`
- Test: `src/lib/firebase/nativeAuth.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/firebase/nativeAuth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const signInWithGoogleMock = vi.fn();
const signInWithAppleMock = vi.fn();
vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    signInWithGoogle: (...a: unknown[]) => signInWithGoogleMock(...a),
    signInWithApple: (...a: unknown[]) => signInWithAppleMock(...a),
  },
}));

const signInWithCredentialMock = vi.fn();
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: (idToken: string) => ({ providerId: 'google.com', idToken }) },
  OAuthProvider: class {
    providerId: string;
    constructor(id: string) { this.providerId = id; }
    credential(opts: { idToken?: string; rawNonce?: string }) { return { providerId: this.providerId, ...opts }; }
  },
  signInWithCredential: (...a: unknown[]) => signInWithCredentialMock(...a),
}));

import { nativeGoogleSignIn, nativeAppleSignIn } from './nativeAuth';

beforeEach(() => vi.clearAllMocks());

describe('nativeGoogleSignIn', () => {
  it('bridges the native Google idToken into signInWithCredential and returns the user', async () => {
    signInWithGoogleMock.mockResolvedValue({ credential: { idToken: 'google-id-token' } });
    signInWithCredentialMock.mockResolvedValue({ user: { uid: 'u1' } });
    const authInstance = {} as never;
    const user = await nativeGoogleSignIn(authInstance);
    expect(signInWithGoogleMock).toHaveBeenCalled();
    expect(signInWithCredentialMock).toHaveBeenCalledWith(authInstance, { providerId: 'google.com', idToken: 'google-id-token' });
    expect(user).toEqual({ uid: 'u1' });
  });
  it('throws when no idToken is returned', async () => {
    signInWithGoogleMock.mockResolvedValue({ credential: {} });
    await expect(nativeGoogleSignIn({} as never)).rejects.toThrow(/Google ID token/);
    expect(signInWithCredentialMock).not.toHaveBeenCalled();
  });
});

describe('nativeAppleSignIn', () => {
  it('bridges the native Apple idToken + nonce into signInWithCredential', async () => {
    signInWithAppleMock.mockResolvedValue({ credential: { idToken: 'apple-id-token', nonce: 'abc' } });
    signInWithCredentialMock.mockResolvedValue({ user: { uid: 'u2' } });
    const authInstance = {} as never;
    const user = await nativeAppleSignIn(authInstance);
    expect(signInWithCredentialMock).toHaveBeenCalledWith(authInstance, { providerId: 'apple.com', idToken: 'apple-id-token', rawNonce: 'abc' });
    expect(user).toEqual({ uid: 'u2' });
  });
  it('throws when no Apple idToken is returned', async () => {
    signInWithAppleMock.mockResolvedValue({ credential: {} });
    await expect(nativeAppleSignIn({} as never)).rejects.toThrow(/Apple ID token/);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — `npx vitest run src/lib/firebase/nativeAuth.test.ts` (module not found).

- [ ] **Step 3: Implement** — `src/lib/firebase/nativeAuth.ts`:

```ts
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  type Auth,
  type User,
} from 'firebase/auth';

/**
 * Native Google sign-in via @capacitor-firebase/authentication, bridged into the
 * JS Firebase SDK with signInWithCredential (the plugin runs with skipNativeAuth,
 * so the JS SDK remains the single source of auth truth). Use only on native.
 */
export async function nativeGoogleSignIn(authInstance: Auth): Promise<User> {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('No Google ID token returned from native sign-in');
  const cred = await signInWithCredential(authInstance, GoogleAuthProvider.credential(idToken));
  return cred.user;
}

/** Native Apple sign-in, bridged into the JS SDK (uses the nonce the plugin generated). */
export async function nativeAppleSignIn(authInstance: Auth): Promise<User> {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const result = await FirebaseAuthentication.signInWithApple();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('No Apple ID token returned from native sign-in');
  const provider = new OAuthProvider('apple.com');
  const cred = await signInWithCredential(
    authInstance,
    provider.credential({ idToken, rawNonce: result.credential?.nonce })
  );
  return cred.user;
}
```

- [ ] **Step 4: Run, confirm PASS** — `npx vitest run src/lib/firebase/nativeAuth.test.ts` (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/nativeAuth.ts src/lib/firebase/nativeAuth.test.ts
git commit -m "feat(native-auth): native Google/Apple credential bridge to JS SDK"
```

---

### Task 3: Branch signInWithGoogle/Apple on native

**Files:**
- Modify: `src/lib/firebase/auth.ts` (`signInWithGoogle` ~line 91, `signInWithApple` ~line 147)

`Capacitor` is already imported in this file (`import { Capacitor } from "@capacitor/core"`, line 23). `auth` is imported from `./config`. `updateUserLastLogin` exists in this file.

- [ ] **Step 1: Import the helpers**

Add near the top imports of `auth.ts`:
```ts
import { nativeGoogleSignIn, nativeAppleSignIn } from "./nativeAuth";
```

- [ ] **Step 2: Native branch in `signInWithGoogle`**

In `signInWithGoogle`, immediately after `provider.addScope("profile");` (before the `// Use popup for all platforms` web block), insert:
```ts
  if (Capacitor.isNativePlatform()) {
    console.log('[Auth] Using native Google sign-in');
    const user = await nativeGoogleSignIn(auth);
    await updateUserLastLogin(user.uid);
    return user;
  }
```
(Leave the existing web popup/redirect code that follows unchanged — it now only runs on web.)

- [ ] **Step 3: Native branch in `signInWithApple`**

In `signInWithApple`, after `provider.addScope("name");` (before the web popup block), insert:
```ts
  if (Capacitor.isNativePlatform()) {
    console.log('[Auth] Using native Apple sign-in');
    const user = await nativeAppleSignIn(auth);
    await updateUserLastLogin(user.uid);
    return user;
  }
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds. The native plugin is only reached via the dynamic `import()` inside `nativeAuth.ts` under `isNativePlatform()`, so the web bundle/static export must still build cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/auth.ts
git commit -m "feat(native-auth): use native sign-in on Capacitor; web popup unchanged"
```

---

### Task 4: iOS native-config documentation

**Files:**
- Create: `docs/mobile/native-google-apple-auth.md`

- [ ] **Step 1: Write the checklist doc**

Create `docs/mobile/native-google-apple-auth.md` documenting the user-applied native steps (these make the feature functional on device; the code/config above is complete without them but native auth won't work until they're done):

```markdown
# Native Google & Apple Sign-In — iOS setup

The app uses `@capacitor-firebase/authentication` for native Google/Apple sign-in
(bridged into the Firebase JS SDK). The code + `capacitor.config.ts` are in the repo.
These iOS steps must be applied in the Firebase console + Xcode, then tested on device.

## 1. Firebase console
- In the `vfit-funlife` project, add an **iOS app** with bundle id `com.vfit.app`.
- Download its **`GoogleService-Info.plist`**.
- Under **Authentication → Sign-in method**, ensure **Google** and **Apple** are enabled.

## 2. Add GoogleService-Info.plist
- Place `GoogleService-Info.plist` in `ios/App/App/` and add it to the **App** target in Xcode
  (drag into the project, "Copy items if needed", target checked).

## 3. Google URL scheme
- Open `GoogleService-Info.plist`, copy the **`REVERSED_CLIENT_ID`** value.
- In `ios/App/App/Info.plist`, add a `CFBundleURLTypes` entry whose `CFBundleURLSchemes`
  array contains that `REVERSED_CLIENT_ID` (lets Google redirect back into the app).

## 4. Apple Sign In
- In Xcode, on the **App** target → **Signing & Capabilities**, add **"Sign in with Apple"**.
- In the Apple Developer account + Firebase Apple provider config, set up the Services ID / key
  (see Firebase "Sign in with Apple" provider setup).

## 5. Sync + run
- `npx cap sync ios`
- Open `ios/App/App.xcworkspace` (or via `npx cap open ios`), build, and run on a device/simulator.
- Test: "Continue with Google" / "Continue with Apple" → native sheet → returns signed in.
```

- [ ] **Step 2: Commit**

```bash
git add docs/mobile/native-google-apple-auth.md
git commit -m "docs(native-auth): iOS Google/Apple sign-in setup checklist"
```

---

### Task 5: Verification

**Files:** none.

- [ ] **Step 1: Unit tests** — `npx vitest run src/lib/firebase/nativeAuth.test.ts` (4 pass). Also run the existing `src/stores/authStore.redirect.test.ts` to confirm no regression: `npx vitest run src/stores/authStore.redirect.test.ts`.
- [ ] **Step 2: Build** — `npm run build` (succeeds; web static export unaffected).
- [ ] **Step 3: cap sync (best effort)** — `npx cap sync ios 2>&1 | tail -20`. If it runs, confirm the plugin is listed/linked. If it requires Xcode/CocoaPods/SPM resolution unavailable in this environment, note that and defer to the user. (Not a blocker for the code being correct.)
- [ ] **Step 4: Hand off device steps** — the on-device test + the iOS console/Xcode config (`docs/mobile/native-google-apple-auth.md`) are the user's; report that clearly.

---

## Notes for the implementer
- Do NOT change `authStore.loginWithGoogle`/`loginWithApple` — they already consume the returned user; the native branch just makes that promise resolve instead of hanging.
- Keep the web popup/redirect path exactly as-is (only runs when `!Capacitor.isNativePlatform()`).
- The plugin must only be imported via the dynamic `import()` in `nativeAuth.ts` so it stays out of the web bundle.
- You cannot verify native auth from this environment — the build + unit tests are the automated gate; on-device is the user's.

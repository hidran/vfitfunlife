# Native Google/Apple Sign-In (Capacitor)

**Date:** 2026-05-28
**Branch:** `main`
**Status:** Design approved by user (approach: native plugin); ready for implementation plan

## Problem

On the native iOS app, Google (and Apple) sign-in **hangs**. Root cause: `signInWithGoogle`/`signInWithApple` (`src/lib/firebase/auth.ts`) use the Firebase **Web SDK** `signInWithPopup` on all platforms. In a Capacitor WebView (custom scheme `VFit` / `capacitor://`), the OAuth popup's cross-origin `postMessage` can't deliver the credential back to the WebView origin, so `await signInWithPopup(...)` never resolves or rejects → the login hangs (loading state stuck). The `signInWithRedirect` fallback (only on `auth/popup-blocked`) also can't round-trip into a native WebView. No native auth plugin is installed and there is no iOS Google/Apple OAuth config — web OAuth is fundamentally incompatible with the native shell.

## Goals

- Google and Apple sign-in **work on native iOS** without hanging, returning to the app signed in.
- The rest of the app's auth state is unchanged: it keeps using the **JS SDK** (`authStore`, `onAuthStateChanged`, `auth.currentUser`) — native sign-in bridges into the JS SDK via `signInWithCredential`.
- **Web behavior is unchanged** (keep the existing popup/redirect flow on web/PWA).

## Non-goals

- Phone/email auth (already work in the WebView).
- Android-specific verification (the report is iOS; the plugin supports Android too, and the code path is shared, but on-device Android testing is out of scope here).
- Migrating the whole app to the native Firebase SDK (we bridge to the JS SDK to avoid a large rewrite).

## Architecture

### Dependency

Add `@capacitor-firebase/authentication` (the standard Capacitor Firebase auth plugin), version aligned with **Capacitor 8** (`@capacitor-firebase/authentication@^8`). Configure it to NOT sign into the native Firebase SDK (we use the JS SDK):

`capacitor.config.ts` → `plugins`:
```ts
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
```
`skipNativeAuth: true` means the plugin performs the native OAuth and **returns the credential** without creating a separate native-SDK session, so the JS SDK remains the single source of auth truth.

### Platform-branched sign-in — `src/lib/firebase/auth.ts`

`isNativePlatform()` already exists (`@/lib/utils` / `Capacitor`). Branch both functions:

```ts
// signInWithGoogle()
if (isNativePlatform()) {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('No Google ID token returned');
  const credential = GoogleAuthProvider.credential(idToken);
  const userCred = await signInWithCredential(auth, credential);
  await updateUserLastLogin(userCred.user.uid);
  return userCred.user;
}
// ...else existing web popup flow unchanged
```

```ts
// signInWithApple()
if (isNativePlatform()) {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const result = await FirebaseAuthentication.signInWithApple();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('No Apple ID token returned');
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken,
    rawNonce: result.credential?.nonce, // plugin supplies the nonce it used
  });
  const userCred = await signInWithCredential(auth, credential);
  await updateUserLastLogin(userCred.user.uid);
  return userCred.user;
}
// ...else existing web popup flow unchanged
```

The dynamic `import('@capacitor-firebase/authentication')` keeps the native plugin out of the web bundle (only loaded when `isNativePlatform()`). `signInWithCredential`, `GoogleAuthProvider`, `OAuthProvider` are already imported in this file; `auth` is the JS SDK instance from `./config`.

`authStore.loginWithGoogle`/`loginWithApple` need **no change** — they already `await signInWithGoogle()` and set `firebaseUser` from the returned user (the native branch now returns a real user instead of hanging).

### Native iOS configuration (USER-applied — cannot be done/verified from this environment)

Documented as a checklist (a `docs/mobile/native-google-apple-auth.md`); the user performs these in Firebase console + Xcode + on device:

1. **Firebase console:** register the **iOS app** (bundle id `com.vfit.app`) under the `vfit-funlife` project; download its **`GoogleService-Info.plist`**. Ensure the **Google** and **Apple** sign-in providers are enabled in Authentication.
2. **Add `GoogleService-Info.plist`** to `ios/App/App/` and to the Xcode app target.
3. **URL scheme:** add the `REVERSED_CLIENT_ID` value from `GoogleService-Info.plist` to `ios/App/App/Info.plist` under `CFBundleURLTypes` → `CFBundleURLSchemes` (lets Google redirect back into the app).
4. **Apple:** enable the **"Sign in with Apple"** capability on the Xcode target; configure the Apple provider (Services ID / key) in Firebase Authentication.
5. `npx cap sync ios` to install the plugin's native code; open Xcode, build, and test on device.

(`capacitor.config.ts` + the code changes are mine; steps 1–5 are the user's. The feature is non-functional on device until these are applied.)

## Error handling

| Case | Behavior |
|---|---|
| User cancels the native sheet | Plugin rejects (e.g. canceled) → caught by `loginWithGoogle`'s existing try/catch → loading cleared, no hang. |
| No idToken in result | Throw a clear error → caught → error surfaced, loading cleared. |
| Plugin not configured (missing GoogleService-Info.plist) | Native call rejects with a config error → caught → error shown (not a hang). |
| Web/PWA | Unchanged popup/redirect path. |

## Testing

- **Unit (`src/lib/firebase/auth.test.ts` or similar):** with `isNativePlatform` mocked `true` and `@capacitor-firebase/authentication` mocked to return a fake `{ credential: { idToken } }`, and `signInWithCredential` mocked, assert `signInWithGoogle` calls the plugin + bridges via `signInWithCredential` and returns the user; with `isNativePlatform` `false`, asserts the web `signInWithPopup` path is used. (Pure-ish via mocks — no device.)
- **Manual (user, on device):** after applying the iOS config, tap "Continue with Google" / "Continue with Apple" on the iPhone → native sheet appears → completes → app is signed in (no hang). Confirm web sign-in still works.

## Implementation ordering (for writing-plans)

1. Install `@capacitor-firebase/authentication@^8`; add the `FirebaseAuthentication` plugin block to `capacitor.config.ts`.
2. Branch `signInWithGoogle` (native → plugin + `signInWithCredential`) with unit tests (plugin + platform mocked).
3. Branch `signInWithApple` likewise (with nonce).
4. `docs/mobile/native-google-apple-auth.md` — the iOS console/Xcode checklist (steps 1–5 above).
5. Verify: unit tests, `npm run build` (web bundle must still build; the dynamic import must not break web), `npx cap sync ios` if runnable. Note: on-device verification is the user's.

## Risks

| Risk | Mitigation |
|---|---|
| Plugin version mismatch with Capacitor 8 | Pin `@^8`; `npm view @capacitor-firebase/authentication versions` to confirm; the plugin major tracks Capacitor major. |
| Native plugin code imported into the web bundle | Dynamic `import()` inside the `isNativePlatform()` branch only — never evaluated on web; verify `npm run build` succeeds. |
| Native session not visible to the JS SDK | `skipNativeAuth: true` + `signInWithCredential` puts the session in the JS SDK (the app's source of truth); the existing `onAuthStateChanged` then fires. |
| Apple nonce handling | Use the `nonce` the plugin returns as `rawNonce` in `OAuthProvider.credential`. |
| iOS config not applied ⇒ still broken on device | Documented as explicit user steps; the feature is code-complete but device-functional only after the console/Xcode config. |
| `npx cap sync`/build can't be verified here | Code + config done in-repo; build/run/test on device is the user's step. |

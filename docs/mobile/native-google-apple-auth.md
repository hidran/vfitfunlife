# Native Google & Apple Sign-In — iOS setup

The app uses [`@capacitor-firebase/authentication`](https://github.com/capawesome-team/capacitor-firebase) for native Google/Apple sign-in, bridged into the Firebase **JS SDK** via `signInWithCredential` (the plugin runs with `skipNativeAuth: true`, so the JS SDK stays the single source of auth truth).

**Why:** the web `signInWithPopup` flow hangs inside the iOS WebView — the OAuth popup can't post the credential back to the `capacitor://` origin. The native plugin performs the OAuth natively instead.

The code + `capacitor.config.ts` (`FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com','apple.com'] }`) are already in the repo. **Native auth will not work on device until the steps below are applied.** These require the Firebase console + Xcode + an Apple Developer account, and on-device testing.

## 1. Firebase console
- In the **`vfit-funlife`** project, add an **iOS app** with bundle id **`com.vfit.app`**.
- Download its **`GoogleService-Info.plist`**.
- Under **Authentication → Sign-in method**, ensure **Google** and **Apple** are enabled.

## 2. Add GoogleService-Info.plist to the iOS project
- Put `GoogleService-Info.plist` in `ios/App/App/`.
- In Xcode, drag it into the **App** target ("Copy items if needed", target checked) so it's bundled.

## 3. Google URL scheme (so Google can redirect back into the app)
- Open `GoogleService-Info.plist` and copy the **`REVERSED_CLIENT_ID`** value (looks like `com.googleusercontent.apps.XXXX-YYYY`).
- In `ios/App/App/Info.plist`, add a `CFBundleURLTypes` entry whose `CFBundleURLSchemes` array contains that `REVERSED_CLIENT_ID`. Example:
  ```xml
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>com.googleusercontent.apps.XXXX-YYYY</string>
      </array>
    </dict>
  </array>
  ```

## 4. Sign in with Apple
- In Xcode: **App** target → **Signing & Capabilities** → **+ Capability** → **Sign in with Apple**.
- Configure the **Apple** provider in Firebase Authentication (Services ID + key) per Firebase's "Sign in with Apple" provider setup, and ensure the app's bundle id / Apple Developer config match.

## 5. Sync, build, test on device
```bash
npm run build          # produce the web bundle (out/)
npx cap sync ios       # install the plugin's native code into the iOS project
npx cap open ios       # open Xcode
```
- Build & run on a device or simulator.
- Tap **Continue with Google** / **Continue with Apple** → the native sheet should appear → completing it returns to the app **signed in** (no hang).
- Confirm web sign-in (browser / PWA) still works (it uses the unchanged popup flow).

## Notes
- Android uses the same plugin + code path; if you ship Android, add `google-services.json` and the SHA-1/256 fingerprints in Firebase, then `npx cap sync android`.
- The plugin version is pinned to the Capacitor 8 line (`@capacitor-firebase/authentication@^8`).

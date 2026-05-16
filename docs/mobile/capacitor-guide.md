# VFit Mobile App Development Guide

This project uses [Capacitor](https://capacitorjs.com/) to build native iOS and Android apps from the Next.js frontend.

## Prerequisites

### iOS Development
- macOS with Xcode 15+ installed
- Apple Developer account (for device testing and App Store)
- CocoaPods (`sudo gem install cocoapods`)

### Android Development
- Android Studio Hedgehog (2023.1.1) or newer
- Android SDK with API 34
- Java 17 (set `JAVA_HOME` environment variable)

## Quick Start

### 1. Build the Web App
```bash
npm run mobile:build
```

### 2. Sync with Native Platforms
```bash
npm run mobile:sync
```

### 3. Open in Native IDE

**iOS:**
```bash
npm run mobile:open:ios
```

**Android:**
```bash
npm run mobile:open:android
```

Then build and run from Xcode/Android Studio.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run mobile:build` | Build Next.js for static export |
| `npm run mobile:sync` | Sync web assets to native platforms |
| `npm run mobile:copy` | Copy web assets without updating native deps |
| `npm run mobile:ios` | Build and sync iOS |
| `npm run mobile:android` | Build and sync Android |
| `npm run mobile:open:ios` | Open iOS project in Xcode |
| `npm run mobile:open:android` | Open Android project in Android Studio |
| `npm run mobile:run:ios` | Run on iOS simulator/device |
| `npm run mobile:run:android` | Run on Android emulator/device |

## Development Workflow

### Regular Development (Web)
```bash
npm run dev
```

### Testing on Mobile
1. Make changes to the web code
2. Build: `npm run mobile:build`
3. Sync: `npm run mobile:sync`
4. Run from Xcode/Android Studio

### Live Reload (Optional)
For faster development, use Capacitor's live reload:

```bash
# In one terminal
npm run dev

# In another terminal
npx cap run ios --livereload --external
# or
npx cap run android --livereload --external
```

## Project Structure

```
/ios/           - iOS Xcode project
/android/       - Android Studio project
/out/           - Static web build output (synced to native platforms)
```

## Native Configuration

### iOS
- Bundle ID: `com.vfit.app`
- Deployment Target: iOS 14.0+
- Located in: `ios/App/App.xcworkspace`

### Android
- Application ID: `com.vfit.app`
- Min SDK: 24 (Android 7.0)
- Target SDK: 34 (Android 14)
- Located in: `android/` (open `build.gradle` in Android Studio)

## Capacitor Plugins Installed

| Plugin | Purpose |
|--------|---------|
| `@capacitor/app` | App lifecycle, deep links |
| `@capacitor/camera` | Camera access |
| `@capacitor/device` | Device info |
| `@capacitor/geolocation` | GPS location |
| `@capacitor/haptics` | Haptic feedback |
| `@capacitor/keyboard` | Keyboard handling |
| `@capacitor/local-notifications` | Local notifications |
| `@capacitor/network` | Network status |
| `@capacitor/preferences` | Local storage (key-value) |
| `@capacitor/push-notifications` | Push notifications |
| `@capacitor/share` | Native share sheet |
| `@capacitor/splash-screen` | Splash screen |
| `@capacitor/status-bar` | Status bar styling |

## Icons and Splash Screens

Place your assets in:
- `resources/icon.png` - App icon (1024x1024)
- `resources/splash.png` - Splash screen (2732x2732)

Then generate all sizes:
```bash
npm install -g @capacitor/assets
npx capacitor-assets generate
```

## Building for Production

### iOS
1. Open `ios/App/App.xcworkspace` in Xcode
2. Select "Any iOS Device" as target
3. Product > Archive
4. Distribute App via App Store Connect

### Android
1. Open `android/` folder in Android Studio
2. Build > Generate Signed Bundle/APK
3. Upload AAB to Google Play Console

## Troubleshooting

### iOS Build Issues
```bash
cd ios/App
pod install --repo-update
cd ../..
npx cap sync ios
```

### Android Build Issues
1. Check Java version: `java -version` (should be 17)
2. In Android Studio: File > Sync Project with Gradle Files
3. Clean build: Build > Clean Project

### Sync Issues
```bash
# Clean and rebuild
rm -rf out
npm run mobile:build
npx cap sync
```

## Environment Variables

Create `.env.local` for web development. For native apps, some variables need to be configured in:
- iOS: `ios/App/App/Info.plist`
- Android: `android/app/src/main/res/values/strings.xml`

## Firebase Configuration

The Firebase config is already set up for web. For native apps:

### iOS
1. Download `GoogleService-Info.plist` from Firebase Console
2. Place in `ios/App/App/`
3. Add to Xcode project

### Android
1. Download `google-services.json` from Firebase Console  
2. Place in `android/app/`

## Support

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [iOS Development Guide](https://capacitorjs.com/docs/ios)
- [Android Development Guide](https://capacitorjs.com/docs/android)

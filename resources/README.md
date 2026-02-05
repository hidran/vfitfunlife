# Mobile App Resources

This folder contains assets for the native mobile apps (iOS & Android).

## Required Files

### App Icon
- **File**: `icon.png`
- **Size**: 1024x1024 pixels
- **Format**: PNG with transparency
- **Purpose**: App icon on home screen and app stores

### Splash Screen
- **File**: `splash.png`
- **Size**: 2732x2732 pixels
- **Format**: PNG
- **Purpose**: Loading screen shown when app starts
- **Notes**: Design for center-safe area (content in center 1200x1200 will be visible on all devices)

### Optional: Dark Mode Splash
- **File**: `splash-dark.png`
- **Size**: 2732x2732 pixels
- **Purpose**: Splash screen for dark mode

## Generating Assets

Once you have the source files, run:

```bash
# Install the asset generator globally
npm install -g @capacitor/assets

# Generate all icon and splash sizes for iOS and Android
npx capacitor-assets generate
```

This will create:
- `ios/App/App/Assets.xcassets/` - iOS icons and splash screens
- `android/app/src/main/res/` - Android icons and splash screens

## Design Guidelines

### App Icon
- Keep design simple and recognizable
- Avoid text (won't be readable at small sizes)
- Use the VFit brand colors (#00C9FF, #7B61FF)
- Test on both light and dark backgrounds

### Splash Screen
- Use the app background color (#1A1D29)
- Center the logo or brand mark
- Keep it minimal - it's only shown briefly
- Ensure logo is within 1200x1200 center area

## Manual Asset Replacement

If you prefer to manually update assets:

### iOS
1. Open `ios/App/App.xcworkspace` in Xcode
2. Go to `App > Assets.xcassets`
3. Replace images in `AppIcon` and `Splash` sets

### Android
1. Open `android/` folder in Android Studio
2. Replace files in:
   - `app/src/main/res/mipmap-*/` - App icons
   - `app/src/main/res/drawable-*/` - Splash screens

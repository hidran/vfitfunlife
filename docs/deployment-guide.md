# Deployment Guide - V Fitness

## Development Environment Setup

### Prerequisites

```bash
# Node.js (LTS version)
node --version  # v18+ required

# npm or yarn
npm --version

# Firebase CLI
npm install -g firebase-tools
firebase --version

# Capacitor CLI
npm install -g @capacitor/cli
```

### Initial Setup

```bash
# 1. Clone repository
git clone <repository-url>
cd vfit

# 2. Install dependencies
npm install

# 3. Install Cloud Functions dependencies
cd functions
npm install
cd ..

# 4. Set up environment variables
cp .env.example .env.local

# Edit .env.local with your Firebase credentials
```

---

## Environment Variables

### `.env.local` (Development)

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=vfit-dev.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=vfit-dev
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=vfit-dev.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABC123

# Stripe (Test Keys)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_USE_EMULATORS=true

# Environment
NODE_ENV=development
```

### `.env.production` (Production)

```bash
# Use production Firebase project
NEXT_PUBLIC_FIREBASE_PROJECT_ID=vfit-prod
# ... production keys

# Stripe Live Keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...

# Production URL
NEXT_PUBLIC_APP_URL=https://app.vfitfunlife.com
NEXT_PUBLIC_USE_EMULATORS=false

NODE_ENV=production
```

---

## Firebase Project Setup

### 1. Create Firebase Projects

```bash
# Login to Firebase
firebase login

# Create projects (via Firebase Console)
# - vfit-dev (Development)
# - vfit-staging (Staging)
# - vfit-prod (Production)

# Initialize Firebase in project
firebase init
```

Select:
- ✅ Firestore
- ✅ Functions
- ✅ Hosting
- ✅ Storage
- ✅ Emulators

### 2. Configure Project Aliases

```bash
# Link to Firebase projects
firebase use --add

# Add aliases
firebase use --alias dev vfit-dev
firebase use --alias staging vfit-staging
firebase use --alias production vfit-prod

# Switch between environments
firebase use dev
firebase use production
```

### 3. Deploy Firestore Rules & Indexes

```bash
# Deploy security rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes

# Deploy storage rules
firebase deploy --only storage
```

### 4. Configure Cloud Functions

```bash
# Set environment variables for Functions
firebase functions:config:set stripe.secret_key="sk_live_..." \
  stripe.webhook_secret="whsec_..." \
  --project production

# View current config
firebase functions:config:get
```

---

## Local Development

### Run Development Server

```bash
# Start Next.js dev server
npm run dev

# Open http://localhost:3000
```

### Run Firebase Emulators

```bash
# Start all emulators
firebase emulators:start

# Emulators will run on:
# - Auth: http://localhost:9099
# - Firestore: http://localhost:8080
# - Functions: http://localhost:5001
# - Storage: http://localhost:9199
# - UI: http://localhost:4000
```

### Test with Emulators

```bash
# In separate terminal, run dev server with emulators
NEXT_PUBLIC_USE_EMULATORS=true npm run dev
```

---

## Web Build & Deployment

### Build Static Export

```bash
# Build Next.js for production
npm run build

# Output will be in /out directory
```

### Deploy to Firebase Hosting

```bash
# Deploy to development
firebase use dev
firebase deploy --only hosting

# Deploy to staging
firebase use staging
firebase deploy --only hosting

# Deploy to production
firebase use production
firebase deploy --only hosting
```

### Deploy Cloud Functions

```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:createBooking

# Deploy with specific region
firebase deploy --only functions --region europe-west1
```

### Complete Deployment

```bash
# Deploy everything (hosting + functions + rules)
firebase deploy

# Deploy to specific environment
firebase use production
firebase deploy
```

---

## Mobile App Build (iOS)

### Prerequisites

```bash
# Install Xcode (from App Store)
xcode-select --install

# Install CocoaPods
sudo gem install cocoapods

# Verify installation
pod --version
```

### Initial Setup

```bash
# Add iOS platform
npx cap add ios

# Or if already added, sync
npx cap sync ios
```

### Configure iOS Project

1. Open Xcode:
```bash
npx cap open ios
```

2. Configure in Xcode:
   - **Bundle Identifier:** `com.vfit.app`
   - **Team:** Select your Apple Developer team
   - **Signing:** Enable "Automatically manage signing"
   - **Deployment Target:** iOS 13.0+

3. Configure `Info.plist`:
```xml
<!-- Camera permissions -->
<key>NSCameraUsageDescription</key>
<string>We need camera access to upload your profile photo</string>

<!-- Location permissions -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need your location to find nearby gyms and services</string>

<!-- Photo library -->
<key>NSPhotoLibraryUsageDescription</key>
<string>We need access to your photos to upload images</string>
```

### Build for iOS

```bash
# Development build
npx cap run ios

# Or build in Xcode manually:
# Product → Archive
```

### App Store Submission

1. **Create App in App Store Connect**
   - Bundle ID: `com.vfit.app`
   - App Name: "V Fitness & Wellness"

2. **Archive in Xcode**
   - Product → Archive
   - Distribute App → App Store Connect
   - Upload

3. **TestFlight**
   - Add beta testers
   - Distribute for testing

4. **Submit for Review**
   - Fill metadata
   - Add screenshots
   - Submit

---

## Mobile App Build (Android)

### Prerequisites

```bash
# Install Android Studio
# Download from: https://developer.android.com/studio

# Install Java JDK 17
java --version
```

### Initial Setup

```bash
# Add Android platform
npx cap add android

# Or sync if already added
npx cap sync android
```

### Configure Android Project

1. Open Android Studio:
```bash
npx cap open android
```

2. Configure `app/build.gradle`:
```gradle
android {
    namespace "com.vfit.app"
    compileSdk 34

    defaultConfig {
        applicationId "com.vfit.app"
        minSdk 22
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }
}
```

3. Configure permissions in `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

### Generate Signing Key

```bash
# Generate keystore
keytool -genkey -v -keystore vfit-release.keystore \
  -alias vfit -keyalg RSA -keysize 2048 -validity 10000

# Store keystore securely!
```

Configure `gradle.properties`:
```properties
VFIT_RELEASE_STORE_FILE=vfit-release.keystore
VFIT_RELEASE_KEY_ALIAS=vfit
VFIT_RELEASE_STORE_PASSWORD=<password>
VFIT_RELEASE_KEY_PASSWORD=<password>
```

### Build APK/Bundle

```bash
# Debug build
npx cap run android

# Release build (in Android Studio)
# Build → Generate Signed Bundle/APK
# Select "Android App Bundle"
```

### Google Play Console Submission

1. **Create App in Google Play Console**
   - Package name: `com.vfit.app`
   - App name: "V Fitness & Wellness"

2. **Upload Bundle**
   - Production → Create new release
   - Upload AAB file
   - Add release notes

3. **Internal Testing**
   - Add testers
   - Distribute

4. **Submit for Review**
   - Fill store listing
   - Add screenshots
   - Submit

---

## CI/CD Pipeline (GitHub Actions)

### `.github/workflows/deploy-web.yml`

```yaml
name: Deploy Web

on:
  push:
    branches: [main, staging, develop]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build Next.js
        env:
          NEXT_PUBLIC_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          # ... other env vars
        run: npm run build

      - name: Deploy to Firebase Hosting
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: vfit-prod
```

### `.github/workflows/deploy-functions.yml`

```yaml
name: Deploy Cloud Functions

on:
  push:
    branches: [main]
    paths:
      - 'functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Functions dependencies
        working-directory: functions
        run: npm ci

      - name: Deploy Functions
        uses: w9jds/firebase-action@master
        with:
          args: deploy --only functions
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

### Setup GitHub Secrets

```bash
# Generate Firebase token
firebase login:ci

# Add to GitHub Secrets:
# - FIREBASE_TOKEN
# - FIREBASE_SERVICE_ACCOUNT (JSON)
# - All NEXT_PUBLIC_* environment variables
```

---

## Monitoring & Logging

### View Logs

```bash
# Cloud Functions logs
firebase functions:log

# Realtime logs
firebase functions:log --follow

# Specific function
firebase functions:log --only createBooking
```

### Firebase Console

- **Performance Monitoring:** Track app performance
- **Crashlytics:** Monitor crashes
- **Analytics:** User behavior
- **A/B Testing:** Test features

### Error Tracking

Setup Sentry or similar:

```bash
npm install @sentry/nextjs

# Configure sentry.client.config.js
```

---

## Environment Management

### Development Workflow

```
[Local Dev] → [Dev Environment] → [Staging] → [Production]
    ↓              ↓                  ↓            ↓
Emulators     Firebase Dev     Firebase Stage  Firebase Prod
```

### Branch Strategy

```
main → Production
staging → Staging environment
develop → Development environment
feature/* → Local development
```

### Deployment Checklist

Before deploying to production:

- [ ] Run tests: `npm test`
- [ ] Build successfully: `npm run build`
- [ ] Test on emulators
- [ ] Deploy to staging first
- [ ] Smoke test on staging
- [ ] Backup Firestore data
- [ ] Deploy to production
- [ ] Verify production deployment
- [ ] Monitor logs for errors

---

## Rollback Procedure

### Rollback Hosting

```bash
# List previous deployments
firebase hosting:clone --only hosting

# Rollback to specific version
firebase hosting:rollback <version>
```

### Rollback Functions

```bash
# Deploy previous version from git
git checkout <previous-commit>
firebase deploy --only functions
```

---

## Troubleshooting

### Common Issues

**Build fails with "Module not found"**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Capacitor sync fails**
```bash
npx cap sync --force
```

**Firebase functions timeout**
- Increase timeout in `firebase.json`:
```json
{
  "functions": {
    "timeout": "60s"
  }
}
```

**iOS build fails**
```bash
cd ios/App
pod install
cd ../..
npx cap sync ios
```

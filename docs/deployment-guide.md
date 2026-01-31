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

## Deploying Cloud Functions

### Function Deployment Strategies

```bash
# Deploy all functions at once
firebase deploy --only functions

# Deploy specific function by name
firebase deploy --only functions:initializeUserProfile
firebase deploy --only functions:createBooking
firebase deploy --only functions:processScheduledTasks

# Deploy functions in a specific region
firebase deploy --only functions --region europe-west1

# Deploy with timeout/memory configuration
# (configured in firebase.json or function code)
```

### Setting Function Configuration

```bash
# Set environment variables
firebase functions:config:set stripe.secret_key="sk_live_xxx"
firebase functions:config:set stripe.webhook_secret="whsec_xxx"
firebase functions:config:set sendgrid.api_key="SG.xxx"
firebase functions:config:set app.url="https://app.vfitfunlife.com"

# Set different values per environment
firebase functions:config:set stripe.secret_key="sk_test_xxx" --project vfit-dev
firebase functions:config:set stripe.secret_key="sk_live_xxx" --project vfit-prod
```

### Function Secrets (Recommended)

```bash
# Store secrets securely (recommended over config for sensitive data)
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set SENDGRID_API_KEY

# Access in function code
const { defineSecret } = require('firebase-functions/params');
const stripeKey = defineSecret('STRIPE_SECRET_KEY');
```

### Testing Functions Locally

```bash
# Start function emulators
firebase emulators:start --only functions

# Start with specific functions
firebase emulators:start --only functions:createBooking,functions:cancelBooking

# Run local shell for interactive testing
firebase functions:shell

# Test function in shell
initializeUserProfile()
createBooking({ venueId: 'test', serviceId: 'test', scheduledAt: '2024-02-01T10:00:00Z' })
```

---

## Updating Firestore Rules

### Deploy Rules

```bash
# Deploy firestore rules only
firebase deploy --only firestore:rules

# Deploy to specific project
firebase deploy --only firestore:rules --project vfit-prod
```

### Firestore Rules Development Workflow

```bash
# 1. Edit firestore.rules file

# 2. Test rules locally with emulator
firebase emulators:start --only firestore

# 3. Run rules unit tests
npm run test:rules

# 4. Deploy when verified
firebase deploy --only firestore:rules
```

### Testing Rules

```javascript
// test/rules.spec.js
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

describe('Firestore security rules', () => {
  it('should allow users to read their own profile', async () => {
    // Test implementation
  });
  
  it('should prevent users from reading other profiles', async () => {
    // Test implementation
  });
});
```

---

## Seeding Data

### User Types (Provider Categories)

```bash
# Run seeding script for user types
node scripts/seed-user-types.js

# Or via Cloud Function
curl -X POST https://europe-west1-vfit-prod.cloudfunctions.net/seedUserTypes \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)"
```

### Sample Seeding Script

```typescript
// scripts/seed-user-types.ts
import { db } from '../src/lib/firebase/config';
import { collection, doc, setDoc } from 'firebase/firestore';

const userTypes = [
  {
    id: 'personal_trainer',
    name: 'Personal Trainer',
    category: 'fitness',
    slug: 'personal-trainer',
    description: 'Certified fitness professionals for personalized training',
    icon: '💪',
    requirements: ['Certificazione CONI', 'Primo Soccorso'],
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'yoga_instructor',
    name: 'Yoga Instructor',
    category: 'fitness',
    slug: 'yoga-instructor',
    description: 'Yoga teachers for all levels',
    icon: '🧘',
    requirements: ['Certificazione Yoga Alliance'],
    isActive: true,
    displayOrder: 2,
  },
  {
    id: 'nutritionist',
    name: 'Nutrizionista',
    category: 'wellness',
    slug: 'nutritionist',
    description: 'Nutritional counseling and meal planning',
    icon: '🥗',
    requirements: ['Laurea in Scienze della Nutrizione'],
    isActive: true,
    displayOrder: 3,
  },
  // ... more types
];

async function seedUserTypes() {
  for (const type of userTypes) {
    const { id, ...data } = type;
    await setDoc(doc(db, 'userTypes', id), {
      ...data,
      createdAt: new Date(),
    });
    console.log(`Created user type: ${type.name}`);
  }
}

seedUserTypes().catch(console.error);
```

### Sample Users

```bash
# Seed sample users for testing
node scripts/seed-sample-users.js --env=dev --count=10

# Create specific test accounts
node scripts/seed-sample-users.js --role=provider --verified=true
```

### Sample Data Script

```typescript
// scripts/seed-sample-data.ts
import { db } from '../src/lib/firebase/config';
import { auth } from '../src/lib/firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';

async function createSampleUsers() {
  // Create test customer
  const customerAuth = await createUserWithEmailAndPassword(
    auth, 
    'customer@test.com', 
    'password123'
  );
  
  await setDoc(doc(db, 'users', customerAuth.user.uid), {
    uid: customerAuth.user.uid,
    email: 'customer@test.com',
    fullName: 'Test Customer',
    role: 'customer',
    isVip: false,
    pointsBalance: 100,
    createdAt: new Date(),
  });

  // Create test provider
  const providerAuth = await createUserWithEmailAndPassword(
    auth,
    'provider@test.com',
    'password123'
  );
  
  await setDoc(doc(db, 'users', providerAuth.user.uid), {
    uid: providerAuth.user.uid,
    email: 'provider@test.com',
    fullName: 'Test Provider',
    role: 'provider',
    userType: 'personal_trainer',
    isVerified: true,
    createdAt: new Date(),
  });
  
  // Create provider profile
  await setDoc(doc(db, 'providers', providerAuth.user.uid), {
    userId: providerAuth.user.uid,
    fullName: 'Test Provider',
    bio: 'Professional personal trainer with 5+ years experience',
    userType: 'personal_trainer',
    specialties: ['strength', 'weight_loss'],
    experienceYears: 5,
    ratingAvg: 4.8,
    reviewCount: 12,
    isVerified: true,
    isActive: true,
    createdAt: new Date(),
  });
  
  console.log('Sample users created!');
}
```

---

## Configuring OAuth Domains

### Google OAuth Setup

1. **Google Cloud Console**:
   - Navigate to [Google Cloud Console](https://console.cloud.google.com/)
   - Select your Firebase project
   - Go to "APIs & Services" > "Credentials"

2. **Configure OAuth Consent Screen**:
   ```
   App name: VFit
   User support email: support@vfitfunlife.com
   Authorized domains:
     - vfitfunlife.com
     - vfit-dev.firebaseapp.com (dev)
     - vfit-prod.firebaseapp.com (prod)
   ```

3. **Add Authorized Redirect URIs**:
   ```
   # Development
   https://vfit-dev.firebaseapp.com/__/auth/handler
   http://localhost:3000
   
   # Production
   https://vfit-prod.firebaseapp.com/__/auth/handler
   https://app.vfitfunlife.com
   ```

4. **Configure in Firebase Console**:
   ```bash
   # Go to: Firebase Console > Authentication > Sign-in method > Google
   # Enable Google sign-in
   # Configure support email
   ```

### Apple OAuth Setup

1. **Apple Developer Portal**:
   - Navigate to [Apple Developer](https://developer.apple.com/)
   - Certificates, Identifiers & Profiles

2. **Create Service ID**:
   ```
   Identifier: com.vfit.app
   Enable "Sign in with Apple"
   ```

3. **Configure Domains**:
   ```
   Primary App ID: com.vfit.app
   Website URLs:
     - https://app.vfitfunlife.com
     - https://vfit-prod.firebaseapp.com
   ```

4. **Configure in Firebase**:
   ```bash
   # Go to: Firebase Console > Authentication > Sign-in method > Apple
   # Enable Apple sign-in
   # Upload private key downloaded from Apple
   ```

### Phone Auth (OTP) Setup

1. **Enable in Firebase Console**:
   ```
   Firebase Console > Authentication > Sign-in method > Phone
   Enable Phone authentication
   ```

2. **Add SHA-1 Certificate (Android)**:
   ```bash
   # Get SHA-1 from keystore
   keytool -list -v -keystore android.keystore -alias vfit
   
   # Add to Firebase Console
   # Project Settings > Your apps > Android > SHA certificate fingerprints
   ```

3. **Configure reCAPTCHA**:
   ```bash
   # Add to Firebase Console
   # Authentication > Settings > reCAPTCHA Enterprise
   # Or use invisible reCAPTCHA for web
   ```

### Custom Domain for Auth

```bash
# Add custom domain for auth flows in Firebase Console
# Authentication > Settings > Authorized domains

# Add:
- app.vfitfunlife.com
- staging.vfitfunlife.com
- localhost (for development)
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

**Functions deployment fails**
```bash
# Check for syntax errors
npm run lint

# Verify all dependencies installed
cd functions && npm install

# Check function logs
firebase functions:log --only <functionName>
```

**Firestore rules deployment fails**
```bash
# Validate rules syntax
firebase deploy --only firestore:rules --dry-run

# Check for circular references or syntax errors in firestore.rules
```

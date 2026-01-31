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


---

## Admin Features Deployment

### Deploying Admin Backoffice

The admin backoffice is part of the main Next.js application, accessible at `/admin/*` routes. It requires specific setup for proper functioning.

#### Pre-deployment Checks

1. **Verify Admin Routes Exist**
   ```bash
   ls -la src/app/admin/
   ```
   Should contain:
   - `page.tsx` - Dashboard
   - `users/page.tsx` - User management
   - `providers/page.tsx` - Provider management
   - `bookings/page.tsx` - Booking management
   - `finance/page.tsx` - Financial reports

2. **Verify Admin Cloud Functions**
   ```bash
   ls -la functions/src/admin/
   ```
   Should contain:
   - `getDashboardStats.ts`
   - `getUsers.ts`
   - `verifyProvider.ts`
   - `processRefund.ts`

3. **Deploy Admin Functions**
   ```bash
   firebase deploy --only functions:getDashboardStats
   firebase deploy --only functions:getUsers
   firebase deploy --only functions:verifyProvider
   firebase deploy --only functions:processRefund
   firebase deploy --only functions:updateUserRole
   firebase deploy --only functions:suspendUser
   firebase deploy --only functions:getAllBookings
   firebase deploy --only functions:updatePlatformSettings
   ```

#### Build and Deploy

```bash
# Build with production settings
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

---

## Setting Up Admin Accounts

### Creating the First Superadmin

The first superadmin account must be created manually or via a secure script.

#### Method 1: Using CLI Script (Recommended)

```bash
# Run the admin creation script
node scripts/create-admin.js \
  --email=superadmin@yourcompany.com \
  --password=SecurePassword123! \
  --name="Super Admin" \
  --role=superadmin \
  --project=production
```

Script content (`scripts/create-admin.js`):
```javascript
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const args = require('minimist')(process.argv.slice(2));

const projectId = args.project || 'vfit-prod';

initializeApp({
  projectId: projectId,
});

const auth = getAuth();
const db = getFirestore();

async function createAdmin() {
  const { email, password, name, role } = args;
  
  if (!email || !password || !role) {
    console.error('Usage: node create-admin.js --email=... --password=... --role=superadmin|admin');
    process.exit(1);
  }
  
  try {
    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name || email,
    });
    
    // Set custom claims for role
    await auth.setCustomUserClaims(userRecord.uid, { role });
    
    // Create user document in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      fullName: name || email,
      role: role,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    console.log(`✅ ${role} account created successfully:`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Email: ${email}`);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
}

createAdmin();
```

#### Method 2: Manual Creation

1. **Register User via App**
   - Go to the registration page
   - Create account with admin email

2. **Set Admin Role via Firebase Console**
   - Go to Firebase Console > Authentication
   - Find the user
   - Copy the UID

3. **Set Custom Claims**
   ```bash
   # Using Firebase Admin SDK locally
   node -e "
   const admin = require('firebase-admin');
   admin.initializeApp({
     credential: admin.credential.cert(require('./serviceAccountKey.json'))
   });
   admin.auth().setCustomUserClaims('USER_UID_HERE', { role: 'superadmin' });
   "
   ```

4. **Update Firestore Document**
   ```javascript
   // In Firestore console or via script
   db.collection('users').doc('USER_UID').update({
     role: 'superadmin',
     updatedAt: new Date()
   });
   ```

### Creating Additional Admins

Once a superadmin exists, additional admins can be created through the admin dashboard:

1. **Via Admin Dashboard**
   - Login as superadmin
   - Go to Admin > User Management
   - Click "Add Admin"
   - Enter email and details
   - Select role (admin or superadmin)
   - Send invitation email

2. **Via CLI (for bulk creation)**
   ```bash
   node scripts/bulk-create-admins.js --file=admins.csv
   ```

### Admin Account Security

1. **Enable 2FA**
   - Require all admins to enable two-factor authentication
   - Go to Firebase Console > Authentication > Settings
   - Enable "Require 2FA for admin accounts"

2. **Password Policy**
   - Minimum 12 characters
   - Require uppercase, lowercase, number, symbol
   - Password expiration (90 days)

3. **Access Logging**
   - All admin actions are logged to `/logs` collection
   - Review logs regularly
   - Set up alerts for suspicious activity

---

## Configuring Provider Verification Workflow

### Verification Settings

Configure the provider verification workflow in platform settings:

```typescript
// Firestore document: settings/platform
{
  verification: {
    enabled: true,
    autoApprove: false,  // Set true to skip manual review
    requiredDocuments: [
      'certification',
      'identity',
      'insurance'  // Optional
    ],
    reviewTimeHours: 48,  // SLA for review
    reminderFrequency: 'daily',  // Notify admins of pending
  }
}
```

### Admin Notification Setup

Configure notifications for verification requests:

```bash
# Set up email notifications
firebase functions:config:set \
  admin.verification_email="verifications@yourcompany.com" \
  admin.notification_slack_webhook="https://hooks.slack.com/..." \
  --project production
```

### Verification Queue Management

1. **Access Queue**
   - Admin Dashboard > Provider Verification
   - Shows pending, approved, rejected tabs

2. **Review Process**
   - Click on provider to view details
   - Review uploaded documents
   - Check certification validity
   - Verify photo quality
   - Make decision:
     - Approve: Adds verified badge
     - Reject: Requires reason
     - Request Info: Sends back to provider

3. **Bulk Actions**
   - Select multiple providers
   - Bulk approve/reject
   - Export queue report

### Automation Rules

Set up automatic verification for trusted providers:

```javascript
// functions/src/admin/autoVerify.js
exports.autoVerifyProvider = functions.firestore
  .document('providers/{providerId}')
  .onCreate(async (snap, context) => {
    const provider = snap.data();
    
    // Auto-approve if meets criteria
    if (provider.certifications.length >= 3 && 
        provider.bio.length > 200 &&
        provider.avatarUrl) {
      await snap.ref.update({
        verificationStatus: 'approved',
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        autoVerified: true
      });
    }
  });
```

---

## Managing User Types (Provider Categories)

### Initial Setup

Seed the database with default provider categories:

```bash
# Run the seeding script
node scripts/seed-user-types.js --env=production
```

Or manually via Firebase Console:

1. Go to Firestore Database
2. Create `userTypes` collection
3. Add documents:

```javascript
// Example: Personal Trainer
{
  id: 'personal_trainer',
  name: 'Personal Trainer',
  category: 'fitness',
  slug: 'personal-trainer',
  description: 'Certified fitness professionals for personalized training',
  icon: '💪',
  requirements: [
    'Certificazione CONI',
    'Primo Soccorso BLSD'
  ],
  defaultServices: [
    {
      name: 'Sessione di Personal Training',
      durationMinutes: 60,
      basePrice: 50
    },
    {
      name: 'Consultazione Fitness',
      durationMinutes: 30,
      basePrice: 25
    }
  ],
  isActive: true,
  displayOrder: 1,
  createdAt: Timestamp
}
```

### Adding New Categories

**Via Admin Dashboard:**
1. Login as admin
2. Go to Content > User Types
3. Click "Add Category"
4. Fill in:
   - Name (display name)
   - Category (fitness/wellness/beauty/etc.)
   - Description
   - Icon (emoji or URL)
   - Requirements (list)
   - Default services
5. Save

**Via API:**
```typescript
const createUserType = httpsCallable(functions, 'admin/createUserType');
await createUserType({
  name: 'Nutritionist',
  category: 'wellness',
  slug: 'nutritionist',
  description: 'Professional nutrition counseling',
  icon: '🥗',
  requirements: ['Laurea in Scienze della Nutrizione'],
  defaultServices: [
    { name: 'Consultazione Nutrizionale', durationMinutes: 60, basePrice: 60 }
  ]
});
```

### Managing Categories

**Enable/Disable:**
- Toggle `isActive` field
- Disabled categories don't appear in search filters
- Existing providers keep their category

**Reorder:**
- Update `displayOrder` field
- Lower numbers appear first

**Update Requirements:**
- Edit `requirements` array
- Doesn't affect existing providers
- Only new applications affected

### Category Analytics

View category performance:
```
Admin Dashboard > Content > User Types > Analytics

Metrics:
- Total providers per category
- Average rating per category
- Booking volume
- Revenue generated
- Growth trends
```

---

## Admin Dashboard Configuration

### Dashboard Widgets

Configure which widgets appear on the admin dashboard:

```typescript
// Firestore: settings/admin/dashboard
{
  widgets: {
    statsOverview: { enabled: true, position: 1 },
    bookingChart: { enabled: true, position: 2 },
    revenueChart: { enabled: true, position: 3 },
    recentActivity: { enabled: true, position: 4 },
    pendingVerifications: { enabled: true, position: 5 },
    topProviders: { enabled: true, position: 6 },
  }
}
```

### Report Scheduling

Set up automated reports:

```bash
# Deploy scheduled report function
firebase deploy --only functions:sendWeeklyReports
```

Configure recipients:
```typescript
// Firestore: settings/admin/reports
{
  weeklyReport: {
    enabled: true,
    schedule: '0 9 * * 1',  // Mondays at 9 AM
    recipients: ['admin@company.com', 'manager@company.com'],
    metrics: ['bookings', 'revenue', 'users', 'providers']
  },
  monthlyReport: {
    enabled: true,
    schedule: '0 9 1 * *',  // 1st of month at 9 AM
    recipients: ['admin@company.com'],
    metrics: ['all']
  }
}
```

### Access Control

Configure which admin roles can access what:

```typescript
// Firestore: settings/admin/access
{
  permissions: {
    admin: {
      canViewDashboard: true,
      canManageUsers: true,
      canVerifyProviders: true,
      canManageBookings: true,
      canViewFinance: true,
      canProcessRefunds: true,
      canManageContent: true,
      canViewSystemLogs: false,
      canManageAdmins: false,
      canChangeSettings: false,
    },
    superadmin: {
      // All permissions true
    }
  }
}
```

---

## Testing Admin Features

### Pre-deployment Testing

```bash
# Run admin-specific tests
npm run test:admin

# Test admin API endpoints
npm run test:admin-api

# E2E tests for admin flows
npm run test:e2e:admin
```

### Post-deployment Verification

**Dashboard Access:**
- [ ] Superadmin can access /admin
- [ ] Admin can access /admin
- [ ] Customer cannot access /admin (redirected)
- [ ] Provider cannot access /admin (redirected)

**User Management:**
- [ ] View all users
- [ ] Search and filter users
- [ ] Edit user profile
- [ ] Change user role
- [ ] Suspend/activate user

**Provider Verification:**
- [ ] View verification queue
- [ ] Review provider documents
- [ ] Approve provider
- [ ] Reject provider with reason
- [ ] Notification sent to provider

**Booking Management:**
- [ ] View all bookings
- [ ] Filter by status, date, user
- [ ] Cancel booking
- [ ] Process refund
- [ ] Export booking data

**Content Management:**
- [ ] Create user type
- [ ] Edit user type
- [ ] Disable/enable category
- [ ] Manage venues
- [ ] Update platform settings

**Finance:**
- [ ] View transaction history
- [ ] Process provider payouts
- [ ] Generate commission reports
- [ ] View revenue analytics

---

## Troubleshooting Admin Features

### Admin Can't Access Dashboard

**Check custom claims:**
```bash
# Get user by email
firebase auth:get-user-by-email admin@example.com

# Verify claims are set correctly
```

**Check Firestore role:**
```javascript
// In Firestore console
db.collection('users').doc('ADMIN_UID').get()
// Should have role: 'admin' or 'superadmin'
```

### Verification Notifications Not Sending

**Check Functions logs:**
```bash
firebase functions:log --only notifyNewVerification
```

**Verify SendGrid configuration:**
```bash
firebase functions:config:get
# Should contain sendgrid.api_key
```

### Dashboard Stats Not Loading

**Check function deployment:**
```bash
firebase functions:log --only getDashboardStats
```

**Verify Firestore indexes:**
```bash
firebase deploy --only firestore:indexes
```

**Check data exists:**
- Bookings collection not empty
- Users collection not empty
- Proper date format in documents


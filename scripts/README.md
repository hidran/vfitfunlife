# VFit Scripts

This folder contains utility scripts for the VFit Firebase project.

## Setup

### 1. Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings > Service Accounts
4. Click "Generate new private key"
5. Save the JSON file as `serviceAccountKey.json` in this folder

### 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` to point to your service account key:
```
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
```

## Scripts

### Seed Users

Creates 10 sample users in Firebase Auth + Firestore:

```bash
# Using npm script (recommended)
npm run seed:users

# Or directly with ts-node
npx ts-node --transpile-only scripts/seed-users.ts
```

**Users created:**

| Email | Role | Name |
|-------|------|------|
| admin@vfit.com | superadmin | System Administrator |
| manager@vfit.com | admin | Platform Manager |
| marco.rossi@vfit.com | provider (personal_trainer) | Marco Rossi |
| elena.bianchi@vfit.com | provider (yoga_teacher) | Elena Bianchi |
| giulia.neri@vfit.com | provider (hairstylist) | Giulia Neri |
| dr.alessandro.verdi@vfit.com | provider (psychologist) | Dr. Alessandro Verdi |
| sarah.johnson@vfit.com | provider (pronunciation_coach) | Sarah Johnson |
| dr.laura.martini@vfit.com | provider (nutritionist) | Dr. Laura Martini |
| user1@test.com | customer | Luca Ferrari |
| user2@test.com | customer | Maria Colombo |

**Default password for all users:** `Test123456!`

The script is idempotent - it will skip users that already exist.

## Troubleshooting

### "Error: Cannot find module 'firebase-admin'"

Make sure you're running from the project root:
```bash
cd /path/to/vfit
npx ts-node scripts/seed-users.ts
```

### "Could not load the default credentials"

Make sure you've set up the `GOOGLE_APPLICATION_CREDENTIALS` environment variable
pointing to a valid service account key file.

### Using with Firebase Emulator

If you want to seed the local emulator instead of production:

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
npx ts-node scripts/seed-users.ts
```

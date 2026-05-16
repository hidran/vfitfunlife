# Firebase Authentication Setup Guide

## Enable Email/Password Authentication

The error `auth/operation-not-allowed` means Email/Password sign-in is disabled in your Firebase project. Here's how to enable it:

### Step 1: Open Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (**vfit**)

### Step 2: Enable Email/Password Provider

1. In the left sidebar, click **Authentication**
2. Click the **Sign-in method** tab
3. Find **Email/Password** in the list of providers
4. Click on it to expand
5. Toggle the **Enable** switch to **ON**
6. Click **Save**

### Step 3: Enable Other Providers (If Needed)

While you're there, also enable:

| Provider | Status | Notes |
|----------|--------|-------|
| Email/Password | ✅ Enable | Required for email auth |
| Google | ✅ Enable | For Google sign-in |
| Apple | ✅ Enable | For Apple sign-in (iOS) |
| Phone | ✅ Enable | For SMS OTP |

### Step 4: Configure Authorized Domains

1. In Authentication settings, click the **Settings** tab
2. Scroll to **Authorized domains**
3. Add your domains:
   - `localhost` (for development)
   - Your production domain (e.g., `vfit.app`)

---

## Alternative: Use Firebase Emulator for Local Development

For local development without Firebase Console changes:

### Start Emulators

```bash
firebase emulators:start
```

This starts:
- Auth emulator on port 9099
- Firestore emulator on port 8080
- Emulator UI on port 4000

### Enable Emulator in App

Set in your `.env.local`:

```env
NEXT_PUBLIC_USE_EMULATORS=true
```

The code already has emulator support built in (see `src/lib/firebase/config.ts`).

### Access Emulator UI

Open http://localhost:4000 to:
- View auth users
- Create test users
- Inspect data

---

## Verify Setup

After enabling Email/Password in Firebase Console:

1. Refresh your app
2. Try registering with email/password
3. Check the Firebase Console **Users** tab to see created users

---

## Common Issues

### Error: `auth/operation-not-allowed`
**Solution**: Follow Step 2 above - Enable Email/Password in Firebase Console

### Error: `auth/network-request-failed`
**Solution**: Check internet connection or use emulators for offline development

### Error: `auth/invalid-api-key`
**Solution**: Check your `.env.local` file has correct Firebase config values

### Error: `auth/unauthorized-domain`
**Solution**: Add your domain to Authorized Domains in Firebase Console

---

## Environment Variables

Ensure your `.env.local` has these values:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Optional: Enable Firebase emulators for local development
NEXT_PUBLIC_USE_EMULATORS=true
```

# Firebase Functions Migration Guide

## Current State
- Node.js 18 (deprecated)
- 1st Generation Functions
- Limited CPU/memory control

## Target State
- Node.js 20 (recommended)
- 2nd Generation Functions
- Better performance and control

---

## Step 1: Update package.json

```json
{
  "engines": {
    "node": "20"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  }
}
```

---

## Step 2: Update Function Imports

Change from v1 to v2 in all function files:

```typescript
// Before
import * as functions from "firebase-functions/v1";

// After
import * as functions from "firebase-functions/v2";
```

---

## Step 3: Update Function Syntax

### HTTP Callable Functions

```typescript
// Before (1st Gen)
export const myFunction = functions.region(region).https.onCall(async (data, context) => {
  const userId = requireAuth(context);
  // ... function logic
  return { success: true };
});

// After (2nd Gen)
export const myFunction = functions.https.onCall(
  { region: "europe-west1" },
  async (request) => {
    const userId = requireAuth(request.auth);
    // ... function logic
    return { success: true };
  }
);
```

### Auth Triggers

```typescript
// Before
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  // ...
});

// After
export const onUserCreated = functions.auth.onUserCreated(
  { region: "europe-west1" },
  async (event) => {
    const user = event.data;
    // ...
  }
);
```

### Firestore Triggers

```typescript
// Before
export const onBookingCreated = functions.firestore
  .document("bookings/{bookingId}")
  .onCreate(async (snap, context) => {
    const bookingId = context.params.bookingId;
    // ...
  });

// After
export const onBookingCreated = functions.firestore.onDocumentCreated(
  { region: "europe-west1", document: "bookings/{bookingId}" },
  async (event) => {
    const bookingId = event.params.bookingId;
    // ...
  }
);
```

### Scheduled Functions

```typescript
// Before
export const dailyCleanup = functions.pubsub
  .schedule("0 0 * * *")
  .onRun(async (context) => {
    // ...
  });

// After
export const dailyCleanup = functions.scheduler.onSchedule(
  { region: "europe-west1", schedule: "0 0 * * *" },
  async (event) => {
    // ...
  }
);
```

---

## Step 4: Update Helper Functions

### Authentication

```typescript
// Before
function requireAuth(context: functions.https.CallableContext): string {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }
  return context.auth.uid;
}

// After
function requireAuth(auth: functions.https.AuthData | undefined): string {
  if (!auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }
  return auth.uid;
}
```

---

## Step 5: Reinstall Dependencies

```bash
cd functions
rm -rf node_modules package-lock.json
npm install
```

---

## Step 6: Verify Build

```bash
npm run lint
npm run build
```

---

## Step 7: Test Locally

```bash
firebase emulators:start
```

---

## Step 8: Deploy

```bash
firebase deploy --only functions
```

---

## Benefits After Migration

| Feature | Before (1st Gen) | After (2nd Gen) |
|---------|-----------------|-----------------|
| Node.js Version | 18 | 20 |
| Cold Starts | Higher | Lower |
| Concurrency | 1 per instance | Up to 1000 |
| CPU Control | Limited | Granular |
| Memory | Fixed options | Flexible |
| Timeout | 540s (9min) | 3600s (60min) |

---

## Troubleshooting Migration Issues

### Issue: Auth context is undefined
**Fix**: Use `request.auth` instead of `context.auth`

### Issue: Event params not available
**Fix**: Use `event.params` instead of `context.params`

### Issue: Firestore data accessor changed
**Fix**: Use `event.data` instead of direct `snap`

### Issue: Scheduled function syntax changed
**Fix**: Use `functions.scheduler.onSchedule` instead of `functions.pubsub.schedule`

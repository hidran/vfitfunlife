import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
// Storage and Functions are NOT statically imported here — see getStorageInstance()/
// getFunctionsInstance() below. This file sits on the root render path (imported by
// authStore for every route), so a static `import ... from "firebase/storage"` or
// "firebase/functions" would pull both SDKs into the shared root bundle even for
// visitors who never upload a file or call a Cloud Function. Type-only imports are
// erased at compile time and cost nothing.
import type { FirebaseStorage } from "firebase/storage";
import type { Functions } from "firebase/functions";
import type { Analytics } from "firebase/analytics";
import type { Messaging } from "firebase/messaging";
import { schedulePerformanceMonitoring } from "@/lib/perf";

const useEmulators =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let analytics: Analytics | null = null;
let messaging: Messaging | null = null;

function initializeFirebase() {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  auth = getAuth(app);
  // Firestore with persistent (IndexedDB) cache — replaces the deprecated
  // enableIndexedDbPersistence; multi-tab safe and more reliable in mobile
  // webviews. Falls back to plain getFirestore on the server (static export)
  // or if Firestore was already initialized (e.g. HMR re-run).
  if (typeof window !== "undefined") {
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      db = getFirestore(app);
    }
  } else {
    db = getFirestore(app);
  }

  // Connect to the local Firebase emulator suite in development.
  // Ports mirror firebase.json. Each connect is guarded so Fast Refresh
  // re-runs (which re-import this module) don't throw "already connected".
  if (useEmulators) {
    const host = "localhost";
    try { connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true }); } catch { /* already connected */ }
    try { connectFirestoreEmulator(db, host, 8080); } catch { /* already connected */ }
  }

  return { app, auth, db };
}

// Storage — lazy. The `firebase/storage` module (and its emulator connector) is only
// dynamically imported the first time a caller actually needs Storage (avatar/portfolio/
// certification uploads), instead of on every route via the eager root init above.
let storageInstance: FirebaseStorage | undefined;
let storagePromise: Promise<FirebaseStorage> | undefined;

export function getStorageInstance(): Promise<FirebaseStorage> {
  if (storageInstance) return Promise.resolve(storageInstance);
  if (!storagePromise) {
    storagePromise = import("firebase/storage").then(({ getStorage, connectStorageEmulator }) => {
      const instance = getStorage(app);
      if (useEmulators) {
        try { connectStorageEmulator(instance, "localhost", 9199); } catch { /* already connected */ }
      }
      storageInstance = instance;
      return instance;
    });
  }
  return storagePromise;
}

// Functions — lazy for the same reason. Only the routes/flows that actually invoke a
// Cloud Function (admin actions, profile mutations, the assistant, provider applications,
// the trainer lead form, email-verification sync) pull in `firebase/functions`.
let functionsInstance: Functions | undefined;
let functionsPromise: Promise<Functions> | undefined;

export function getFunctionsInstance(): Promise<Functions> {
  if (functionsInstance) return Promise.resolve(functionsInstance);
  if (!functionsPromise) {
    functionsPromise = import("firebase/functions").then(({ getFunctions, connectFunctionsEmulator }) => {
      const region = process.env.NEXT_PUBLIC_FIREBASE_REGION || "europe-west1";
      const instance = getFunctions(app, region);
      if (useEmulators) {
        try { connectFunctionsEmulator(instance, "localhost", 5001); } catch { /* already connected */ }
      }
      functionsInstance = instance;
      return instance;
    });
  }
  return functionsPromise;
}

// Initialize analytics (only in browser)
async function initializeAnalytics(): Promise<Analytics | null> {
  if (typeof window !== "undefined") {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    const supported = await isSupported();
    if (supported) {
      analytics = getAnalytics(app);
      return analytics;
    }
  }
  return null;
}

// Initialize FCM (only in browser)
async function initializeMessaging(): Promise<Messaging | null> {
  if (typeof window !== "undefined") {
    const { getMessaging, isSupported: isMessagingSupported } = await import("firebase/messaging");
    const supported = await isMessagingSupported();
    if (supported) {
      messaging = getMessaging(app);
      return messaging;
    }
  }
  return null;
}

// Initialize on module load
const firebase = initializeFirebase();

// Performance Monitoring: loaded after first paint via dynamic import, deployed web builds
// only (see lib/perf). No-op on the server, in dev/emulators and in the native shells.
schedulePerformanceMonitoring(app);

export {
  firebase,
  app,
  auth,
  db,
  analytics,
  messaging,
  initializeAnalytics,
  initializeMessaging,
};

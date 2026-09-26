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
import { getStorage, type FirebaseStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, type Functions, connectFunctionsEmulator } from "firebase/functions";
import type { Analytics } from "firebase/analytics";
import type { Messaging } from "firebase/messaging";

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
let storage: FirebaseStorage;
let functions: Functions;
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
  storage = getStorage(app);
  
  const region = process.env.NEXT_PUBLIC_FIREBASE_REGION || "europe-west1";
  functions = getFunctions(app, region);

  // Connect to the local Firebase emulator suite in development.
  // Ports mirror firebase.json. Each connect is guarded so Fast Refresh
  // re-runs (which re-import this module) don't throw "already connected".
  if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
    const host = "localhost";
    try { connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true }); } catch { /* already connected */ }
    try { connectFirestoreEmulator(db, host, 8080); } catch { /* already connected */ }
    try { connectStorageEmulator(storage, host, 9199); } catch { /* already connected */ }
    try { connectFunctionsEmulator(functions, host, 5001); } catch { /* already connected */ }
  }

  return { app, auth, db, storage, functions };
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

export {
  firebase,
  app,
  auth,
  db,
  storage,
  functions,
  analytics,
  messaging,
  initializeAnalytics,
  initializeMessaging,
};

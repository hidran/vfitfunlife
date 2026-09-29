import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth, connectAuthEmulator } from "firebase/auth";
// Firebase core for the root render path: the app, Auth, and lazy accessors for the other
// SDKs. This module is imported by authStore (and so by every route), so it must NOT
// statically import any SDK a visitor may never need:
// - Firestore: use `getDb()` / `loadFirestore()` from ./lazyFirestore on the root path.
//   Page-level modules keep importing `db` from ./config (route chunks, loaded on demand).
// - Storage / Functions / Analytics / Messaging: dynamically imported below.
// Type-only imports are erased at compile time and cost nothing.
import type { FirebaseStorage } from "firebase/storage";
import type { Functions } from "firebase/functions";
import type { Analytics } from "firebase/analytics";
import type { Messaging } from "firebase/messaging";
import { schedulePerformanceMonitoring } from "@/lib/perf";

export const useEmulators =
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

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth: Auth = getAuth(app);
let analytics: Analytics | null = null;
let messaging: Messaging | null = null;

// Connect to the local Auth emulator in development. Ports mirror firebase.json. Guarded so
// Fast Refresh re-runs (which re-import this module) don't throw "already connected".
if (useEmulators) {
  try { connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true }); } catch { /* already connected */ }
}

// Storage — lazy. The `firebase/storage` module (and its emulator connector) is only
// dynamically imported the first time a caller actually needs Storage (avatar/portfolio/
// certification uploads), instead of on every route.
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

// Performance Monitoring: loaded after first paint via dynamic import, deployed web builds
// only (see lib/perf). No-op on the server, in dev/emulators and in the native shells.
schedulePerformanceMonitoring(app);

export { app, auth, analytics, messaging, initializeAnalytics, initializeMessaging };

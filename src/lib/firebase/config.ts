// Firebase entry point for page-level code: re-exports the core (./app) and adds an
// eagerly initialized Firestore `db`.
//
// Because of that `db`, importing this module pulls the Firestore SDK (~350 KB raw) into the
// importing chunk. That is fine for route/page modules, which load on demand, but NOT for
// anything on the root render path (root layout, providers, ThemeContext, authStore,
// lib/firebase/auth, push registration): those import from ./app and reach Firestore through
// getDb()/loadFirestore() in ./lazyFirestore, which dynamic-imports this module.
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { app, auth, useEmulators } from "./app";

function initializeDb(): Firestore {
  let instance: Firestore;
  // Firestore with persistent (IndexedDB) cache — replaces the deprecated
  // enableIndexedDbPersistence; multi-tab safe and more reliable in mobile
  // webviews. Falls back to plain getFirestore on the server (static export)
  // or if Firestore was already initialized (e.g. HMR re-run).
  if (typeof window !== "undefined") {
    try {
      instance = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      instance = getFirestore(app);
    }
  } else {
    instance = getFirestore(app);
  }

  // Ports mirror firebase.json. Guarded so Fast Refresh re-runs don't throw.
  if (useEmulators) {
    try { connectFirestoreEmulator(instance, "localhost", 8080); } catch { /* already connected */ }
  }
  return instance;
}

const db: Firestore = initializeDb();
const firebase = { app, auth, db };

export {
  app,
  auth,
  analytics,
  messaging,
  initializeAnalytics,
  initializeMessaging,
  getStorageInstance,
  getFunctionsInstance,
} from "./app";
export { firebase, db };

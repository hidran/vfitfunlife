import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getFunctions, Functions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics, Analytics, isSupported } from "firebase/analytics";
import { getMessaging, Messaging, isSupported as isMessagingSupported } from "firebase/messaging";

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
  db = getFirestore(app);
  storage = getStorage(app);
  
  const region = process.env.NEXT_PUBLIC_FIREBASE_REGION || "europe-west1";
  functions = getFunctions(app, region);

  // Connect to emulators in development
  if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
    connectFunctionsEmulator(functions, "localhost", 5001);
  }

  return { app, auth, db, storage, functions };
}

// Initialize analytics (only in browser)
async function initializeAnalytics(): Promise<Analytics | null> {
  if (typeof window !== "undefined") {
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

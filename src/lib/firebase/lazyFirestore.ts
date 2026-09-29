import type { Firestore } from "firebase/firestore";

/**
 * Lazily resolved Firestore for code on the root render path (ThemeContext, the profile
 * preferences sync, the language switcher, lib/firebase/auth via authStore, …).
 *
 * Importing `db` from ./config — or anything from "firebase/firestore" as a value — puts the
 * Firestore SDK (~350 KB raw / ~105 KB gzip) in the importing chunk. For root-path modules
 * that chunk is loaded by every route, including static pages such as /terms. These helpers
 * dynamic-import ./firestoreKit instead, so the SDK is fetched the first time something
 * actually talks to Firestore (usually right after sign-in, to load the profile).
 *
 * The instance is the same `db` page-level modules import from ./config: ./config is the one
 * place Firestore is initialized, and a module is only evaluated once.
 */
export type LazyFirestore = typeof import("./firestoreKit");

let pending: Promise<LazyFirestore> | undefined;

/** The Firestore functions in ./firestoreKit plus the app's `db`, loaded on first use. */
export function loadFirestore(): Promise<LazyFirestore> {
  if (!pending) {
    pending = import("./firestoreKit");
    // A failed chunk load (e.g. offline) must not poison every later call.
    pending.catch(() => {
      pending = undefined;
    });
  }
  return pending;
}

/** The app's Firestore instance, loaded on first use. */
export async function getDb(): Promise<Firestore> {
  return (await loadFirestore()).db;
}

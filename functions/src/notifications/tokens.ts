import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { region } from "../lib/runtimeOptions";

interface StoredFcmToken {
  token?: string;
  [key: string]: unknown;
}

interface UnregisterTokenData {
  token?: string;
}

/**
 * Returns the stored token list without `token`. Pure, for testing.
 * @param {unknown} stored - the user's current `fcmTokens` value
 * @param {string} token - the token to drop
 * @return {{tokens: StoredFcmToken[], removed: boolean}} filtered list and whether anything was dropped
 */
export function withoutToken(
  stored: unknown,
  token: string
): { tokens: StoredFcmToken[]; removed: boolean } {
  const list = Array.isArray(stored) ? (stored as StoredFcmToken[]) : [];
  const tokens = list.filter((t) => t?.token !== token);
  return { tokens, removed: tokens.length !== list.length };
}

/**
 * Removes one FCM token from the caller's `fcmTokens` — called by the client on logout
 * (before signing out) so a shared browser/device stops receiving the previous user's pushes.
 * Idempotent: unknown tokens and missing user docs are a no-op.
 */
export const unregisterFcmToken = onCall<UnregisterTokenData>(
  { region },
  async (request: CallableRequest<UnregisterTokenData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }
    const token = request.data?.token;
    if (typeof token !== "string" || !token) {
      throw new HttpsError("invalid-argument", "Token required");
    }

    const userRef = admin.firestore().collection("users").doc(request.auth.uid);
    const removed = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return false;
      const result = withoutToken(snap.data()?.fcmTokens, token);
      if (result.removed) {
        tx.update(userRef, { fcmTokens: result.tokens });
      }
      return result.removed;
    });

    return { success: true, removed };
  }
);

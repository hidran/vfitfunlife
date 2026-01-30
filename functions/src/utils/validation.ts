import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

/**
 * Validates that the request has an authenticated user.
 * @param {functions.https.CallableContext} context - The callable context.
 * @returns {string} The authenticated user's UID.
 * @throws {functions.https.HttpsError} If not authenticated.
 */
export function requireAuth(context: functions.https.CallableContext): string {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required"
    );
  }
  return context.auth.uid;
}

/**
 * Validates that a document exists.
 * @param {admin.firestore.DocumentSnapshot} doc - The document snapshot.
 * @param {string} errorMsg - The error message if not found.
 * @throws {functions.https.HttpsError} If document does not exist.
 */
export function requireDoc(
  doc: admin.firestore.DocumentSnapshot,
  errorMsg = "Document not found"
): void {
  if (!doc.exists) {
    throw new functions.https.HttpsError("not-found", errorMsg);
  }
}

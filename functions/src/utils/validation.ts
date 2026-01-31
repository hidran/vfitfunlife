import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Validates that the request has an authenticated user.
 * @param {CallableRequest} request - The callable request.
 * @returns {string} The authenticated user's UID.
 * @throws {HttpsError} If not authenticated.
 */
export function requireAuth(request: CallableRequest): string {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication required"
    );
  }
  return request.auth.uid;
}

/**
 * Validates that a document exists.
 * @param {admin.firestore.DocumentSnapshot} doc - The document snapshot.
 * @param {string} errorMsg - The error message if not found.
 * @throws {HttpsError} If document does not exist.
 */
export function requireDoc(
  doc: admin.firestore.DocumentSnapshot,
  errorMsg = "Document not found"
): void {
  if (!doc.exists) {
    throw new HttpsError("not-found", errorMsg);
  }
}

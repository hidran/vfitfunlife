import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

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

import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";

/**
 * Uniqueness claims on a partita IVA: `businessVat/{digits}` = { uid, createdAt }.
 *
 * Admin SDK only (the rules deny every client read and write). The claim is what makes a
 * P.IVA unique across companies; the number itself also lives on `instructors/{uid}.business`,
 * and the two are released separately — an admin freeing a claim (releaseBusinessVat) leaves
 * the profile's number in place so the back office can still see what the company declared.
 *
 * Both helpers are transaction steps: each reads before it writes, so a caller must invoke
 * them before any write of its own in the same transaction (Firestore orders reads first).
 */
export const BUSINESS_VAT_COLLECTION = "businessVat";

export interface ClaimVatInput {
  uid: string;
  /** Normalised digits — the document id. */
  vatNumber: string;
  /** The number this uid held before, released when it differs from `vatNumber`. */
  previousVat?: string | null;
}

/**
 * Deletes `businessVat/{vat}` when `uid` holds it. Returns true when a claim was removed,
 * false when the number is free or held by someone else (which is never touched).
 */
export async function releaseClaim(
  tx: Transaction,
  db: Firestore,
  vat: string,
  uid: string,
): Promise<boolean> {
  const ref = db.collection(BUSINESS_VAT_COLLECTION).doc(vat);
  const snap = await tx.get(ref);
  if (snap.data()?.uid !== uid) return false;
  tx.delete(ref);
  return true;
}

/**
 * Claims `vatNumber` for `uid`, failing with `already-exists` / `business_vat_taken` when
 * another uid holds it. The holder re-claiming is a no-op that keeps the original claim
 * time; a caller switching numbers has `previousVat` released so it is not orphaned.
 * Rejection never releases a claim — see commitProviderDecision.
 */
export async function claimVat(
  tx: Transaction,
  db: Firestore,
  { uid, vatNumber, previousVat }: ClaimVatInput,
): Promise<void> {
  const claimRef = db.collection(BUSINESS_VAT_COLLECTION).doc(vatNumber);
  const claimSnap = await tx.get(claimRef);
  if (claimSnap.exists && claimSnap.data()?.uid !== uid) {
    throw new HttpsError("already-exists", "business_vat_taken");
  }
  if (previousVat && previousVat !== vatNumber) {
    await releaseClaim(tx, db, previousVat, uid);
  }
  if (!claimSnap.exists) {
    tx.create(claimRef, { uid, createdAt: FieldValue.serverTimestamp() });
  }
}

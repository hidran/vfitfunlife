/**
 * Flips a trainer-created account (users/{uid}.accountStatus "invited", see
 * ./customerProfile.ts) to "active" once its owner has signed in, and clears the matching
 * denormalized flag on the trainers' roster docs (clients.accountStatus, which drives the
 * "In attesa di conferma" badge — the trainer cannot read users/{uid}).
 *
 * Called from syncEmailVerification (functions/src/auth/emailVerification.ts), which the app
 * calls after a sign-in whose profile is "invited" (authStore.loadUserData), and from
 * resendClientAccountEmail when it finds the account already claimed.
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { ACCOUNT_STATUS_ACTIVE, ACCOUNT_STATUS_INVITED } from "./customerProfile";

/** Returns true when it flipped something. Idempotent. */
export async function activateInvitedAccount(uid: string): Promise<boolean> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const flipped = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.get("accountStatus") !== ACCOUNT_STATUS_INVITED) return false;
    tx.update(userRef, {
      accountStatus: ACCOUNT_STATUS_ACTIVE,
      accountActivatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  // Roster docs are cleared even when the user doc was already active (a previous run may have
  // died between the two writes).
  const roster = await db.collection("clients").where("userId", "==", uid).get();
  const stale = roster.docs.filter((d) => d.get("accountStatus") === ACCOUNT_STATUS_INVITED);
  if (stale.length > 0) {
    const batch = db.batch();
    for (const d of stale) {
      batch.update(d.ref, { accountStatus: ACCOUNT_STATUS_ACTIVE, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
  if (flipped || stale.length > 0) {
    logger.info("[invitedAccount] activated", { uid, rosterDocs: stale.length });
  }
  return flipped || stale.length > 0;
}

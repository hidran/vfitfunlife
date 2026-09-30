import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

import { region } from "../lib/runtimeOptions";
import { ACCOUNT_STATUS_ACTIVE, ACCOUNT_STATUS_INVITED, isInvitedAccountClaimed } from "../users/customerProfile";
import { activateInvitedAccount } from "../users/invitedAccount";

/** Sign-in providers that only hand out email addresses they have verified. */
const EMAIL_VERIFYING_PROVIDERS = new Set(["google.com", "apple.com"]);

interface AuthRecordLike {
  email?: string;
  providerData: { providerId: string; email?: string }[];
}

/**
 * Whether a Google/Apple sign-in vouches for the account's email. The provider
 * must report the same address: a password account linked to a different
 * Google address has not had its own address verified.
 */
export function isSocialVerifiedEmail(record: AuthRecordLike): boolean {
  const email = record.email?.toLowerCase();
  if (!email) return false;
  return record.providerData.some(
    (p) => EMAIL_VERIFYING_PROVIDERS.has(p.providerId) && p.email?.toLowerCase() === email,
  );
}

/**
 * The account's verified state, marking Google/Apple sign-ins verified in
 * Firebase Auth when Auth itself hasn't (so they are never asked to confirm).
 */
export async function resolveEmailVerified(record: admin.auth.UserRecord): Promise<boolean> {
  if (record.emailVerified) return true;
  if (!isSocialVerifiedEmail(record)) return false;
  await admin.auth().updateUser(record.uid, { emailVerified: true });
  return true;
}

/**
 * Copy the caller's Auth email-verification state onto users/{uid}.emailVerified,
 * auto-verifying Google/Apple sign-ins. Clients can't write that field (see
 * firestore.rules), so this is the only way it changes.
 *
 * Called after sign-in when the doc and Auth disagree, and after the user
 * opens the verification link.
 *
 * Also the "first sign-in" hook for accounts a trainer created (createClientAccount):
 * the app calls it whenever the loaded profile has accountStatus "invited", and once the
 * Auth record shows the owner has signed in (a password set via the emailed link, Google on
 * that address, or a verified email) the account flips to "active" — see
 * users/invitedAccount.ts. Returns the resulting accountStatus when the doc has one.
 */
export const syncEmailVerification = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const uid = request.auth.uid;
    const record = await admin.auth().getUser(uid);
    const emailVerified = await resolveEmailVerified(record);

    const userRef = admin.firestore().collection("users").doc(uid);
    const snap = await userRef.get();
    if (snap.exists && snap.data()?.emailVerified !== emailVerified) {
      await userRef.update({
        emailVerified,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    let accountStatus = snap.data()?.accountStatus as string | undefined;
    const claimed = isInvitedAccountClaimed({ emailVerified, providerData: record.providerData });
    if (accountStatus === ACCOUNT_STATUS_INVITED && claimed) {
      await activateInvitedAccount(uid);
      accountStatus = ACCOUNT_STATUS_ACTIVE;
    }

    return accountStatus ? { emailVerified, accountStatus } : { emailVerified };
  },
);

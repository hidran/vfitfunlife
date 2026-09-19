import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

/**
 * What deleting a user removes. Kept on purpose: bookings, payments, transactions and
 * audit_logs (financial and legal records), and reviews or client notes the user left on
 * someone else's document.
 */
export function ownedStoragePrefixes(uid: string): string[] {
  return [
    `users/${uid}/`,
    `avatars/${uid}/`,
    `profile-photos/${uid}/`,
    `certifications/${uid}/`,
    `portfolios/${uid}/`,
    `instructors/${uid}/`,
  ];
}

export interface CascadeDeps {
  recursiveDelete: (docPath: string) => Promise<void>;
  /** Removes any providerApplications docs with userId == uid — personal data, not a legal record. */
  deleteProviderApplications: (uid: string) => Promise<void>;
  deleteStoragePrefix: (prefix: string) => Promise<void>;
  deleteAuthUser: (uid: string) => Promise<void>;
}

/**
 * Auth goes first: if a later step fails, the person can no longer sign in and a retry
 * finishes the job. The other order would leave a live login with no profile, which the app
 * routes to /auth/register — the account would quietly come back.
 *
 * Every step here is safe to run again: recursiveDelete and the storage/provider-application
 * deletes are no-ops on data that is already gone, so a retried or resumed call finishes
 * whatever an earlier, interrupted attempt started.
 */
export async function deleteUserCascade(uid: string, deps: CascadeDeps): Promise<void> {
  if (!uid || uid.includes("/")) throw new Error(`Invalid uid: "${uid}"`);

  try {
    await deps.deleteAuthUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }

  await deps.recursiveDelete(`users/${uid}`);
  await deps.recursiveDelete(`instructors/${uid}`);
  await deps.deleteProviderApplications(uid);

  for (const prefix of ownedStoragePrefixes(uid)) {
    await deps.deleteStoragePrefix(prefix);
  }
}

/** The real dependencies, backed by the Admin SDK. */
export function adminCascadeDeps(): CascadeDeps {
  const db = getFirestore();
  return {
    recursiveDelete: (path) => db.recursiveDelete(db.doc(path)),
    deleteProviderApplications: async (uid) => {
      const snap = await db.collection("providerApplications").where("userId", "==", uid).get();
      if (snap.empty) return;
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    },
    deleteStoragePrefix: async (prefix) => {
      await getStorage().bucket().deleteFiles({ prefix });
    },
    deleteAuthUser: (uid) => getAuth().deleteUser(uid),
  };
}

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
  docExists: (docPath: string) => Promise<boolean>;
  deleteStoragePrefix: (prefix: string) => Promise<void>;
  deleteAuthUser: (uid: string) => Promise<void>;
}

export interface CascadeResult {
  /** false when there was no Auth account — seeded demo users never had one. */
  authDeleted: boolean;
  hadInstructor: boolean;
}

/**
 * Auth goes first: if a later step fails, the person can no longer sign in and a retry
 * finishes the job. The other order would leave a live login with no profile, which the app
 * routes to /auth/register — the account would quietly come back.
 */
export async function deleteUserCascade(uid: string, deps: CascadeDeps): Promise<CascadeResult> {
  if (!uid || uid.includes("/")) throw new Error(`Invalid uid: "${uid}"`);

  let authDeleted = true;
  try {
    await deps.deleteAuthUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    authDeleted = false;
  }

  await deps.recursiveDelete(`users/${uid}`);
  const hadInstructor = await deps.docExists(`instructors/${uid}`);
  // Unconditional: recursiveDelete also clears subcollections left under a missing parent.
  await deps.recursiveDelete(`instructors/${uid}`);

  for (const prefix of ownedStoragePrefixes(uid)) {
    await deps.deleteStoragePrefix(prefix);
  }

  return { authDeleted, hadInstructor };
}

/** The real dependencies, backed by the Admin SDK. */
export function adminCascadeDeps(): CascadeDeps {
  const db = getFirestore();
  return {
    recursiveDelete: (path) => db.recursiveDelete(db.doc(path)),
    docExists: async (path) => (await db.doc(path).get()).exists,
    deleteStoragePrefix: async (prefix) => {
      await getStorage().bucket().deleteFiles({ prefix });
    },
    deleteAuthUser: (uid) => getAuth().deleteUser(uid),
  };
}

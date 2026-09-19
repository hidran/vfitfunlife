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
 * users/{uid} goes LAST, deliberately. A partial failure anywhere before it leaves the users
 * doc in place, so the user stays listed in /admin/users and either delete path (single or a
 * new bulk job) can find it again and re-run the rest of this idempotent cascade. Deleting it
 * earlier (as this used to) meant a partial failure made the user vanish from the list while
 * its instructor profile, provider applications and files were still orphaned, with no way
 * to find and finish them — single delete says not-found, and a bulk job's own not_found
 * check only recognizes its own audit id, not a stale one from an earlier job.
 *
 * Every step here is safe to run again: recursiveDelete and the storage/provider-application
 * deletes are no-ops on data that is already gone, so a retried or resumed call finishes
 * whatever an earlier, interrupted attempt started. (users/{uid}'s own recursiveDelete can
 * still fail partway through and leave the doc gone before the rest of the cascade finishes —
 * that's what the audit-exists resume path in bulkDeleteJob.ts is for.)
 */
export async function deleteUserCascade(uid: string, deps: CascadeDeps): Promise<void> {
  if (!uid || uid.includes("/")) throw new Error(`Invalid uid: "${uid}"`);

  try {
    await deps.deleteAuthUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }

  await deps.recursiveDelete(`instructors/${uid}`);
  await deps.deleteProviderApplications(uid);

  for (const prefix of ownedStoragePrefixes(uid)) {
    await deps.deleteStoragePrefix(prefix);
  }

  await deps.recursiveDelete(`users/${uid}`);
}

/** The real dependencies, backed by the Admin SDK. */
export function adminCascadeDeps(): CascadeDeps {
  const db = getFirestore();
  return {
    recursiveDelete: (path) => db.recursiveDelete(db.doc(path)),
    deleteProviderApplications: async (uid) => {
      const snap = await db.collection("providerApplications").where("userId", "==", uid).get();
      // Rules let a user create arbitrarily many of these; stay comfortably under Firestore's
      // 500-write batch limit rather than assuming there's only ever a handful.
      const CHUNK_SIZE = 400;
      for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
        const batch = db.batch();
        for (const doc of snap.docs.slice(i, i + CHUNK_SIZE)) batch.delete(doc.ref);
        await batch.commit();
      }
    },
    deleteStoragePrefix: async (prefix) => {
      await getStorage().bucket().deleteFiles({ prefix });
    },
    deleteAuthUser: (uid) => getAuth().deleteUser(uid),
  };
}

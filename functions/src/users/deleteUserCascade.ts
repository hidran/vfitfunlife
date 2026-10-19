import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { BUSINESS_VAT_COLLECTION } from "../providers/businessApplication";
import { businessVenueId, venueDeactivationPatch } from "../providers/businessVenue";

/**
 * What deleting a user removes. Kept on purpose: bookings, payments, transactions and
 * audit_logs (financial and legal records), and reviews or client notes the user left on
 * someone else's document. A company's `businessVat` tax-id claims go too: left behind they
 * would block the real owner of that tax id from ever registering (`vat_already_registered`)
 * with no account left to release them from.
 *
 * The company venue (`venues/biz_<uid>`, when its `ownerId` is the uid) is DEACTIVATED, not
 * deleted: a venue carries courses, sessions and bookings, which are kept records like the
 * bookings above. `ownerId` stays for audit; the venue just leaves the public listings, marked as
 * a system deactivation (`deactivatedBy: 'lifecycle'`). Other venues whose `ownerId` is the uid are
 * NOT touched: there it is the admin-editable manager of a partner gym, whose gym outlives the
 * manager's account.
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
  /** Removes every `businessVat/{vat}` uniqueness claim whose uid == uid (business accounts). */
  deleteBusinessVatClaims: (uid: string) => Promise<void>;
  /** Deactivates the company's own venue `biz_<uid>` (S-4); never deletes it, never touches other venues. */
  deactivateOwnedVenues: (uid: string) => Promise<void>;
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
  await deps.deleteBusinessVatClaims(uid);
  await deps.deactivateOwnedVenues(uid);

  for (const prefix of ownedStoragePrefixes(uid)) {
    await deps.deleteStoragePrefix(prefix);
  }

  await deps.recursiveDelete(`users/${uid}`);
}

/** The real dependencies, backed by the Admin SDK. */
export function adminCascadeDeps(): CascadeDeps {
  const db = getFirestore();
  /** Delete every doc of `collection` whose `field` == `value`, in batches. */
  const deleteWhere = async (collection: string, field: string, value: string) => {
    const snap = await db.collection(collection).where(field, "==", value).get();
    // Rules let a user create arbitrarily many providerApplications; stay comfortably under
    // Firestore's 500-write batch limit rather than assuming there's only ever a handful.
    const CHUNK_SIZE = 400;
    for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
      const batch = db.batch();
      for (const doc of snap.docs.slice(i, i + CHUNK_SIZE)) batch.delete(doc.ref);
      await batch.commit();
    }
  };
  return {
    recursiveDelete: (path) => db.recursiveDelete(db.doc(path)),
    deleteProviderApplications: (uid) => deleteWhere("providerApplications", "userId", uid),
    // Same automatic single-field index on `uid` that applyAsProvider's claim query uses.
    deleteBusinessVatClaims: (uid) => deleteWhere(BUSINESS_VAT_COLLECTION, "uid", uid),
    deactivateOwnedVenues: async (uid) => {
      const ref = db.collection("venues").doc(businessVenueId(uid));
      const snap = await ref.get();
      const now = FieldValue.serverTimestamp();
      const patch = venueDeactivationPatch(uid, { exists: snap.exists, data: snap.data() }, now);
      if (patch) await ref.update(patch);
    },
    deleteStoragePrefix: async (prefix) => {
      await getStorage().bucket().deleteFiles({ prefix });
    },
    deleteAuthUser: (uid) => getAuth().deleteUser(uid),
  };
}

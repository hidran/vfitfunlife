import { doc, writeBatch, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

/**
 * User opts in as a provider. Creates/merges instructors/{uid} as an unverified
 * pending profile and marks users/{uid}.providerStatus = 'pending'. Both docs are
 * written in one batch so the mirrored status never drifts. Idempotent: re-running
 * merges into an existing instructor doc (does not reset a verified provider's
 * isVerified — callers gate this behind providerStatus === 'none').
 *
 * `categoryIds` are taxonomy LEAF ids, stored as `requestedCategoryIds`. They are what the
 * applicant asked to offer, for the admin to review; on approval the
 * decideProviderApplication callable seeds one draft service per id, and the provider's
 * searchable `categoryIds` are then derived from their active services.
 * Throws on Firestore failure; callers (TanStack mutation / form handler) surface the error.
 */
export async function submitProviderApplication(
  uid: string,
  opts: { fullName: string; categoryIds: string[] }
): Promise<void> {
  const batch = writeBatch(db);
  const instructorRef = doc(db, 'instructors', uid);
  const userRef = doc(db, 'users', uid);

  batch.set(
    instructorRef,
    {
      uid,
      name: opts.fullName,
      fullName: opts.fullName,
      isActive: true,
      requestedCategoryIds: opts.categoryIds,
      providerProfile: {
        isVerified: false,
        bio: '',
        rating: 0,
        reviewCount: 0,
      },
      applicationStatus: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  batch.update(userRef, { providerStatus: 'pending', updatedAt: serverTimestamp() });

  await batch.commit();
}

/** A pending applicant changes which categories they are applying to offer. */
export async function updateRequestedCategories(uid: string, categoryIds: string[]): Promise<void> {
  await updateDoc(doc(db, 'instructors', uid), {
    requestedCategoryIds: categoryIds,
    updatedAt: serverTimestamp(),
  });
}

import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import type { ProviderApplicationStatus } from '@/types/firebase';

/**
 * User opts in as a provider. Creates/merges instructors/{uid} as an unverified
 * pending profile and marks users/{uid}.providerStatus = 'pending'. Both docs are
 * written in one batch so the mirrored status never drifts. Idempotent: re-running
 * merges into an existing instructor doc (does not reset a verified provider's
 * isVerified — callers gate this behind providerStatus === 'none').
 * Throws on Firestore failure; callers (TanStack mutation / form handler) surface the error.
 */
export async function submitProviderApplication(
  uid: string,
  opts: { fullName: string; categories: string[] }
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
      providerProfile: {
        isVerified: false,
        specialties: opts.categories,
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

/**
 * Admin decision on a pending application. Sets instructors/{uid}.applicationStatus
 * and providerProfile.isVerified together with users/{uid}.providerStatus, in one batch.
 * Throws on Firestore failure; callers (TanStack mutation / form handler) surface the error.
 */
export async function setProviderApplicationStatus(
  uid: string,
  status: Exclude<ProviderApplicationStatus, 'pending'>
): Promise<void> {
  const batch = writeBatch(db);
  const instructorRef = doc(db, 'instructors', uid);
  const userRef = doc(db, 'users', uid);

  batch.update(instructorRef, {
    applicationStatus: status,
    'providerProfile.isVerified': status === 'verified',
    updatedAt: serverTimestamp(),
  });
  batch.update(userRef, { providerStatus: status, updatedAt: serverTimestamp() });

  await batch.commit();
}

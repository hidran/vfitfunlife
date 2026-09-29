import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { buildLocationPatch, myLocationFromDoc, type MyLocation } from '@/lib/providerLocation';

/** The signed-in provider's saved location, or null when they have no instructor profile. */
export async function fetchMyLocation(uid: string): Promise<MyLocation | null> {
  const snap = await getDoc(doc(db, 'instructors', uid));
  if (!snap.exists()) return null;
  return myLocationFromDoc(snap.data());
}

/**
 * Save the provider's own location on `instructors/{uid}` (the owner-update rule allows it;
 * isVerified and applicationStatus are untouched). See buildLocationPatch for the fields.
 */
export async function saveMyLocation(
  uid: string,
  input: { lat: number; lng: number; city: string }
): Promise<void> {
  await updateDoc(doc(db, 'instructors', uid), {
    ...buildLocationPatch(input),
    locationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

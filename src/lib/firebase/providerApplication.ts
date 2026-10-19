import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { applyAsProvider, type ApplyAsProviderResult, type ProviderApplicationInput } from './functions';

export type { ProviderApplicationInput };

/**
 * User opts in as a provider and is approved on the spot: `instructors/{uid}` is created as a
 * verified, bookable profile, `users/{uid}` becomes role 'provider' with
 * `providerStatus: 'verified'`, default Mon-Fri hours are seeded, and one inactive, unpriced
 * draft service is created per requested category so the choices made at signup land in
 * /provider/services. An admin can un-verify afterwards from the back office.
 *
 * A company (`providerType: 'business'` + `business`) is never approved on the spot: it is
 * queued for an admin and the result comes back with `status: 'pending'`.
 *
 * This is a callable, not a client batch. `firestore.rules` deliberately allows a user to
 * create only an *unverified, pending* instructors document and forbids them from ever
 * writing `providerProfile.isVerified` or `applicationStatus` — the public read of
 * `instructors/{id}` keys on that flag, so letting the browser set it would let anyone list
 * themselves. The Admin SDK performs the same write an admin's decision would.
 *
 * `categoryIds` are taxonomy LEAF ids. The server drops unknown and non-leaf ids, so what
 * ends up in `requestedCategoryIds` is always a real part of the catalogue.
 *
 * Takes no uid: the server acts on the authenticated caller, so passing one would only
 * invite the belief that a client can apply on someone else's behalf.
 *
 * Throws on failure; callers (the registration form) surface the error.
 */
export async function submitProviderApplication(
  opts: ProviderApplicationInput & { fullName: string }
): Promise<ApplyAsProviderResult> {
  const providerType = opts.providerType ?? 'individual';
  return applyAsProvider({
    categoryIds: opts.categoryIds,
    fullName: opts.fullName,
    providerType,
    ...(providerType === 'business' && opts.business ? { business: opts.business } : {}),
  });
}

/** A provider changes which categories they offer, before they have priced real services. */
export async function updateRequestedCategories(uid: string, categoryIds: string[]): Promise<void> {
  await updateDoc(doc(db, 'instructors', uid), {
    requestedCategoryIds: categoryIds,
    updatedAt: serverTimestamp(),
  });
}

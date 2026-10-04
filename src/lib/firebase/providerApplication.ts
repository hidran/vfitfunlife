import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { applyAsProvider } from './functions';

/** The `business` block of an application: a company or association (plan 2026-10-04, B5). */
export type BusinessApplicationInput = NonNullable<Parameters<typeof applyAsProvider>[0]['business']>;

/**
 * What the applicant chose: an individual (the default — the shape every caller used before
 * businesses existed), or a company with its details.
 */
export type ProviderApplicationChoice =
  | { categoryIds: string[]; providerType?: 'individual' }
  | { categoryIds: string[]; providerType: 'business'; business: BusinessApplicationInput };

export type ProviderApplicationInput = ProviderApplicationChoice & { fullName: string };

export type ProviderApplicationResult = Awaited<ReturnType<typeof applyAsProvider>>;

/**
 * User opts in as a provider. With auto-approval on (the default) an individual is approved on
 * the spot: `instructors/{uid}` is created as a verified, bookable profile, `users/{uid}`
 * becomes role 'provider' with `providerStatus: 'verified'`, default Mon-Fri hours are seeded,
 * and one inactive, unpriced draft service is created per requested category so the choices
 * made at signup land in /provider/services. An admin can un-verify afterwards from the back
 * office. With auto-approval off the application is queued as pending instead.
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
 * A company (`providerType: 'business'` plus its details) is never approved on the spot: it
 * is always queued for an admin to check the tax id (`autoApproved: false`). An individual's
 * call is exactly what it was before companies existed — no `providerType` key at all.
 *
 * Throws on failure; callers (the registration form) surface the error. A failure the server
 * can name carries a stable code as its message (see providerApplicationErrors.ts).
 */
export async function submitProviderApplication(
  opts: ProviderApplicationInput
): Promise<ProviderApplicationResult> {
  if (opts.providerType === 'business') {
    return applyAsProvider({
      categoryIds: opts.categoryIds,
      fullName: opts.fullName,
      providerType: 'business',
      business: opts.business,
    });
  }
  return applyAsProvider({ categoryIds: opts.categoryIds, fullName: opts.fullName });
}

/** A provider changes which categories they offer, before they have priced real services. */
export async function updateRequestedCategories(uid: string, categoryIds: string[]): Promise<void> {
  await updateDoc(doc(db, 'instructors', uid), {
    requestedCategoryIds: categoryIds,
    updatedAt: serverTimestamp(),
  });
}

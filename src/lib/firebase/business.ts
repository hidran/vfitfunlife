import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { uploadImageWithThumbnail } from './storage';
import { AVATAR_DERIVATIVES } from './thumbnails';

/**
 * What the owner of a business account may change on `instructors/{uid}.business`.
 * Mirrors the allowlist in firestore.rules (businessProtectedUnchanged): legalName,
 * vatNumber, venueType, address and venueId are admin-verified and frozen.
 */
export interface BusinessProfilePatch {
  displayName?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  city?: string;
}

const EDITABLE_BUSINESS_FIELDS = ['displayName', 'description', 'website', 'logoUrl', 'city'] as const;

/**
 * Updates the presentation fields of a company. Dotted paths with `updateDoc` touch only
 * those keys inside the `business` map (a `set` with merge would replace the whole map
 * and trip the rules). The public name is mirrored to `name`/`fullName`, which is what
 * search indexes and lists render. Undefined entries are dropped; unknown keys are never
 * written, so a stale caller cannot reach a frozen field.
 */
export async function updateBusinessDetails(uid: string, patch: BusinessProfilePatch): Promise<void> {
  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_BUSINESS_FIELDS) {
    const value = patch[field];
    if (value !== undefined) update[`business.${field}`] = value;
  }
  if (patch.displayName !== undefined) {
    update.name = patch.displayName;
    update.fullName = patch.displayName;
  }
  update.updatedAt = serverTimestamp();
  await updateDoc(doc(db, 'instructors', uid), update);
}

/**
 * Uploads a company logo and returns its download URL. `instructors/{uid}/gallery/` is the
 * one instructors path storage.rules lets the owner write; the `logo-` stem keeps it apart
 * from portfolio photos in listings. Avatar-sized derivatives: a logo renders small.
 */
export async function uploadBusinessLogo(uid: string, file: File): Promise<string> {
  const { url } = await uploadImageWithThumbnail({
    dir: `instructors/${uid}/gallery`,
    stem: `logo-${Date.now()}`,
    file,
    spec: AVATAR_DERIVATIVES,
    maxSizeMB: 0.5,
  });
  return url;
}

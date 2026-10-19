import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './config';
import type { BusinessDetails } from '@/types/firebase';
import {
  BUSINESS_OWNER_EDITABLE_KEYS,
  type BusinessDisplayChanges,
} from '@/lib/businessDetails';

/**
 * The company profile of a business provider (plan 2026-10-04, B6): `instructors/{uid}.business`.
 */

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * The `business` map of `instructors/{uid}`, or null when the document or the map is missing
 * (an individual provider). Throws when the read fails, so the caller can tell "not a company"
 * from "could not load".
 */
export async function fetchBusinessDetails(uid: string): Promise<BusinessDetails | null> {
  const snap = await getDoc(doc(db, 'instructors', uid));
  if (!snap.exists()) return null;
  const business = (snap.data() as Record<string, unknown>).business;
  if (!business || typeof business !== 'object' || Array.isArray(business)) return null;
  const map = business as Record<string, unknown>;
  return {
    legalName: text(map.legalName),
    vatNumber: text(map.vatNumber),
    ...(typeof map.legalForm === 'string' ? { legalForm: map.legalForm as BusinessDetails['legalForm'] } : {}),
    affiliationNumber: text(map.affiliationNumber),
    displayName: text(map.displayName),
    description: text(map.description),
    website: textOrNull(map.website),
    logoUrl: textOrNull(map.logoUrl),
    city: text(map.city),
  };
}

/**
 * The `updateDoc` fields for a change to the owner-editable part of the business map: one
 * dotted field path per changed key (`business.displayName`, …), plus the public name mirrored
 * to `name` and `fullName`, which every card and search token reads.
 *
 * Only BUSINESS_OWNER_EDITABLE_KEYS are copied, so the four reviewed keys (legal name, tax id,
 * legal form, affiliation number) can never be sent from here, and the `business` map is never
 * written as a whole (that would replace it, reviewed keys included).
 */
export function businessDisplayPatch(changes: BusinessDisplayChanges): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of BUSINESS_OWNER_EDITABLE_KEYS) {
    const value = changes[key];
    if (value !== undefined) patch[`business.${key}`] = value;
  }
  if (changes.displayName !== undefined) {
    patch.name = changes.displayName;
    patch.fullName = changes.displayName;
  }
  return patch;
}

/**
 * Save the owner's changes to their company profile. Resolves false (and writes nothing) when
 * there is nothing to change.
 *
 * `updateDoc` reads each dotted key as a field PATH, so `'business.city'` updates only that
 * field inside the map and leaves the reviewed keys alone. That is NOT true of
 * `setDoc(…, { merge: true })`, which stores a dotted key literally as a top-level field named
 * "business.city" — never switch this write to set/merge (plan §0, nested-flag rule).
 */
export async function updateBusinessDisplayFields(
  uid: string,
  changes: BusinessDisplayChanges
): Promise<boolean> {
  const patch = businessDisplayPatch(changes);
  if (Object.keys(patch).length === 0) return false;
  await updateDoc(doc(db, 'instructors', uid), { ...patch, updatedAt: serverTimestamp() });
  return true;
}

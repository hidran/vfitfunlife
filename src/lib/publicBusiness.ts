import type { BusinessDetails, BusinessLegalForm } from '@/types/firebase';

/**
 * Defensive reader for the `business` map of a public `instructors/{id}` document.
 *
 * The "Azienda" badge is derived from the PRESENCE of a valid map, never from
 * `providerType`: owners can write `instructors.providerType` from the client but can neither
 * add nor remove `business` (firestore.rules), so only the map is trustworthy.
 *
 * Validity rule (minimal): a plain object (not an array) whose `displayName` is a non-empty
 * string after trimming. That is the one field every public surface needs; the legal fields
 * are coerced to "" when absent or mistyped because nothing public renders them. Optional
 * fields are present only when they have the right type, and `website`/`logoUrl` only when
 * they are http(s) URLs.
 */

const LEGAL_FORMS: readonly BusinessLegalForm[] = ['company', 'sole_trader', 'association', 'other'];

/** `value` when it is a string URL with an http(s) scheme, else undefined. Re-check at render time. */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : undefined;
  } catch {
    return undefined;
  }
}

const text = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t : undefined;
};

export function readBusinessDetails(raw: unknown): BusinessDetails | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const b = raw as Record<string, unknown>;
  const displayName = text(b.displayName);
  if (!displayName) return undefined;
  const out: BusinessDetails = {
    legalName: text(b.legalName) ?? '',
    vatNumber: text(b.vatNumber) ?? '',
    displayName,
  };
  const description = text(b.description);
  if (description) out.description = description;
  const website = safeHttpUrl(b.website);
  if (website) out.website = website;
  const logoUrl = safeHttpUrl(b.logoUrl);
  if (logoUrl) out.logoUrl = logoUrl;
  const city = text(b.city);
  if (city) out.city = city;
  if (typeof b.legalForm === 'string' && (LEGAL_FORMS as readonly string[]).includes(b.legalForm)) {
    out.legalForm = b.legalForm as BusinessLegalForm;
  }
  const affiliationNumber = text(b.affiliationNumber);
  if (affiliationNumber) out.affiliationNumber = affiliationNumber;
  return out;
}

/** What public pages may carry: no legal name, tax id, legal form or registration number. */
export type PublicBusiness = Pick<BusinessDetails, 'displayName' | 'description' | 'website' | 'logoUrl' | 'city'>;

export function toPublicBusiness(details: BusinessDetails | undefined): PublicBusiness | undefined {
  if (!details) return undefined;
  const out: PublicBusiness = { displayName: details.displayName };
  if (details.description) out.description = details.description;
  if (details.website) out.website = details.website;
  if (details.logoUrl) out.logoUrl = details.logoUrl;
  if (details.city) out.city = details.city;
  return out;
}

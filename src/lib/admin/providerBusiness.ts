import type { BusinessLegalForm, BusinessVenueType } from '@/types/firebase';
import type { BusinessReview } from '@/lib/firebase/functions';
import { BUSINESS_LEGAL_FORMS, BUSINESS_VENUE_TYPES } from '@/lib/businessDetails';
import { safeHttpUrl } from '@/lib/publicBusiness';

/**
 * The `business` map of an `instructors/{uid}` document as the admin screens show it (plan
 * 2026-10-04, B8): every field, the admin-only legal ones included. Not the public reader
 * (`readBusinessDetails`), which drops a map without a public name — an admin must still see,
 * and review, such a company, because the server treats ANY object there as one
 * (`businessOf` in functions/src/providers/businessAdminRules.ts).
 */
export interface AdminBusiness {
  /** As stored (not trimmed): sent back verbatim as the approval's `expectedReview`. */
  legalName: string;
  /** As stored (not normalised), for the same reason. */
  vatNumber: string;
  /** Absent ⇒ 'company' (docs written before B3b); an unknown value ⇒ null. */
  legalForm: BusinessLegalForm | null;
  affiliationNumber: string;
  displayName: string;
  description: string;
  /** http(s) only, else null — never an href otherwise. */
  website: string | null;
  /** http(s) only, else null. */
  logoUrl: string | null;
  city: string;
  /**
   * B12: what the approval's venue is built from. null ⇒ not specified (absent, as on companies that
   * predate the field or signed up from an old client, or an unusable value): approval creates no venue.
   */
  venueType: BusinessVenueType | null;
  /** As stored; '' when none. */
  address: string;
  /** `venues/{id}` created at approval, null before it. */
  venueId: string | null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function readAdminBusiness(raw: unknown): AdminBusiness | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const legalForm =
    b.legalForm === undefined
      ? 'company'
      : (BUSINESS_LEGAL_FORMS as readonly unknown[]).includes(b.legalForm)
        ? (b.legalForm as BusinessLegalForm)
        : null;
  return {
    legalName: text(b.legalName),
    vatNumber: text(b.vatNumber),
    legalForm,
    affiliationNumber: text(b.affiliationNumber),
    displayName: text(b.displayName),
    description: text(b.description),
    website: safeHttpUrl(b.website) ?? null,
    logoUrl: safeHttpUrl(b.logoUrl) ?? null,
    city: text(b.city),
    venueType: (BUSINESS_VENUE_TYPES as readonly unknown[]).includes(b.venueType)
      ? (b.venueType as BusinessVenueType)
      : null,
    address: text(b.address),
    venueId: text(b.venueId).trim() || null,
  };
}

/**
 * What the admin approved: the tax id, legal name, legal form, affiliation number and (B12) the
 * venue type and address on screen, exactly as they were read. A venue type that is not specified
 * is left out: the server reads an omitted one as 'none', which is what an absent one is (and an
 * unusable stored one is refused as stale rather than guessed).
 */
export function businessReviewOf(business: AdminBusiness): BusinessReview {
  return {
    vatNumber: business.vatNumber,
    legalName: business.legalName,
    legalForm: business.legalForm,
    affiliationNumber: business.affiliationNumber,
    ...(business.venueType ? { venueType: business.venueType } : {}),
    address: business.address,
  };
}

import type { BusinessLegalForm } from '@/types/firebase';
import type { BusinessReview } from '@/lib/firebase/functions';
import { BUSINESS_LEGAL_FORMS } from '@/lib/businessDetails';
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
  };
}

/** What the admin approved: the tax id and legal name on screen, exactly as they were read. */
export function businessReviewOf(business: AdminBusiness): BusinessReview {
  return { vatNumber: business.vatNumber, legalName: business.legalName };
}

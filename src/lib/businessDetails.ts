import type { MessageKey } from '@/i18n/messages';
import type { BusinessDetails, BusinessLegalForm, BusinessVenueType } from '@/types/firebase';
import { BUSINESS_LEGAL_FORMS, BUSINESS_VENUE_TYPES } from '@/lib/businessTaxonomy';
import type { BusinessApplicationInput } from '@/lib/firebase/providerApplication';
import { normalizeVatNumber } from '@/lib/vatNumber';

// The enumerations live in businessTaxonomy.ts (a leaf for the public search path); kept here too
// so every screen that reads them from this module keeps working.
export { BUSINESS_LEGAL_FORMS, BUSINESS_VENUE_TYPES };

/**
 * The company / association details a provider fills in at signup (plan 2026-10-04, B5).
 * Limits and rules mirror the server's `validateBusinessInput`
 * (functions/src/providers/businessApplication.ts), so whatever passes here is accepted there,
 * except for what only the server can know (a tax id already claimed by someone else).
 *
 * The zod schemas live in `businessDetailsSchema.ts` so that this module (read by the public
 * search path and the admin screens) does not pull zod into their first-load bundles.
 */

/** The message key of each legal form's label: the one map every screen uses. */
export const LEGAL_FORM_LABEL: Record<BusinessLegalForm, MessageKey> = {
  company: 'provider.business.legalForm.company',
  sole_trader: 'provider.business.legalForm.soleTrader',
  association: 'provider.business.legalForm.association',
  other: 'provider.business.legalForm.other',
};

/** The message key of each venue type's label: the one map every screen uses. */
export const VENUE_TYPE_LABEL: Record<BusinessVenueType, MessageKey> = {
  gym: 'provider.business.venue.gym',
  wellness_center: 'provider.business.venue.wellness_center',
  spa: 'provider.business.venue.spa',
  beauty_salon: 'provider.business.venue.beauty_salon',
  school: 'provider.business.venue.school',
  studio: 'provider.business.venue.studio',
  outdoor_space: 'provider.business.venue.outdoor_space',
  event_space: 'provider.business.venue.event_space',
  none: 'provider.business.venue.none',
};

/** Maximum lengths in characters after trimming — the server's BUSINESS_FIELD_LIMITS. */
export const BUSINESS_FIELD_LIMITS = {
  legalName: 120,
  displayName: 120,
  description: 1000,
  city: 80,
  website: 200,
  affiliationNumber: 40,
  address: 200,
  /** The Firestore rules' cap on `business.logoUrl` (B4); the logo is never typed. */
  logoUrl: 500,
} as const;

/** Every message the schema can produce. The form shows exactly these (plus field-level server codes). */
export const BUSINESS_FORM_ERRORS = {
  legalNameRequired: 'provider.business.error.legalNameRequired',
  displayNameRequired: 'provider.business.error.displayNameRequired',
  nameInvalid: 'provider.business.error.nameInvalid',
  vatRequired: 'provider.business.error.vatRequired',
  vatInvalid: 'provider.business.error.vatInvalid',
  legalFormInvalid: 'provider.business.error.legalFormInvalid',
  affiliationInvalid: 'provider.business.error.affiliationInvalid',
  cityInvalid: 'provider.business.error.cityInvalid',
  websiteInvalid: 'provider.business.error.websiteInvalid',
  websiteTooLong: 'provider.business.error.websiteTooLong',
  descriptionInvalid: 'provider.business.error.descriptionInvalid',
  venueTypeInvalid: 'provider.business.error.venueTypeInvalid',
  addressRequired: 'provider.business.error.addressRequired',
  addressInvalid: 'provider.business.error.addressInvalid',
  cityRequired: 'provider.business.error.cityRequired',
} as const satisfies Record<string, MessageKey>;

/**
 * Raw form values: every field is a string as typed (the legal form and the venue type are
 * selects). `venueType` is '' only in edit mode, for a company stored without one (it signed up
 * before the venue type existed): the form then shows nothing rather than a default nobody
 * reviewed.
 */
export interface BusinessDetailsFormValues {
  legalName: string;
  vatNumber: string;
  legalForm: BusinessLegalForm;
  affiliationNumber: string;
  displayName: string;
  venueType: BusinessVenueType | '';
  address: string;
  city: string;
  website: string;
  description: string;
}

export type BusinessField = keyof BusinessDetailsFormValues;

export const EMPTY_BUSINESS_DETAILS: BusinessDetailsFormValues = {
  legalName: '',
  vatNumber: '',
  legalForm: 'company',
  affiliationNumber: '',
  displayName: '',
  venueType: 'gym',
  address: '',
  city: '',
  website: '',
  description: '',
};

/**
 * A website as typed → the URL to store, `''` for none, or `null` when it can't be one.
 *
 * People type `www.example.it`; the server only takes http(s) URLs, so a missing scheme gets
 * `https://`. Anything with another scheme (`ftp://`, `mailto:`, `javascript:`) or with
 * credentials in it is refused rather than "fixed", and the scheme is lower-cased because the
 * Firestore rules' `^https?://` check is case-sensitive.
 *
 * Format only: the length cap (BUSINESS_FIELD_LIMITS.website, which counts the added `https://`)
 * is the schema's job, so that a long address gets its own "too long" message.
 */
export function normalizeWebsite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/\s/.test(trimmed)) return null;

  let candidate = trimmed;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    // `mailto:x@y.it`, `javascript:…` — a scheme, not a host. (`example.it:8080` is a host.)
    if (/^[a-z][a-z\d+.-]*:(?!\d)/i.test(trimmed)) return null;
    candidate = `https://${trimmed}`;
  }
  candidate = candidate.replace(/^[a-z][a-z\d+.-]*:/i, (scheme) => scheme.toLowerCase());

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.') || url.username || url.password) return null;
  return candidate;
}

/**
 * Valid form values → the `business` payload of `applyAsProvider`: trimmed, the tax id as bare
 * digits, the public name defaulting to the legal name, the website with its scheme, and the
 * optional fields left out when blank (the server stores those as "" / null).
 */
export function toBusinessApplication(values: BusinessDetailsFormValues): BusinessApplicationInput {
  const legalName = values.legalName.trim();
  const venueType = values.venueType || 'gym';
  const out: BusinessApplicationInput = {
    legalName,
    vatNumber: normalizeVatNumber(values.vatNumber),
    legalForm: values.legalForm,
    displayName: values.displayName.trim() || legalName,
    venueType,
  };
  const affiliationNumber = values.affiliationNumber.trim();
  if (affiliationNumber) out.affiliationNumber = affiliationNumber;
  const city = values.city.trim();
  if (city) out.city = city;
  // A company without premises has no address to send, even if one was typed before the switch.
  const address = values.address.trim();
  if (address && venueType !== 'none') out.address = address;
  const website = normalizeWebsite(values.website);
  if (website) out.website = website;
  const description = values.description.trim();
  if (description) out.description = description;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Editing an existing company profile (plan B6)
// ---------------------------------------------------------------------------------------------

/**
 * The parts of `instructors/{uid}.business` the owner may change from the client — exactly
 * what the Firestore rules allow (firestore.rules, "BUSINESS ACCOUNTS"; decision D6). The
 * others (legal name, tax id, legal form, affiliation number, and since B12 the venue type,
 * address and venue id) are what an admin reviewed or the server wrote.
 */
export const BUSINESS_OWNER_EDITABLE_KEYS = [
  'displayName',
  'description',
  'website',
  'city',
  'logoUrl',
] as const satisfies readonly (keyof BusinessDetails)[];

/** The editable fields that are typed into the form (the logo is uploaded instead). */
export const BUSINESS_DISPLAY_FIELDS = [
  'displayName',
  'city',
  'website',
  'description',
] as const satisfies readonly BusinessField[];

export type BusinessDisplayField = (typeof BUSINESS_DISPLAY_FIELDS)[number];

/** Normalised display values, as stored: `website` null when there is none. */
export interface BusinessDisplayFields {
  displayName: string;
  city: string;
  website: string | null;
  description: string;
}

/** A change to the owner-editable part of the business map: only the keys that changed. */
export type BusinessDisplayChanges = Partial<BusinessDisplayFields & { logoUrl: string | null }>;

/**
 * Stored business details → form values (every field a string; an unknown legal form ⇒
 * company). The venue type is kept as stored, '' when absent or unknown: in edit mode it is
 * display-only (frozen, never written), so a company saved without one shows nothing rather
 * than a default the admin never verified.
 */
export function businessFormValues(details: BusinessDetails): BusinessDetailsFormValues {
  const legalForm = (BUSINESS_LEGAL_FORMS as readonly string[]).includes(details.legalForm ?? '')
    ? (details.legalForm as BusinessLegalForm)
    : 'company';
  return {
    legalName: details.legalName ?? '',
    vatNumber: details.vatNumber ?? '',
    legalForm,
    affiliationNumber: details.affiliationNumber ?? '',
    displayName: details.displayName ?? '',
    venueType: (BUSINESS_VENUE_TYPES as readonly string[]).includes(details.venueType ?? '')
      ? (details.venueType as BusinessVenueType)
      : '',
    address: details.address ?? '',
    city: details.city ?? '',
    website: details.website ?? '',
    description: details.description ?? '',
  };
}

/** Valid edit-form values → the display fields to store: trimmed, the website with its scheme. */
export function toBusinessDisplayFields(
  values: Pick<BusinessDetailsFormValues, BusinessDisplayField>
): BusinessDisplayFields {
  return {
    displayName: values.displayName.trim(),
    city: values.city.trim(),
    website: normalizeWebsite(values.website) || null,
    description: values.description.trim(),
  };
}

/**
 * Whether `url` may be stored as `business.logoUrl`: the rules accept only an https URL of at
 * most 500 characters (a Firebase Storage download URL in practice).
 */
export function isAcceptableLogoUrl(url: string): boolean {
  return url.length <= BUSINESS_FIELD_LIMITS.logoUrl && /^https:\/\/\S+$/.test(url);
}

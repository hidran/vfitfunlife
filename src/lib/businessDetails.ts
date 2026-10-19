import { z } from 'zod';
import type { MessageKey } from '@/i18n/messages';
import type { BusinessDetails, BusinessLegalForm } from '@/types/firebase';
import type { BusinessApplicationInput } from '@/lib/firebase/providerApplication';
import { isValidItalianVat, normalizeVatNumber } from '@/lib/vatNumber';

/**
 * The company / association details a provider fills in at signup (plan 2026-10-04, B5).
 * Limits and rules mirror the server's `validateBusinessInput`
 * (functions/src/providers/businessApplication.ts), so whatever passes here is accepted there,
 * except for what only the server can know (a tax id already claimed by someone else).
 */

/**
 * The legal forms offered, in display order. The first is the default (as on the server). Also
 * the schema's enum, so the list and the validation can't drift apart.
 */
export const BUSINESS_LEGAL_FORMS = [
  'company',
  'sole_trader',
  'association',
  'other',
] as const satisfies readonly BusinessLegalForm[];

/** The message key of each legal form's label: the one map every screen uses. */
export const LEGAL_FORM_LABEL: Record<BusinessLegalForm, MessageKey> = {
  company: 'provider.business.legalForm.company',
  sole_trader: 'provider.business.legalForm.soleTrader',
  association: 'provider.business.legalForm.association',
  other: 'provider.business.legalForm.other',
};

/** Maximum lengths in characters after trimming — the server's BUSINESS_FIELD_LIMITS. */
export const BUSINESS_FIELD_LIMITS = {
  legalName: 120,
  displayName: 120,
  description: 1000,
  city: 80,
  website: 200,
  affiliationNumber: 40,
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
} as const satisfies Record<string, MessageKey>;

/** Raw form values: every field is a string as typed (the legal form is a select). */
export interface BusinessDetailsFormValues {
  legalName: string;
  vatNumber: string;
  legalForm: BusinessLegalForm;
  affiliationNumber: string;
  displayName: string;
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

const optionalText = (max: number, message: MessageKey) =>
  z.string().refine((v) => v.trim().length <= max, { message });

/**
 * Validation of the form. Messages are i18n keys (BUSINESS_FORM_ERRORS); the form translates
 * them. No transforms: the values stay exactly what was typed, `toBusinessApplication`
 * normalises them.
 */
export const businessDetailsSchema = z.object({
  legalName: z
    .string()
    .refine((v) => v.trim().length > 0, { message: BUSINESS_FORM_ERRORS.legalNameRequired })
    .refine((v) => v.trim().length <= BUSINESS_FIELD_LIMITS.legalName, {
      message: BUSINESS_FORM_ERRORS.nameInvalid,
    }),
  vatNumber: z
    .string()
    .refine((v) => v.trim().length > 0, { message: BUSINESS_FORM_ERRORS.vatRequired })
    .refine((v) => v.trim().length === 0 || isValidItalianVat(v), {
      message: BUSINESS_FORM_ERRORS.vatInvalid,
    }),
  legalForm: z.enum(BUSINESS_LEGAL_FORMS, { message: BUSINESS_FORM_ERRORS.legalFormInvalid }),
  affiliationNumber: optionalText(BUSINESS_FIELD_LIMITS.affiliationNumber, BUSINESS_FORM_ERRORS.affiliationInvalid),
  displayName: optionalText(BUSINESS_FIELD_LIMITS.displayName, BUSINESS_FORM_ERRORS.nameInvalid),
  city: optionalText(BUSINESS_FIELD_LIMITS.city, BUSINESS_FORM_ERRORS.cityInvalid),
  // Two checks, at most one fails: a malformed address is "invalid", a well-formed one longer
  // than the cap (counting an added `https://`) is "too long".
  website: z
    .string()
    .refine((v) => normalizeWebsite(v) !== null, { message: BUSINESS_FORM_ERRORS.websiteInvalid })
    .refine((v) => (normalizeWebsite(v) ?? '').length <= BUSINESS_FIELD_LIMITS.website, {
      message: BUSINESS_FORM_ERRORS.websiteTooLong,
    }),
  description: optionalText(BUSINESS_FIELD_LIMITS.description, BUSINESS_FORM_ERRORS.descriptionInvalid),
});

/**
 * Valid form values → the `business` payload of `applyAsProvider`: trimmed, the tax id as bare
 * digits, the public name defaulting to the legal name, the website with its scheme, and the
 * optional fields left out when blank (the server stores those as "" / null).
 */
export function toBusinessApplication(values: BusinessDetailsFormValues): BusinessApplicationInput {
  const legalName = values.legalName.trim();
  const out: BusinessApplicationInput = {
    legalName,
    vatNumber: normalizeVatNumber(values.vatNumber),
    legalForm: values.legalForm,
    displayName: values.displayName.trim() || legalName,
  };
  const affiliationNumber = values.affiliationNumber.trim();
  if (affiliationNumber) out.affiliationNumber = affiliationNumber;
  const city = values.city.trim();
  if (city) out.city = city;
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
 * other four (legal name, tax id, legal form, affiliation number) are what an admin reviewed.
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
 * The schema of the form in edit mode. The reviewed fields are shown read-only and never
 * sent, so they are not validated (an older document may hold values today's signup rules
 * would refuse). The public name becomes required: it is what every card shows, and the rules
 * refuse a blank one.
 */
export const businessEditSchema = businessDetailsSchema.extend({
  legalName: z.string(),
  vatNumber: z.string(),
  affiliationNumber: z.string(),
  displayName: z
    .string()
    .refine((v) => v.trim().length > 0, { message: BUSINESS_FORM_ERRORS.displayNameRequired })
    .refine((v) => v.trim().length <= BUSINESS_FIELD_LIMITS.displayName, {
      message: BUSINESS_FORM_ERRORS.nameInvalid,
    }),
});

/** Stored business details → form values (every field a string; an unknown legal form ⇒ company). */
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

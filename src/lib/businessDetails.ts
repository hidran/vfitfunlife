import { z } from 'zod';
import type { MessageKey } from '@/i18n/messages';
import type { BusinessLegalForm } from '@/types/firebase';
import type { BusinessApplicationInput } from '@/lib/firebase/providerApplication';
import { isValidItalianVat, normalizeVatNumber } from '@/lib/vatNumber';

/**
 * The company / association details a provider fills in at signup (plan 2026-10-04, B5).
 * Limits and rules mirror the server's `validateBusinessInput`
 * (functions/src/providers/businessApplication.ts), so whatever passes here is accepted there,
 * except for what only the server can know (a tax id already claimed by someone else).
 */

/** The legal forms offered, in display order. The first is the default (as on the server). */
export const BUSINESS_LEGAL_FORMS: readonly BusinessLegalForm[] = [
  'company',
  'sole_trader',
  'association',
  'other',
];

/** Maximum lengths in characters after trimming — the server's BUSINESS_FIELD_LIMITS. */
export const BUSINESS_FIELD_LIMITS = {
  legalName: 120,
  displayName: 120,
  description: 1000,
  city: 80,
  website: 200,
  affiliationNumber: 40,
} as const;

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
  if (candidate.length > BUSINESS_FIELD_LIMITS.website) return null;
  return candidate;
}

/** Ties a schema message to a real catalogue key, so a typo fails `tsc`, not the screen. */
const key = (k: MessageKey) => k;

const optionalText = (max: number, message: MessageKey) =>
  z.string().refine((v) => v.trim().length <= max, { message });

/**
 * Validation of the form. Messages are i18n keys; the form translates them. No transforms:
 * the values stay exactly what was typed, `toBusinessApplication` normalises them.
 */
export const businessDetailsSchema = z.object({
  legalName: z
    .string()
    .refine((v) => v.trim().length > 0, { message: key('provider.business.error.legalNameRequired') })
    .refine((v) => v.trim().length <= BUSINESS_FIELD_LIMITS.legalName, {
      message: key('provider.business.error.nameInvalid'),
    }),
  vatNumber: z
    .string()
    .refine((v) => v.trim().length > 0, { message: key('provider.business.error.vatRequired') })
    .refine((v) => v.trim().length === 0 || isValidItalianVat(v), {
      message: key('provider.business.error.vatInvalid'),
    }),
  legalForm: z.enum(['company', 'sole_trader', 'association', 'other'], {
    message: key('provider.business.error.legalFormInvalid'),
  }),
  affiliationNumber: optionalText(
    BUSINESS_FIELD_LIMITS.affiliationNumber,
    key('provider.business.error.affiliationInvalid'),
  ),
  displayName: optionalText(BUSINESS_FIELD_LIMITS.displayName, key('provider.business.error.nameInvalid')),
  city: optionalText(BUSINESS_FIELD_LIMITS.city, key('provider.business.error.cityInvalid')),
  website: z.string().refine((v) => normalizeWebsite(v) !== null, {
    message: key('provider.business.error.websiteInvalid'),
  }),
  description: optionalText(
    BUSINESS_FIELD_LIMITS.description,
    key('provider.business.error.descriptionInvalid'),
  ),
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

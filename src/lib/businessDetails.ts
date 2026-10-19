import type { MessageKey } from '@/i18n/messages';
import type { BusinessVenueType } from '@/types/firebase';
import type { BusinessApplicationInput } from '@/lib/firebase/functions';
import { isValidItalianVat, normalizeVatNumber } from '@/lib/vatNumber';

/** What the company form holds; every field a string so inputs stay controlled. */
export interface BusinessDetailsValues {
  legalName: string;
  vatNumber: string;
  displayName: string;
  venueType: BusinessVenueType;
  address: string;
  city: string;
  website: string;
}

export type BusinessDetailsField = keyof BusinessDetailsValues;

/** Errors keyed by field; the value is the message key to show under that input. */
export type BusinessDetailsErrors = Partial<Record<BusinessDetailsField, MessageKey>>;

/** The order fields appear on screen — focus goes to the first one in error. */
export const BUSINESS_FIELD_ORDER: readonly BusinessDetailsField[] = [
  'legalName',
  'vatNumber',
  'displayName',
  'venueType',
  'address',
  'city',
  'website',
];

export const BUSINESS_VENUE_TYPES: readonly BusinessVenueType[] = ['gym', 'school', 'studio', 'none'];

export const EMPTY_BUSINESS_DETAILS: BusinessDetailsValues = {
  legalName: '',
  vatNumber: '',
  displayName: '',
  venueType: 'gym',
  address: '',
  city: '',
  website: '',
};

/** Same caps as the server's business validation (functions/src/providers/businessApplication.ts BUSINESS_LIMITS). */
const MAX_NAME = 120;
const MAX_ADDRESS = 200;
const MAX_CITY = 120;
const MAX_WEBSITE = 300;

/** http(s) URL check that mirrors the server's: parseable and an http/https scheme. */
export function isValidWebsite(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Client-side validation of the company form. Pure, so the register page and the
 * profile card share one rule set and the tests need no DOM. Address and city are
 * only needed when a venue is going to be created, i.e. venueType !== 'none'.
 */
export function validateBusinessDetails(values: BusinessDetailsValues): BusinessDetailsErrors {
  const errors: BusinessDetailsErrors = {};
  const legalName = values.legalName.trim();
  const displayName = values.displayName.trim();
  const vat = normalizeVatNumber(values.vatNumber);
  const address = values.address.trim();
  const city = values.city.trim();
  const website = values.website.trim();

  if (!legalName) errors.legalName = 'provider.business.error.legalNameRequired';
  else if (legalName.length > MAX_NAME) errors.legalName = 'provider.business.error.tooLong';

  if (!vat) errors.vatNumber = 'provider.business.error.vatRequired';
  else if (!isValidItalianVat(vat)) errors.vatNumber = 'provider.business.error.vatInvalid';

  if (!displayName) errors.displayName = 'provider.business.error.displayNameRequired';
  else if (displayName.length > MAX_NAME) errors.displayName = 'provider.business.error.tooLong';

  if (!BUSINESS_VENUE_TYPES.includes(values.venueType)) {
    errors.venueType = 'provider.business.error.venueTypeInvalid';
  }

  const needsPremises = values.venueType !== 'none';
  if (needsPremises && !address) errors.address = 'provider.business.error.addressRequired';
  else if (address.length > MAX_ADDRESS) errors.address = 'provider.business.error.tooLong';

  if (needsPremises && !city) errors.city = 'provider.business.error.cityRequired';
  else if (city.length > MAX_CITY) errors.city = 'provider.business.error.tooLong';

  if (website && !isValidWebsite(website)) errors.website = 'provider.business.error.websiteInvalid';
  else if (website.length > MAX_WEBSITE) errors.website = 'provider.business.error.tooLong';

  return errors;
}

/** The first field in screen order that carries an error, for moving focus on submit. */
export function firstBusinessError(errors: BusinessDetailsErrors): BusinessDetailsField | null {
  return BUSINESS_FIELD_ORDER.find((field) => errors[field]) ?? null;
}

/** Trim and normalise the form values into the callable's payload; empty optionals are dropped. */
export function toBusinessApplicationInput(values: BusinessDetailsValues): BusinessApplicationInput {
  const legalName = values.legalName.trim();
  const displayName = values.displayName.trim() || legalName;
  const input: BusinessApplicationInput = {
    legalName,
    vatNumber: normalizeVatNumber(values.vatNumber),
    displayName,
    venueType: values.venueType,
  };
  const address = values.address.trim();
  const city = values.city.trim();
  const website = values.website.trim();
  if (values.venueType !== 'none') {
    if (address) input.address = address;
    if (city) input.city = city;
  }
  if (website) input.website = website;
  return input;
}

/**
 * Why applyAsProvider refused, as the form should say it. The server sends a stable code
 * as the HttpsError message (`business_vat_taken`, `business_vat_invalid`, …); `field`
 * names the input that message belongs under, when there is one.
 */
export function providerApplicationErrorFor(
  err: unknown
): { key: MessageKey; field: BusinessDetailsField | null } {
  const code = String((err as { code?: unknown } | null)?.code ?? '');
  const message = String((err as { message?: unknown } | null)?.message ?? '');
  if (code === 'functions/permission-denied') {
    return { key: 'auth.register.error.providerNotAllowed', field: null };
  }
  switch (message) {
    case 'business_vat_taken':
      return { key: 'provider.business.error.vatTaken', field: 'vatNumber' };
    case 'business_vat_invalid':
      return { key: 'provider.business.error.vatInvalid', field: 'vatNumber' };
    case 'business_legal_name_required':
    case 'business_legal_name_too_long':
      return { key: 'provider.business.error.legalNameRequired', field: 'legalName' };
    case 'business_display_name_required':
    case 'business_display_name_too_long':
      return { key: 'provider.business.error.displayNameRequired', field: 'displayName' };
    case 'business_website_invalid':
    case 'business_website_too_long':
      return { key: 'provider.business.error.websiteInvalid', field: 'website' };
    case 'business_venue_type_invalid':
      return { key: 'provider.business.error.venueTypeInvalid', field: 'venueType' };
    case 'provider_type_locked':
      return { key: 'provider.business.error.typeLocked', field: null };
    default:
      return { key: 'provider.card.error', field: null };
  }
}

import type { MessageKey } from '@/i18n/messages';
import type { BusinessDetails, BusinessVenueType } from '@/types/firebase';
import type { BusinessApplicationInput } from '@/lib/firebase/functions';
import type { BusinessProfilePatch } from '@/lib/firebase/business';
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
  /** Only shown in edit mode: the signup form keeps to what approval needs. */
  description: string;
}

/**
 * 'apply' is the signup form (everything editable, premises required for a venue);
 * 'edit' is the profile card after approval, where legalName/vatNumber/venueType/address
 * are admin-verified and frozen (firestore.rules businessProtectedUnchanged).
 */
export type BusinessDetailsMode = 'apply' | 'edit';

export type BusinessDetailsField = keyof BusinessDetailsValues;

/** Errors keyed by field; the value is the message key to show under that input. */
export type BusinessDetailsErrors = Partial<Record<BusinessDetailsField, MessageKey>>;

/** The order fields appear on screen — focus goes to the first one in error. */
export const BUSINESS_FIELD_ORDER: readonly BusinessDetailsField[] = [
  'legalName',
  'vatNumber',
  'displayName',
  'description',
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
  description: '',
};

/** Same caps as the server's business validation (functions/src/providers/businessApplication.ts BUSINESS_LIMITS). */
const MAX_NAME = 120;
const MAX_ADDRESS = 200;
const MAX_CITY = 120;
const MAX_WEBSITE = 300;
const MAX_DESCRIPTION = 2000;

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
 * In edit mode the frozen fields are not checked at all (they are never sent) and the
 * public name must be there on its own, since it is what gets mirrored to name/fullName.
 */
export function validateBusinessDetails(
  values: BusinessDetailsValues,
  { mode = 'apply' }: { mode?: BusinessDetailsMode } = {}
): BusinessDetailsErrors {
  const errors: BusinessDetailsErrors = {};
  const editing = mode === 'edit';
  const legalName = values.legalName.trim();
  const displayName = values.displayName.trim();
  const vat = normalizeVatNumber(values.vatNumber);
  const address = values.address.trim();
  const city = values.city.trim();
  const website = values.website.trim();
  const description = values.description.trim();

  if (!editing) {
    if (!legalName) errors.legalName = 'provider.business.error.legalNameRequired';
    else if (legalName.length > MAX_NAME) errors.legalName = 'provider.business.error.tooLong';

    if (!vat) errors.vatNumber = 'provider.business.error.vatRequired';
    else if (!isValidItalianVat(vat)) errors.vatNumber = 'provider.business.error.vatInvalid';
  }

  // At signup the public name falls back to the legal name, so it is only missing when both are.
  if (!displayName && (editing || !legalName)) errors.displayName = 'provider.business.error.displayNameRequired';
  else if (displayName.length > MAX_NAME) errors.displayName = 'provider.business.error.tooLong';

  if (description.length > MAX_DESCRIPTION) errors.description = 'provider.business.error.tooLong';

  if (!editing) {
    if (!BUSINESS_VENUE_TYPES.includes(values.venueType)) {
      errors.venueType = 'provider.business.error.venueTypeInvalid';
    }

    const needsPremises = values.venueType !== 'none';
    if (needsPremises && !address) errors.address = 'provider.business.error.addressRequired';
    else if (address.length > MAX_ADDRESS) errors.address = 'provider.business.error.tooLong';

    if (needsPremises && !city) errors.city = 'provider.business.error.cityRequired';
    else if (city.length > MAX_CITY) errors.city = 'provider.business.error.tooLong';
  } else if (city.length > MAX_CITY) {
    errors.city = 'provider.business.error.tooLong';
  }

  if (website && !isValidWebsite(website)) errors.website = 'provider.business.error.websiteInvalid';
  else if (website.length > MAX_WEBSITE) errors.website = 'provider.business.error.tooLong';

  return errors;
}

/** The first field in screen order that carries an error, for moving focus on submit. */
export function firstBusinessError(errors: BusinessDetailsErrors): BusinessDetailsField | null {
  return BUSINESS_FIELD_ORDER.find((field) => errors[field]) ?? null;
}

export const DEFAULT_BUSINESS_ID_PREFIX = 'business';

/** The DOM id of one company input; the form and whoever focuses it must agree on this. */
export function businessFieldId(field: BusinessDetailsField, prefix = DEFAULT_BUSINESS_ID_PREFIX): string {
  return `${prefix}-${field}`;
}

/** Moves focus to one company input. Returns false when it is not on the page (or disabled). */
export function focusBusinessField(field: BusinessDetailsField, prefix = DEFAULT_BUSINESS_ID_PREFIX): boolean {
  const el = document.getElementById(businessFieldId(field, prefix));
  if (!(el instanceof HTMLElement) || (el as HTMLInputElement).disabled) return false;
  el.focus();
  return document.activeElement === el;
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

/** The stored company as form values, for the profile card; blanks become empty strings. */
export function businessDetailsFromProvider(business: BusinessDetails): BusinessDetailsValues {
  return {
    legalName: business.legalName ?? '',
    vatNumber: business.vatNumber ?? '',
    displayName: business.displayName ?? '',
    venueType: business.venueType ?? 'gym',
    address: business.address ?? '',
    city: business.city ?? '',
    website: business.website ?? '',
    description: business.description ?? '',
  };
}

/**
 * The owner-editable fields, trimmed, for updateBusinessDetails. Empty strings are kept
 * (not dropped) so a website or description can be cleared; the frozen fields never
 * leave the form.
 */
export function toBusinessProfilePatch(values: BusinessDetailsValues): BusinessProfilePatch {
  return {
    displayName: values.displayName.trim(),
    description: values.description.trim(),
    website: values.website.trim(),
    city: values.city.trim(),
  };
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

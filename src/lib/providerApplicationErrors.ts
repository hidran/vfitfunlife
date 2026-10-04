import type { MessageKey } from '@/i18n/messages';
import type { BusinessField } from '@/lib/businessDetails';

/**
 * The stable codes `applyAsProvider` puts in an error's message (functions/src/providers/
 * businessApplication.ts and applyAsProvider.ts). Older checks still throw plain English
 * sentences ("Pick at least one category"); those are not codes and get the generic message.
 */
export const PROVIDER_APPLICATION_ERROR_CODES = [
  'invalid_vat',
  'invalid_business',
  'invalid_business_name',
  'invalid_website',
  'invalid_business_description',
  'invalid_business_city',
  'invalid_provider_type',
  'invalid_legal_form',
  'invalid_affiliation_number',
  'vat_already_registered',
  'vat_change_not_allowed',
  'business_account_exists',
  'business_already_approved',
  'concurrent_update',
] as const;

export type ProviderApplicationErrorCode = (typeof PROVIDER_APPLICATION_ERROR_CODES)[number];

/**
 * What each code means to the user: its text, and the business-form field it is about. A code
 * with no field is a form-level message.
 */
export const PROVIDER_APPLICATION_ERRORS: Record<
  ProviderApplicationErrorCode,
  { messageKey: MessageKey; field?: BusinessField }
> = {
  invalid_vat: { field: 'vatNumber', messageKey: 'provider.business.error.vatInvalid' },
  vat_already_registered: { field: 'vatNumber', messageKey: 'provider.business.error.vatTaken' },
  vat_change_not_allowed: { field: 'vatNumber', messageKey: 'provider.business.error.vatLocked' },
  // The server uses one code for an invalid legal name and an invalid public name; the legal
  // name is the required one, so that is where it shows.
  invalid_business_name: { field: 'legalName', messageKey: 'provider.business.error.nameInvalid' },
  invalid_legal_form: { field: 'legalForm', messageKey: 'provider.business.error.legalFormInvalid' },
  invalid_affiliation_number: {
    field: 'affiliationNumber',
    messageKey: 'provider.business.error.affiliationInvalid',
  },
  invalid_business_city: { field: 'city', messageKey: 'provider.business.error.cityInvalid' },
  invalid_website: { field: 'website', messageKey: 'provider.business.error.websiteInvalid' },
  invalid_business_description: {
    field: 'description',
    messageKey: 'provider.business.error.descriptionInvalid',
  },
  invalid_business: { messageKey: 'provider.applyError.invalidBusiness' },
  invalid_provider_type: { messageKey: 'provider.applyError.invalidType' },
  business_account_exists: { messageKey: 'provider.applyError.accountIsBusiness' },
  business_already_approved: { messageKey: 'provider.applyError.alreadyApproved' },
  // The server has already retried once; another attempt from the user is the right move.
  concurrent_update: { messageKey: 'provider.applyError.concurrentUpdate' },
};

const CODES: ReadonlySet<string> = new Set(PROVIDER_APPLICATION_ERROR_CODES);

/** The stable code carried by a failed `applyAsProvider` call, or null for anything else. */
export function providerApplicationErrorCode(err: unknown): ProviderApplicationErrorCode | null {
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && CODES.has(message)
    ? (message as ProviderApplicationErrorCode)
    : null;
}

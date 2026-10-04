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

export type ProviderApplicationErrorReport =
  /** Shown on its company field by `showOnField`. */
  | { kind: 'field' }
  /** A coded failure, for the caller to show as its form-level message. */
  | { kind: 'message'; messageKey: MessageKey }
  /** Not a coded failure: the caller's own generic handling applies. */
  | { kind: 'unknown' };

/**
 * Where a failed `applyAsProvider` call is shown — the one rule shared by the signup form and
 * the profile card. A code about a company field goes to `showOnField` (the company form's
 * `showServerError`, passed only while a company is applying); any other code becomes its
 * form-level message; anything else is left to the caller.
 */
export function reportProviderApplicationError(
  err: unknown,
  showOnField?: (code: ProviderApplicationErrorCode) => boolean
): ProviderApplicationErrorReport {
  const code = providerApplicationErrorCode(err);
  if (!code) return { kind: 'unknown' };
  if (showOnField?.(code)) return { kind: 'field' };
  return { kind: 'message', messageKey: PROVIDER_APPLICATION_ERRORS[code].messageKey };
}

/**
 * The stable codes the admin side of business accounts throws (plan 2026-10-04, B8a):
 * `decideProviderApplication` approving a company (`review_required`, `stale_review`) and the
 * `releaseBusinessVat` / `convertBusinessToIndividual` / `updateBusinessTaxId` callables
 * (functions/src/providers/businessAdmin.ts). Tax-id and legal-field codes reuse the signup
 * form's texts, except `vat_already_registered`: an admin can do something about it.
 */
export const ADMIN_BUSINESS_ERROR_CODES = [
  'review_required',
  'stale_review',
  'claim_not_found',
  'claim_in_use',
  'not_a_business',
  'provider_not_found',
  'invalid_provider_id',
  'invalid_reason',
  'invalid_vat',
  'invalid_business_name',
  'invalid_legal_form',
  'invalid_affiliation_number',
  'vat_already_registered',
] as const;

export type AdminBusinessErrorCode = (typeof ADMIN_BUSINESS_ERROR_CODES)[number];

export const ADMIN_BUSINESS_ERRORS: Record<AdminBusinessErrorCode, MessageKey> = {
  review_required: 'admin.business.error.reviewRequired',
  stale_review: 'admin.business.error.staleReview',
  claim_not_found: 'admin.business.error.claimNotFound',
  claim_in_use: 'admin.business.error.claimInUse',
  not_a_business: 'admin.business.error.notABusiness',
  provider_not_found: 'admin.business.error.providerNotFound',
  invalid_provider_id: 'admin.business.error.invalidProviderId',
  invalid_reason: 'admin.business.error.invalidReason',
  invalid_vat: 'provider.business.error.vatInvalid',
  invalid_business_name: 'provider.business.error.nameInvalid',
  invalid_legal_form: 'provider.business.error.legalFormInvalid',
  invalid_affiliation_number: 'provider.business.error.affiliationInvalid',
  vat_already_registered: 'admin.business.error.vatTaken',
};

const ADMIN_CODES: ReadonlySet<string> = new Set(ADMIN_BUSINESS_ERROR_CODES);

/** The stable code carried by a failed admin business call, or null for anything else. */
export function adminBusinessErrorCode(err: unknown): AdminBusinessErrorCode | null {
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && ADMIN_CODES.has(message)
    ? (message as AdminBusinessErrorCode)
    : null;
}

/** Localised text for a failed admin business call, or null: the caller shows its generic error. */
export function adminBusinessErrorMessageKey(err: unknown): MessageKey | null {
  const code = adminBusinessErrorCode(err);
  return code ? ADMIN_BUSINESS_ERRORS[code] : null;
}

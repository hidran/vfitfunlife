import { describe, it, expect, vi } from 'vitest';
import {
  ADMIN_BUSINESS_ERROR_CODES,
  ADMIN_BUSINESS_ERRORS,
  PROVIDER_APPLICATION_ERROR_CODES,
  PROVIDER_APPLICATION_ERRORS,
  adminBusinessErrorCode,
  adminBusinessErrorMessageKey,
  providerApplicationErrorCode,
  reportProviderApplicationError,
} from './providerApplicationErrors';
import { EMPTY_BUSINESS_DETAILS } from './businessDetails';
import { itMessages } from '@/i18n/messages/it';
import { enMessages } from '@/i18n/messages/en';
import { esMessages } from '@/i18n/messages/es';
import { frMessages } from '@/i18n/messages/fr';
import { deMessages } from '@/i18n/messages/de';

const LOCALES = { it: itMessages, en: enMessages, es: esMessages, fr: frMessages, de: deMessages };

describe('providerApplicationErrorCode', () => {
  it('reads a stable code from a callable error message', () => {
    // What the Firebase SDK throws for HttpsError('already-exists', 'vat_already_registered').
    const err = Object.assign(new Error('vat_already_registered'), { code: 'functions/already-exists' });
    expect(providerApplicationErrorCode(err)).toBe('vat_already_registered');
  });

  it('ignores the older plain-sentence errors and anything else', () => {
    expect(providerApplicationErrorCode(new Error('Pick at least one category'))).toBeNull();
    expect(providerApplicationErrorCode(new Error('Too many categories'))).toBeNull();
    expect(providerApplicationErrorCode({ code: 'functions/permission-denied' })).toBeNull();
    expect(providerApplicationErrorCode(null)).toBeNull();
    expect(providerApplicationErrorCode(undefined)).toBeNull();
    expect(providerApplicationErrorCode('invalid_vat')).toBeNull();
  });
});

describe('reportProviderApplicationError', () => {
  it('hands a field code to the company form when one is in use', () => {
    const showOnField = vi.fn(() => true);
    expect(reportProviderApplicationError(new Error('vat_already_registered'), showOnField)).toEqual({
      kind: 'field',
    });
    expect(showOnField).toHaveBeenCalledWith('vat_already_registered');
  });

  it('turns a code the form does not take into its form-level message', () => {
    expect(reportProviderApplicationError(new Error('concurrent_update'), () => false)).toEqual({
      kind: 'message',
      messageKey: 'provider.applyError.concurrentUpdate',
    });
    // No company form (an individual): even a field code becomes a message.
    expect(reportProviderApplicationError(new Error('invalid_vat'))).toEqual({
      kind: 'message',
      messageKey: 'provider.business.error.vatInvalid',
    });
  });

  it('leaves anything that is not a code to the caller', () => {
    const showOnField = vi.fn(() => true);
    expect(reportProviderApplicationError(new Error('Pick at least one category'), showOnField)).toEqual({
      kind: 'unknown',
    });
    expect(showOnField).not.toHaveBeenCalled();
  });
});

describe('PROVIDER_APPLICATION_ERRORS', () => {
  it('covers every code the B3/B3b backend can throw', () => {
    expect([...PROVIDER_APPLICATION_ERROR_CODES].sort()).toEqual(
      [
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
      ].sort()
    );
  });

  it.each(PROVIDER_APPLICATION_ERROR_CODES)('%s has localised text in all five locales, never the raw code', (code) => {
    const { messageKey } = PROVIDER_APPLICATION_ERRORS[code];
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const text = messages[messageKey];
      expect(text, `${locale} ${messageKey}`).toBeTruthy();
      expect(text).not.toContain(code);
      expect(text).not.toBe(messageKey);
    }
  });

  it('puts tax-id failures on the tax id field and the rest on real fields', () => {
    expect(PROVIDER_APPLICATION_ERRORS.invalid_vat.field).toBe('vatNumber');
    expect(PROVIDER_APPLICATION_ERRORS.vat_already_registered.field).toBe('vatNumber');
    expect(PROVIDER_APPLICATION_ERRORS.vat_change_not_allowed.field).toBe('vatNumber');
    expect(PROVIDER_APPLICATION_ERRORS.invalid_website.field).toBe('website');
    for (const { field } of Object.values(PROVIDER_APPLICATION_ERRORS)) {
      if (field) expect(Object.keys(EMPTY_BUSINESS_DETAILS)).toContain(field);
    }
  });

  it('says "try again" for concurrent_update (the server already retried once)', () => {
    expect(enMessages[PROVIDER_APPLICATION_ERRORS.concurrent_update.messageKey]).toBe(
      'Something changed while saving, please try again.'
    );
    expect(PROVIDER_APPLICATION_ERRORS.concurrent_update.field).toBeUndefined();
  });
});

describe('admin business errors (B8: approve, release, convert, change tax id)', () => {
  it('covers every code the B8a admin callables can throw', () => {
    expect([...ADMIN_BUSINESS_ERROR_CODES].sort()).toEqual(
      [
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
        // Backend review fixes: an approval must hold the tax-id claim; protected accounts.
        'claim_missing',
        'protected_account',
      ].sort()
    );
  });

  it.each(ADMIN_BUSINESS_ERROR_CODES)('%s has localised text in all five locales, never the raw code', (code) => {
    const messageKey = ADMIN_BUSINESS_ERRORS[code];
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const text = messages[messageKey];
      expect(text, `${locale} ${messageKey}`).toBeTruthy();
      expect(text).not.toContain(code);
      expect(text).not.toBe(messageKey);
    }
  });

  it('reads the code from a callable error and maps it to its message', () => {
    const err = Object.assign(new Error('stale_review'), { code: 'functions/failed-precondition' });
    expect(adminBusinessErrorCode(err)).toBe('stale_review');
    expect(adminBusinessErrorMessageKey(err)).toBe('admin.business.error.staleReview');
    expect(enMessages[adminBusinessErrorMessageKey(err)!]).toBe(
      "The company's data changed since you opened it — review the new details and approve again."
    );
    expect(adminBusinessErrorMessageKey(new Error('claim_in_use'))).toBe('admin.business.error.claimInUse');
    // Another account holds the number: the admin, unlike an applicant, can free a rejected one.
    expect(adminBusinessErrorMessageKey(new Error('vat_already_registered'))).toBe('admin.business.error.vatTaken');
    expect(adminBusinessErrorMessageKey(new Error('claim_missing'))).toBe('admin.business.error.claimMissing');
    expect(adminBusinessErrorMessageKey(new Error('protected_account'))).toBe('admin.business.error.protectedAccount');
  });

  it('returns null for anything that is not one of its codes', () => {
    expect(adminBusinessErrorCode(new Error('Admin access required'))).toBeNull();
    expect(adminBusinessErrorCode(new Error('concurrent_update'))).toBeNull();
    expect(adminBusinessErrorCode({ code: 'functions/permission-denied' })).toBeNull();
    expect(adminBusinessErrorCode(null)).toBeNull();
    expect(adminBusinessErrorMessageKey('stale_review')).toBeNull();
  });
});

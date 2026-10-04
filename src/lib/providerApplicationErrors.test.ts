import { describe, it, expect } from 'vitest';
import {
  PROVIDER_APPLICATION_ERROR_CODES,
  PROVIDER_APPLICATION_ERRORS,
  providerApplicationErrorCode,
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

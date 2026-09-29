import { describe, it, expect } from 'vitest';
import {
  BOOKING_TYPE_LABEL_KEYS,
  PAYMENT_STATUS_LABEL_KEYS,
  bookingTypeLabel,
  paymentStatusLabel,
} from './bookingLabels';
import { itMessages } from '@/i18n/messages/it';
import { enMessages } from '@/i18n/messages/en';
import { esMessages } from '@/i18n/messages/es';
import { frMessages } from '@/i18n/messages/fr';
import { deMessages } from '@/i18n/messages/de';
import type { MessageKey } from '@/i18n/messages';

const tFor = (messages: Record<string, string>) => (key: MessageKey) => messages[key] ?? key;
const tIt = tFor(itMessages);

describe('paymentStatusLabel', () => {
  it('translates the stored value instead of printing it raw', () => {
    expect(paymentStatusLabel(tIt, 'pending')).toBe('In attesa');
    expect(paymentStatusLabel(tIt, 'paid')).toBe('Pagato');
    expect(paymentStatusLabel(tFor(enMessages), 'deposit_paid')).toBe('Deposit paid');
  });

  it('falls back to a humanized value for anything unknown', () => {
    expect(paymentStatusLabel(tIt, 'awaiting_bank')).toBe('Awaiting bank');
    expect(paymentStatusLabel(tIt, 'toString')).toBe('ToString');
    expect(paymentStatusLabel(tIt, undefined)).toBe('—');
  });
});

describe('bookingTypeLabel', () => {
  it('translates the stored value', () => {
    expect(bookingTypeLabel(tIt, 'in_venue')).toBe('In sede');
    expect(bookingTypeLabel(tIt, 'home_service')).toBe('A domicilio');
    expect(bookingTypeLabel(tFor(deMessages), 'in_venue')).toBe('Vor Ort');
  });

  it('falls back to a humanized value for anything unknown', () => {
    expect(bookingTypeLabel(tIt, 'hybrid_mode')).toBe('Hybrid mode');
    expect(bookingTypeLabel(tIt, '')).toBe('—');
  });
});

describe('label keys exist in every locale', () => {
  const keys = [...Object.values(PAYMENT_STATUS_LABEL_KEYS), ...Object.values(BOOKING_TYPE_LABEL_KEYS)];
  const locales = { it: itMessages, en: enMessages, es: esMessages, fr: frMessages, de: deMessages };
  for (const [name, messages] of Object.entries(locales)) {
    it(name, () => {
      for (const key of keys) {
        expect((messages as Record<string, string>)[key], `${name}: ${key}`).toBeTruthy();
      }
    });
  }
});

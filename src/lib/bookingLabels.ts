/**
 * Translated labels for the booking enums shown on the provider booking detail.
 *
 * The detail screen used to print the raw stored value ("pending", "in venue"), which is
 * English in every locale. Unknown values (legacy documents, a value added server-side
 * before the client ships a label) fall back to the humanized raw string rather than a
 * missing-key placeholder.
 */

import type { BookingType, PaymentStatus } from '@/types/firebase';
import type { MessageKey } from '@/i18n/messages';

type Translate = (key: MessageKey) => string;

export const PAYMENT_STATUS_LABEL_KEYS: Record<PaymentStatus, MessageKey> = {
  pending: 'booking.paymentStatus.pending',
  deposit_paid: 'booking.paymentStatus.deposit_paid',
  paid: 'booking.paymentStatus.paid',
  refunded: 'booking.paymentStatus.refunded',
  partial_refund: 'booking.paymentStatus.partial_refund',
};

export const BOOKING_TYPE_LABEL_KEYS: Record<BookingType, MessageKey> = {
  in_venue: 'booking.type.in_venue',
  home_service: 'booking.type.home_service',
  virtual: 'booking.type.virtual',
  outdoor: 'booking.type.outdoor',
};

function humanize(value: string): string {
  const text = value.replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function lookup(keys: Record<string, MessageKey>, t: Translate, value: string | null | undefined): string {
  if (!value) return '—';
  const key = Object.prototype.hasOwnProperty.call(keys, value) ? keys[value] : undefined;
  return key ? t(key) : humanize(value);
}

export function paymentStatusLabel(t: Translate, value: string | null | undefined): string {
  return lookup(PAYMENT_STATUS_LABEL_KEYS, t, value);
}

export function bookingTypeLabel(t: Translate, value: string | null | undefined): string {
  return lookup(BOOKING_TYPE_LABEL_KEYS, t, value);
}

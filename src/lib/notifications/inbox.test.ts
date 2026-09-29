import { describe, expect, it } from 'vitest';
import {
  bookingDetailHref,
  categoryForType,
  countUnread,
  inAppLink,
  isTrainerOnlyType,
  normalizeNotification,
  sortNewestFirst,
} from './inbox';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('normalizeNotification', () => {
  it('reads the shape written by functions/src/bookings/notify.ts', () => {
    const n = normalizeNotification('a', {
      title: 'Prenotazione accettata',
      body: 'Marco ha accettato',
      type: 'booking_accepted',
      data: { bookingId: 'b1' },
      imageUrl: null,
      isRead: false,
      createdAt: ts('2026-09-29T10:00:00Z'),
    });
    expect(n).toMatchObject({
      id: 'a',
      title: 'Prenotazione accettata',
      body: 'Marco ha accettato',
      type: 'booking_accepted',
      category: 'booking',
      isRead: false,
      bookingId: 'b1',
    });
    expect(n.createdAt?.toISOString()).toBe('2026-09-29T10:00:00.000Z');
  });

  it('handles legacy read / message / timestamp / top-level bookingId', () => {
    const n = normalizeNotification('b', {
      title: 'Old',
      message: 'legacy body',
      read: true,
      timestamp: '2026-02-13T09:30:00.000Z',
      bookingId: 'b2',
    });
    expect(n.isRead).toBe(true);
    expect(n.body).toBe('legacy body');
    expect(n.bookingId).toBe('b2');
    expect(n.type).toBe('system');
    expect(n.category).toBe('booking');
    expect(n.createdAt?.toISOString()).toBe('2026-02-13T09:30:00.000Z');
  });

  it('prefers isRead over read and defaults to unread', () => {
    expect(normalizeNotification('c', { isRead: false, read: true }).isRead).toBe(false);
    expect(normalizeNotification('d', {}).isRead).toBe(false);
  });

  it('accepts {seconds} timestamps and tolerates a missing createdAt', () => {
    expect(normalizeNotification('e', { createdAt: { seconds: 0 } }).createdAt?.getTime()).toBe(0);
    expect(normalizeNotification('f', {}).createdAt).toBeNull();
  });
});

describe('categoryForType', () => {
  it.each([
    ['booking_completion_reminder', 'booking'],
    ['new_booking', 'booking'],
    ['client_message', 'message'],
    ['vip', 'promo'],
    ['trainer_lead', 'system'],
    ['system', 'system'],
  ])('%s -> %s', (type, expected) => {
    expect(categoryForType(type)).toBe(expected);
  });
});

describe('sortNewestFirst / countUnread', () => {
  it('orders newest first with pending (undated) docs on top', () => {
    const items = [
      normalizeNotification('old', { createdAt: ts('2026-01-01T00:00:00Z') }),
      normalizeNotification('pending', {}),
      normalizeNotification('new', { createdAt: ts('2026-09-01T00:00:00Z'), isRead: true }),
    ];
    expect(sortNewestFirst(items).map((n) => n.id)).toEqual(['pending', 'new', 'old']);
    expect(countUnread(items)).toBe(2);
  });
});

describe('booking routing', () => {
  it('builds the static-export query-string routes', () => {
    expect(bookingDetailHref('b 1', false)).toBe('/bookings/detail?id=b%201');
    expect(bookingDetailHref('b1', true)).toBe('/provider/bookings/detail?id=b1');
  });

  it('knows the trainer-only event types', () => {
    expect(isTrainerOnlyType('booking_payment_disputed')).toBe(true);
    expect(isTrainerOnlyType('booking_completion_reminder')).toBe(true);
    expect(isTrainerOnlyType('booking_cancelled_by_client')).toBe(true);
    expect(isTrainerOnlyType('booking_new_request')).toBe(true);
    expect(isTrainerOnlyType('booking_reminder')).toBe(false);
    expect(isTrainerOnlyType('booking_accepted')).toBe(false);
    expect(isTrainerOnlyType('booking_rescheduled')).toBe(false);
  });
});

describe('inAppLink', () => {
  it('opens the same-app route of a system notification', () => {
    const n = normalizeNotification('d4', { type: 'system', data: { link: '/provider/location' } });
    expect(n.category).toBe('system');
    expect(inAppLink(n)).toBe('/provider/location');
  });

  it('refuses off-site and missing links', () => {
    expect(inAppLink({ data: { link: 'https://evil.example' } })).toBeNull();
    expect(inAppLink({ data: { link: '//evil.example' } })).toBeNull();
    expect(inAppLink({ data: { link: '/\\evil.example' } })).toBeNull();
    expect(inAppLink({ data: {} })).toBeNull();
  });
});

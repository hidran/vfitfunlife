/**
 * The per-user notification inbox: `users/{uid}/notifications`.
 *
 * Every server writer (functions/src/bookings/notify.ts, notifications/index.ts, payments,
 * scheduled, leads) stores `{ title, body, type, data, imageUrl, isRead, createdAt }` with the
 * title/body already rendered in the recipient's language. Older docs — and the provider
 * dashboard's legacy shape — used `read`, `message` or `timestamp` instead, so the reader
 * normalises all of them here rather than letting each screen guess.
 *
 * Pure: no Firebase import, so it is unit-testable and safe to share with any screen.
 */

export type InboxCategory = 'booking' | 'message' | 'promo' | 'system';

export interface InboxNotification {
  id: string;
  title: string;
  body: string;
  /** Raw server type, e.g. `booking_accepted`, `vip`, `trainer_lead`. */
  type: string;
  category: InboxCategory;
  isRead: boolean;
  createdAt: Date | null;
  bookingId: string | null;
  data: Record<string, unknown>;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value !== null) {
    const v = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof v.toDate === 'function') return v.toDate();
    const seconds = v.seconds ?? v._seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function categoryForType(type: string, hasBooking = false): InboxCategory {
  const t = type.toLowerCase();
  if (t.startsWith('booking') || t === 'new_booking' || t === 'upcoming_appointment') return 'booking';
  if (t.includes('message') || t.startsWith('chat')) return 'message';
  if (t === 'vip' || t.startsWith('promo') || t.startsWith('referral') || t.startsWith('points')) {
    return 'promo';
  }
  return hasBooking ? 'booking' : 'system';
}

/** Turns one Firestore document (any known shape) into the inbox view model. */
export function normalizeNotification(id: string, raw: Record<string, unknown>): InboxNotification {
  const data =
    raw.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : {};
  const bookingId = str(data.bookingId) || str(raw.bookingId) || null;
  const type = str(raw.type) || str(data.type) || 'system';
  const isRead =
    typeof raw.isRead === 'boolean' ? raw.isRead : typeof raw.read === 'boolean' ? raw.read : false;

  return {
    id,
    title: str(raw.title),
    body: str(raw.body) || str(raw.message),
    type,
    category: categoryForType(type, Boolean(bookingId)),
    isRead,
    createdAt: toDate(raw.createdAt) ?? toDate(raw.timestamp),
    bookingId,
    data,
  };
}

/** Newest first; undated (pending server timestamp) on top, since they were just written. */
export function sortNewestFirst(items: InboxNotification[]): InboxNotification[] {
  return [...items].sort((a, b) => {
    const at = a.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bt = b.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return bt - at;
  });
}

export function countUnread(items: readonly InboxNotification[]): number {
  return items.reduce((n, item) => n + (item.isRead ? 0 : 1), 0);
}

/**
 * Types only ever sent to the trainer of a booking. Used as a fallback when the booking
 * itself cannot be read to decide which detail page to open.
 */
const TRAINER_ONLY_TYPE_SUFFIXES = [
  'requested',
  'new_request',
  'cancelled_by_client',
  'payment_client_confirmed',
  'payment_disputed',
  'completion_reminder',
];

export function isTrainerOnlyType(type: string): boolean {
  return type === 'new_booking' || TRAINER_ONLY_TYPE_SUFFIXES.some((s) => type.endsWith(s));
}

/**
 * Static export serves detail pages as `?id=` query strings (see src/lib/routes.ts):
 * customers at /bookings/detail, trainers at /provider/bookings/detail.
 */
export function bookingDetailHref(bookingId: string, asTrainer: boolean): string {
  const base = asTrainer ? '/provider/bookings/detail' : '/bookings/detail';
  return `${base}?id=${encodeURIComponent(bookingId)}`;
}

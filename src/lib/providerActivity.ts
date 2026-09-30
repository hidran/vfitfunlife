/**
 * What the provider dashboard shows under "Recent Activity" and which greeting it uses.
 *
 * Both are derived from the provider's own bookings (already loaded by the dashboard), so no
 * extra query or backend change is needed. Every status transition is on the booking's
 * `statusHistory`; bookings written before that field existed fall back to their current status.
 */

import type { BookingStatus } from '@/types/firebase';
import type { MessageKey } from '@/i18n/messages';
import { isDelivered } from '@/lib/bookingStatus';

export type ActivityKind = 'requested' | 'confirmed' | 'declined' | 'cancelled';

export interface BookingActivity {
  id: string;
  bookingId: string;
  kind: ActivityKind;
  at: Date;
  userName: string;
  serviceName: string;
}

/** The label for each activity kind. */
export const ACTIVITY_LABEL_KEYS: Record<ActivityKind, MessageKey> = {
  requested: 'provider.dashboard.activity.requested' as MessageKey,
  confirmed: 'provider.dashboard.activity.confirmed' as MessageKey,
  declined: 'provider.dashboard.activity.declined' as MessageKey,
  cancelled: 'provider.dashboard.activity.cancelled' as MessageKey,
};

const KIND_BY_STATUS: Partial<Record<BookingStatus, ActivityKind>> = {
  requested: 'requested',
  accepted: 'confirmed',
  declined: 'declined',
  cancelled_by_client: 'cancelled',
  cancelled_by_trainer: 'cancelled',
};

type TimeLike = Date | { toDate(): Date } | null | undefined;

interface ActivityBooking {
  id: string;
  status: BookingStatus | string;
  userName?: string;
  serviceName?: string;
  statusHistory?: { status: BookingStatus | string; at: TimeLike }[] | null;
  createdAt?: TimeLike;
  updatedAt?: TimeLike;
}

function toDate(value: TimeLike): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate() : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** The latest booking events (request, confirmation, decline, cancellation), newest first. */
export function bookingActivity(bookings: ActivityBooking[], max = 5): BookingActivity[] {
  const events: BookingActivity[] = [];

  for (const booking of bookings) {
    const history =
      booking.statusHistory && booking.statusHistory.length > 0
        ? booking.statusHistory
        : [{ status: booking.status, at: booking.updatedAt ?? booking.createdAt }];

    history.forEach((entry, i) => {
      const kind = KIND_BY_STATUS[entry.status as BookingStatus];
      const at = toDate(entry.at);
      if (!kind || !at) return;
      events.push({
        id: `${booking.id}-${i}`,
        bookingId: booking.id,
        kind,
        at,
        userName: booking.userName ?? '',
        serviceName: booking.serviceName ?? '',
      });
    });
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, max);
}

/** A provider who has not delivered a session yet is greeted with "Welcome!", not "Welcome back!". */
export function isNewProvider(bookings: { status: BookingStatus | string }[]): boolean {
  return !bookings.some((b) => isDelivered(b.status as BookingStatus));
}

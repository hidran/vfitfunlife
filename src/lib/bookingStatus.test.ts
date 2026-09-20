import { describe, it, expect } from 'vitest';
import {
  BOOKED_STATUSES,
  BOOKING_STATUS_META,
  CALENDAR_STATUSES,
  DELIVERED_STATUSES,
  OUTCOME_STATUSES,
  canReschedule,
} from './bookingStatus';
import type { BookingStatus } from '@/types/firebase';

describe('canReschedule', () => {
  it('offers the move on an accepted session that has not happened yet', () => {
    expect(canReschedule('accepted', false)).toBe(true);
  });

  it('withholds it once the session is past', () => {
    expect(canReschedule('accepted', true)).toBe(false);
  });

  it('withholds it for every status the trainer has not accepted, or has closed', () => {
    for (const status of ['requested', 'declined', 'cancelled_by_client', 'completed', 'no_show'] as const) {
      expect(canReschedule(status, false)).toBe(false);
    }
  });
});

describe('the status sets the provider dashboard queries with', () => {
  const live = Object.keys(BOOKING_STATUS_META) as BookingStatus[];

  it('counts an accepted session, not just the retired "confirmed"', () => {
    // The dashboard asked Firestore for `confirmed`/`in_progress` long after the vocabulary
    // moved on, so every counter read zero with the bookings sitting right there.
    expect(BOOKED_STATUSES).toContain('accepted');
    expect(BOOKED_STATUSES).toContain('payment_confirmed');
    expect(BOOKED_STATUSES).not.toContain('requested');
  });

  it('counts a request in the week view but not as a booked session', () => {
    expect(CALENDAR_STATUSES).toContain('requested');
    expect(CALENDAR_STATUSES).toEqual(expect.arrayContaining(BOOKED_STATUSES));
  });

  it('treats a paid session as delivered, so earnings are not left out', () => {
    expect(DELIVERED_STATUSES).toEqual(['completed', 'payment_confirmed']);
  });

  it('knows both cancellation statuses, which replaced the actorless "cancelled"', () => {
    expect(OUTCOME_STATUSES).toContain('cancelled_by_client');
    expect(OUTCOME_STATUSES).toContain('cancelled_by_trainer');
    expect(OUTCOME_STATUSES).toContain('no_show');
  });

  it('never queries for a status the app cannot render', () => {
    const legacy = ['pending', 'confirmed', 'in_progress', 'cancelled'];
    for (const set of [BOOKED_STATUSES, CALENDAR_STATUSES, DELIVERED_STATUSES, OUTCOME_STATUSES]) {
      for (const status of set) {
        expect(live.includes(status as BookingStatus) || legacy.includes(status)).toBe(true);
      }
    }
  });

  it('stays inside Firestore\'s limit for an `in` filter', () => {
    for (const set of [BOOKED_STATUSES, CALENDAR_STATUSES, DELIVERED_STATUSES, OUTCOME_STATUSES]) {
      expect(set.length).toBeLessThanOrEqual(30);
    }
  });
});

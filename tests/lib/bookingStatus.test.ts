import { describe, it, expect } from 'vitest';
import {
  BOOKING_STATUS_META,
  TERMINAL_STATUSES,
  isTerminal,
  isCancelled,
  isDelivered,
  isActive,
  canClientCancel,
  canReschedule,
  canReview,
  wouldBeLateCancellation,
} from '@/lib/bookingStatus';
import type { BookingStatus } from '@/types/firebase';

const ALL: BookingStatus[] = [
  'requested', 'accepted', 'declined', 'cancelled_by_client',
  'cancelled_by_trainer', 'completed', 'no_show', 'payment_confirmed',
];

describe('BOOKING_STATUS_META', () => {
  it('covers every status — a missing entry renders a blank badge', () => {
    for (const s of ALL) {
      expect(BOOKING_STATUS_META[s], `missing meta for ${s}`).toBeDefined();
      expect(BOOKING_STATUS_META[s].labelKey).toMatch(/^booking\.status\./);
    }
  });

  it('has no extra keys beyond the enum', () => {
    expect(Object.keys(BOOKING_STATUS_META).sort()).toEqual([...ALL].sort());
  });
});

describe('terminal states', () => {
  it('treats exactly the five end states as terminal', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(
      ['cancelled_by_client', 'cancelled_by_trainer', 'declined', 'no_show', 'payment_confirmed'].sort(),
    );
  });

  it('does not treat in-flight states as terminal', () => {
    expect(isTerminal('requested')).toBe(false);
    expect(isTerminal('accepted')).toBe(false);
    expect(isTerminal('completed')).toBe(false);
  });
});

describe('isCancelled', () => {
  it('covers both cancellation states, not just the client one', () => {
    expect(isCancelled('cancelled_by_client')).toBe(true);
    expect(isCancelled('cancelled_by_trainer')).toBe(true);
  });

  it('does not count a decline or a no-show as a cancellation', () => {
    expect(isCancelled('declined')).toBe(false);
    expect(isCancelled('no_show')).toBe(false);
  });
});

describe('isDelivered', () => {
  it('counts a session that happened, paid or not', () => {
    expect(isDelivered('completed')).toBe(true);
    expect(isDelivered('payment_confirmed')).toBe(true);
  });

  it('does not count a no-show as delivered', () => {
    expect(isDelivered('no_show')).toBe(false);
  });
});

describe('client cancellation', () => {
  it('is allowed while requested or accepted, and never after', () => {
    expect(canClientCancel('requested')).toBe(true);
    expect(canClientCancel('accepted')).toBe(true);
    for (const s of ['completed', 'payment_confirmed', 'declined', 'no_show'] as BookingStatus[]) {
      expect(canClientCancel(s), `should not cancel from ${s}`).toBe(false);
    }
  });

  it('mirrors isActive', () => {
    for (const s of ALL) expect(canClientCancel(s)).toBe(isActive(s));
  });
});

describe('reschedule and review gating', () => {
  it('allows rescheduling only an accepted, future booking', () => {
    expect(canReschedule('accepted', false)).toBe(true);
    expect(canReschedule('accepted', true)).toBe(false);
    expect(canReschedule('requested', false)).toBe(false);
  });

  it('allows a review only once the session was delivered and not already reviewed', () => {
    expect(canReview('completed', false)).toBe(true);
    expect(canReview('payment_confirmed', false)).toBe(true);
    expect(canReview('completed', true)).toBe(false);
    expect(canReview('no_show', false)).toBe(false);
  });
});

describe('wouldBeLateCancellation', () => {
  const slot = new Date('2026-08-10T10:00:00Z');

  it('flags inside the 24h window', () => {
    expect(wouldBeLateCancellation(slot, new Date('2026-08-09T10:00:01Z'))).toBe(true);
    expect(wouldBeLateCancellation(slot, new Date('2026-08-10T09:59:00Z'))).toBe(true);
  });

  it('does not flag outside it', () => {
    expect(wouldBeLateCancellation(slot, new Date('2026-08-09T09:59:59Z'))).toBe(false);
  });

  it('treats exactly 24h as not late', () => {
    expect(wouldBeLateCancellation(slot, new Date('2026-08-09T10:00:00Z'))).toBe(false);
  });

  it('flags a slot already in the past', () => {
    expect(wouldBeLateCancellation(slot, new Date('2026-08-11T00:00:00Z'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { bookingActivity, isNewProvider } from './providerActivity';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('bookingActivity', () => {
  it('lists request and confirmation from statusHistory, newest first', () => {
    const events = bookingActivity([
      {
        id: 'b1',
        status: 'accepted',
        userName: 'Elena Gallo',
        serviceName: 'Personal training',
        statusHistory: [
          { status: 'requested', at: ts('2026-10-01T09:00:00Z') },
          { status: 'accepted', at: ts('2026-10-01T10:00:00Z') },
        ],
      },
    ]);
    expect(events.map((e) => e.kind)).toEqual(['confirmed', 'requested']);
    expect(events[0]).toMatchObject({ bookingId: 'b1', userName: 'Elena Gallo', serviceName: 'Personal training' });
  });

  it('merges bookings, skips other statuses and caps the list', () => {
    const events = bookingActivity(
      [
        {
          id: 'a',
          status: 'completed',
          statusHistory: [
            { status: 'requested', at: ts('2026-09-01T09:00:00Z') },
            { status: 'accepted', at: ts('2026-09-02T09:00:00Z') },
            { status: 'completed', at: ts('2026-09-10T09:00:00Z') },
          ],
        },
        {
          id: 'b',
          status: 'cancelled_by_client',
          statusHistory: [
            { status: 'requested', at: ts('2026-09-05T09:00:00Z') },
            { status: 'cancelled_by_client', at: ts('2026-09-06T09:00:00Z') },
          ],
        },
      ],
      3,
    );
    expect(events.map((e) => `${e.bookingId}:${e.kind}`)).toEqual(['b:cancelled', 'b:requested', 'a:confirmed']);
  });

  it('falls back to the current status for bookings without history', () => {
    const events = bookingActivity([
      { id: 'old', status: 'declined', updatedAt: new Date('2026-08-01T00:00:00Z'), statusHistory: undefined },
      { id: 'nodate', status: 'requested' },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ bookingId: 'old', kind: 'declined' });
  });
});

describe('isNewProvider', () => {
  it('is true until a session has been delivered', () => {
    expect(isNewProvider([])).toBe(true);
    expect(isNewProvider([{ status: 'requested' }, { status: 'accepted' }])).toBe(true);
    expect(isNewProvider([{ status: 'completed' }])).toBe(false);
    expect(isNewProvider([{ status: 'payment_confirmed' }])).toBe(false);
  });
});

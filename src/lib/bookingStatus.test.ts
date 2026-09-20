import { describe, it, expect } from 'vitest';
import { canReschedule } from './bookingStatus';

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

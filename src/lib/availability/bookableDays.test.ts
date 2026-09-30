import { describe, it, expect, vi } from 'vitest';
import { dayAvailability, daysToCheck, findBookableDays } from './bookableDays';
import { localDateKey } from './dates';

describe('daysToCheck', () => {
  it('lists the rest of the current month from today', () => {
    const days = daysToCheck(new Date(2026, 9, 1), new Date(2026, 9, 28, 15, 30));
    expect(days.map(localDateKey)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
  });

  it('lists a whole future month and nothing for a past one', () => {
    const now = new Date(2026, 9, 1, 10);
    expect(daysToCheck(new Date(2026, 10, 15), now)).toHaveLength(30);
    expect(daysToCheck(new Date(2026, 8, 1), now)).toEqual([]);
  });

  it('stops at maxDate', () => {
    const days = daysToCheck(new Date(2026, 9, 1), new Date(2026, 9, 1), new Date(2026, 9, 3));
    expect(days.map(localDateKey)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });
});

describe('findBookableDays', () => {
  // Mon–Fri hours, today (Thu 1 Oct) inside the minimum notice, Fri 2 Oct fully booked.
  const slotCounts: Record<string, number> = {
    '2026-10-01': 0,
    '2026-10-02': 0,
    '2026-10-03': 0, // Sat
    '2026-10-04': 0, // Sun
    '2026-10-05': 14,
    '2026-10-06': 3,
  };
  const days = Object.keys(slotCounts).map((k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  });

  it('marks a day bookable exactly when the slot question returns at least one time', async () => {
    const result = await findBookableDays(days, async (day) => slotCounts[localDateKey(day)]);
    expect(result).toEqual({
      '2026-10-01': false,
      '2026-10-02': false,
      '2026-10-03': false,
      '2026-10-04': false,
      '2026-10-05': true,
      '2026-10-06': true,
    });
  });

  it('leaves a day whose question failed unknown instead of unavailable', async () => {
    const result = await findBookableDays(days, async (day) => {
      if (localDateKey(day) === '2026-10-05') throw new Error('network');
      return slotCounts[localDateKey(day)];
    });
    expect(result['2026-10-05']).toBeUndefined();
    expect(dayAvailability(result, days[4])).toBe('unknown');
    expect(dayAvailability(result, days[5])).toBe('bookable');
    expect(dayAvailability(result, days[2])).toBe('unavailable');
  });

  it('never runs more than `concurrency` questions at once and asks each day once', async () => {
    let inFlight = 0;
    let peak = 0;
    const ask = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return 1;
    });
    await findBookableDays(days, ask, 2);
    expect(peak).toBe(2);
    expect(ask).toHaveBeenCalledTimes(days.length);
  });

  it('treats no answers yet as unknown', () => {
    expect(dayAvailability(undefined, days[0])).toBe('unknown');
  });
});

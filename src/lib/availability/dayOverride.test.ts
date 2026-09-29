import { describe, it, expect } from 'vitest';
import {
  blockedIntervals,
  blockRangeOverride,
  dayOffOverride,
  overlappingActive,
  regularWindowsFor,
  singleOverrideUpdate,
  subtractRange,
} from './dayOverride';
import type { WeeklyWindow } from './adapter';

// 2026-10-05 is a Monday, 2026-10-06 a Tuesday.
const MON = '2026-10-05';
const schedule: WeeklyWindow[] = [
  { dayOfWeek: 1, startTime: '14:00', endTime: '18:00', isAvailable: true },
  { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', isAvailable: true },
  { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isAvailable: false },
];

describe('regularWindowsFor', () => {
  it("returns the weekday's open windows, sorted", () => {
    expect(regularWindowsFor(schedule, MON)).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
    ]);
    expect(regularWindowsFor(schedule, '2026-10-06')).toEqual([]);
  });
});

describe('subtractRange', () => {
  const day = [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }];

  it('splits a window the range falls inside', () => {
    expect(subtractRange(day, '10:00', '11:00')).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '11:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
    ]);
  });

  it('trims across windows and drops the ones fully covered', () => {
    expect(subtractRange(day, '11:00', '15:00')).toEqual([
      { start: '09:00', end: '11:00' },
      { start: '15:00', end: '18:00' },
    ]);
    expect(subtractRange(day, '08:00', '19:00')).toEqual([]);
  });

  it('leaves windows the range only touches', () => {
    expect(subtractRange(day, '12:00', '14:00')).toEqual(day);
  });
});

describe('dayOffOverride', () => {
  it('closes the day and keeps an existing reason', () => {
    expect(dayOffOverride(MON, null)).toEqual({ date: MON, isAvailable: false, windows: [] });
    expect(dayOffOverride(MON, { date: MON, isAvailable: true, windows: [{ start: '09:00', end: '10:00' }], reason: 'Gara' }))
      .toEqual({ date: MON, isAvailable: false, windows: [], reason: 'Gara' });
  });
});

describe('blockRangeOverride', () => {
  it("starts from the weekday's hours when the date has no exception", () => {
    expect(blockRangeOverride({ schedule, existing: null, date: MON, from: '10:00', to: '11:00' })).toEqual({
      ok: true,
      override: {
        date: MON,
        isAvailable: true,
        windows: [
          { start: '09:00', end: '10:00' },
          { start: '11:00', end: '12:00' },
          { start: '14:00', end: '18:00' },
        ],
      },
    });
  });

  it('merges with the exception already stored, so a second block adds to the first', () => {
    const existing = {
      date: MON,
      isAvailable: true,
      windows: [{ start: '09:00', end: '10:00' }, { start: '11:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
      reason: 'Dentista',
    };
    const result = blockRangeOverride({ schedule, existing, date: MON, from: '16:00', to: '18:00' });
    expect(result).toEqual({
      ok: true,
      override: {
        date: MON,
        isAvailable: true,
        windows: [{ start: '09:00', end: '10:00' }, { start: '11:00', end: '12:00' }, { start: '14:00', end: '16:00' }],
        reason: 'Dentista',
      },
    });
  });

  it('closes the day when nothing bookable is left', () => {
    expect(blockRangeOverride({ schedule, existing: null, date: MON, from: '08:00', to: '19:00' }))
      .toEqual({ ok: true, override: { date: MON, isAvailable: false, windows: [] } });
  });

  it('refuses an empty range, a day already off, and a range with nothing to block', () => {
    expect(blockRangeOverride({ schedule, existing: null, date: MON, from: '11:00', to: '11:00' }))
      .toEqual({ ok: false, reason: 'invalidRange' });
    expect(blockRangeOverride({
      schedule, existing: { date: MON, isAvailable: false, windows: [] }, date: MON, from: '10:00', to: '11:00',
    })).toEqual({ ok: false, reason: 'dayOff' });
    expect(blockRangeOverride({ schedule, existing: null, date: MON, from: '12:00', to: '14:00' }))
      .toEqual({ ok: false, reason: 'nothingToBlock' });
    expect(blockRangeOverride({ schedule, existing: null, date: '2026-10-06', from: '10:00', to: '11:00' }))
      .toEqual({ ok: false, reason: 'nothingToBlock' });
  });

  it('refuses more windows than the server accepts', () => {
    const windows = Array.from({ length: 10 }, (_, i) => ({
      start: `${String(8 + i).padStart(2, '0')}:00`,
      end: `${String(8 + i).padStart(2, '0')}:45`,
    }));
    const existing = { date: MON, isAvailable: true, windows: [...windows.slice(0, 9), { start: '17:00', end: '19:00' }] };
    expect(blockRangeOverride({ schedule, existing, date: MON, from: '17:30', to: '18:00' }))
      .toEqual({ ok: false, reason: 'tooManyWindows' });
  });
});

describe('singleOverrideUpdate', () => {
  it('sends the stored hours and rules unchanged and only this date', () => {
    const override = { date: MON, isAvailable: false, windows: [] };
    const update = singleOverrideUpdate(
      {
        schedule,
        bookingRules: { bufferMinutes: 0, minAdvanceNoticeHours: 2 },
        overrides: [{ date: '2026-10-10', isAvailable: false, windows: [] }],
      },
      override,
    );
    expect(update).toEqual({
      schedule,
      bookingRules: { bufferMinutes: 0, minAdvanceNoticeHours: 2, maxBookingsPerDay: 8 },
      overrides: { upsert: [override], delete: [] },
    });
  });

  it('sends an empty schedule when none was ever saved', () => {
    const update = singleOverrideUpdate({ schedule: null, bookingRules: null, overrides: [] }, dayOffOverride(MON, null));
    expect(update.schedule).toEqual([]);
  });
});

describe('blockedIntervals', () => {
  it('shows a closed day as one day off', () => {
    expect(blockedIntervals(schedule, { date: MON, isAvailable: false, windows: [] })).toEqual([{ kind: 'dayOff' }]);
  });

  it('shows the regular hours the exception takes away', () => {
    expect(blockedIntervals(schedule, {
      date: MON,
      isAvailable: true,
      windows: [{ start: '09:00', end: '10:00' }, { start: '11:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    })).toEqual([{ kind: 'range', start: '10:00', end: '11:00' }]);
  });

  it('shows nothing for an exception that only adds hours', () => {
    expect(blockedIntervals(schedule, {
      date: MON,
      isAvailable: true,
      windows: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '20:00' }],
    })).toEqual([]);
  });
});

describe('overlappingActive', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m);
  const events = [
    { type: 'booking', status: 'accepted', start: at(10), end: at(11) },
    { type: 'booking', status: 'requested', start: at(15), end: at(16) },
    { type: 'booking', status: 'cancelled_by_client', start: at(10), end: at(11) },
    { type: 'blocked', start: at(12), end: at(13) },
  ];

  it('counts slot-holding bookings on the day', () => {
    expect(overlappingActive(events, MON)).toHaveLength(2);
    expect(overlappingActive(events, '2026-10-06')).toHaveLength(0);
  });

  it('counts only the ones overlapping the range', () => {
    expect(overlappingActive(events, MON, '10:30', '12:00')).toHaveLength(1);
    expect(overlappingActive(events, MON, '11:00', '15:00')).toHaveLength(0);
  });
});

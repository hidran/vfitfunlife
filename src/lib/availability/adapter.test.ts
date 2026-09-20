import { describe, it, expect } from 'vitest';
import {
  dashboardBannerKind,
  hasBookableHours,
  overrideFromDoc,
  savedOverrides,
  scheduleFromDoc,
  toSettings,
  toUpdate,
  type OverrideDoc,
  type WeeklyWindow,
} from './adapter';

const mon = (startTime: string, endTime: string, isAvailable = true): WeeklyWindow =>
  ({ dayOfWeek: 1, startTime, endTime, isAvailable });
const RULES = { bufferMinutes: 0, minAdvanceNoticeHours: 2, maxBookingsPerDay: 5 };
const XMAS: OverrideDoc = { date: '2026-12-25', isAvailable: false, windows: [], reason: 'Natale' };

describe('toSettings (stored → editor)', () => {
  it('maps the flat array onto the weekday map, windows sorted, 0 = Sunday', () => {
    const { settings } = toSettings({
      schedule: [mon('14:00', '18:00'), mon('09:00', '12:00'), { dayOfWeek: 0, startTime: '10:00', endTime: '12:00', isAvailable: true }],
      bookingRules: RULES,
      overrides: [],
    });
    expect(settings.weeklySchedule.monday).toEqual({
      isAvailable: true,
      slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    });
    expect(settings.weeklySchedule.sunday.isAvailable).toBe(true);
    expect(settings.weeklySchedule.tuesday).toEqual({ isAvailable: false, slots: [] });
    expect(settings).toMatchObject({ ...RULES, timezone: 'Europe/Rome' });
  });

  it('keeps a switched-off day off, with its windows', () => {
    const { settings } = toSettings({ schedule: [mon('09:00', '12:00', false)], bookingRules: null, overrides: [] });
    expect(settings.weeklySchedule.monday).toEqual({ isAvailable: false, slots: [{ start: '09:00', end: '12:00' }] });
  });

  it('shows a missing or empty schedule as every day off — the page shows exactly what is saved, with no unsaved pre-filled proposal', () => {
    const missing = toSettings({ schedule: null, bookingRules: null, overrides: [] }).settings;
    const empty = toSettings({ schedule: [], bookingRules: null, overrides: [] }).settings;
    for (const settings of [missing, empty]) {
      expect(settings.weeklySchedule.monday).toEqual({ isAvailable: false, slots: [] });
      expect(settings.weeklySchedule.friday).toEqual({ isAvailable: false, slots: [] });
      expect(settings).toMatchObject({ bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 });
    }
  });

  it('falls back to the default for a stored rule that is out of range, instead of permanently blocking the next save', () => {
    const { settings } = toSettings({
      schedule: [],
      bookingRules: { bufferMinutes: 999, minAdvanceNoticeHours: -5, maxBookingsPerDay: 0 },
      overrides: [],
    });
    expect(settings).toMatchObject({ bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 });
  });

  it('keeps a stored rule that is a valid boundary value (0 buffer is legitimate, not "missing")', () => {
    const { settings } = toSettings({
      schedule: [],
      bookingRules: { bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 1 },
      overrides: [],
    });
    expect(settings).toMatchObject({ bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 1 });
  });

  it('lists date exceptions in date order with stable ids', () => {
    const custom: OverrideDoc = { date: '2026-12-24', isAvailable: true, windows: [{ start: '09:00', end: '12:00' }] };
    const { settings } = toSettings({ schedule: [], bookingRules: null, overrides: [XMAS, custom] });
    expect(settings.dateOverrides).toEqual([
      { id: 'override-2026-12-24', date: '2026-12-24', isAvailable: true, slots: [{ start: '09:00', end: '12:00' }], reason: '' },
      { id: 'override-2026-12-25', date: '2026-12-25', isAvailable: false, slots: [], reason: 'Natale' },
    ]);
  });
});

describe('toUpdate (editor → updateMyAvailability)', () => {
  it('round-trips a schedule', () => {
    const schedule = [mon('09:00', '12:00'), mon('14:00', '18:00'), { dayOfWeek: 6, startTime: '10:00', endTime: '12:00', isAvailable: false }];
    const { settings } = toSettings({ schedule, bookingRules: RULES, overrides: [XMAS] });
    const update = toUpdate(settings, [XMAS]);
    expect(update.schedule).toEqual(schedule);
    expect(update.bookingRules).toEqual(RULES);
  });

  it('sends only new or changed exceptions and deletes removed ones', () => {
    const { settings } = toSettings({ schedule: [], bookingRules: null, overrides: [XMAS] });
    settings.dateOverrides.push({ id: 'x', date: '2027-01-01', isAvailable: false, slots: [], reason: ' ' });
    expect(toUpdate(settings, [XMAS]).overrides).toEqual({
      upsert: [{ date: '2027-01-01', isAvailable: false, windows: [] }],
      delete: [],
    });

    settings.dateOverrides = settings.dateOverrides.filter((o) => o.date !== '2026-12-25');
    expect(toUpdate(settings, [XMAS]).overrides.delete).toEqual(['2026-12-25']);

    settings.dateOverrides[0] = { ...settings.dateOverrides[0], isAvailable: true, slots: [{ start: '10:00', end: '11:00' }] };
    expect(toUpdate(settings, [XMAS]).overrides.upsert).toEqual([
      { date: '2027-01-01', isAvailable: true, windows: [{ start: '10:00', end: '11:00' }] },
    ]);
  });

  it('drops the windows of a closed exception', () => {
    const { settings } = toSettings({ schedule: [], bookingRules: null, overrides: [] });
    settings.dateOverrides.push({ id: 'x', date: '2027-01-02', isAvailable: false, slots: [{ start: '09:00', end: '10:00' }] });
    expect(toUpdate(settings, []).overrides.upsert[0].windows).toEqual([]);
    expect(savedOverrides(settings)).toEqual([{ date: '2027-01-02', isAvailable: false, windows: [] }]);
  });
});

describe('doc readers', () => {
  it('tells "never saved" from "saved empty"', () => {
    expect(scheduleFromDoc({})).toBeNull();
    expect(scheduleFromDoc(undefined)).toBeNull();
    expect(scheduleFromDoc({ availabilitySchedule: [] })).toEqual([]);
    expect(scheduleFromDoc({ availabilitySchedule: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }, { bad: 1 }] }))
      .toEqual([mon('09:00', '12:00')]);
  });

  it('reads an override doc and ignores foreign shapes', () => {
    expect(overrideFromDoc('2026-12-25', { isAvailable: false, windows: [], reason: 'Natale', updatedAt: 1 })).toEqual(XMAS);
    expect(overrideFromDoc('2026-12-25', { slots: [] })).toBeNull();
  });
});

describe('hasBookableHours', () => {
  it('needs at least one available window', () => {
    expect(hasBookableHours(null)).toBe(false);
    expect(hasBookableHours([])).toBe(false);
    expect(hasBookableHours([mon('09:00', '12:00', false)])).toBe(false);
    expect(hasBookableHours([mon('09:00', '12:00')])).toBe(true);
  });
});

describe('dashboardBannerKind', () => {
  it('tells the provider to review the default hours before they have ever saved', () => {
    expect(dashboardBannerKind({ reviewed: false, schedule: [mon('09:00', '17:00')] })).toBe('review');
  });

  it('warns when every day is switched off, even if never reviewed', () => {
    expect(dashboardBannerKind({ reviewed: false, schedule: [] })).toBe('allOff');
    expect(dashboardBannerKind({ reviewed: true, schedule: [] })).toBe('allOff');
    expect(dashboardBannerKind({ reviewed: true, schedule: null })).toBe('allOff');
  });

  it('shows nothing once the provider has reviewed real hours', () => {
    expect(dashboardBannerKind({ reviewed: true, schedule: [mon('09:00', '17:00')] })).toBeNull();
  });
});

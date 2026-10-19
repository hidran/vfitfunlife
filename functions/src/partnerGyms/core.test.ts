import { describe, expect, it } from 'vitest';
import { occurrenceDates, occurrences, quote, scheduleSchema, seriesId } from './core';

const base = { venueId: 'gym', locationId: 'main', roomId: 'studio', instructorId: 'coach',
  title: 'Pilates', description: '', startDate: '2026-10-12', startTime: '18:00', endTime: '19:00',
  recurrence: 'none', weekdays: [], capacity: 30, regularPriceCents: 0,
  cancellationHours: 24, status: 'published', requestId: 'one' };

describe('partner gym schedule and benefits', () => {
  it('creates a concrete free session with UTC instants for a Rome location', () => {
    const [session] = occurrences(scheduleSchema.parse(base), 'Europe/Rome');
    expect(session.day).toBe('2026-10-12');
    expect(session.startsAt.toISOString()).toBe('2026-10-12T16:00:00.000Z');
    expect(session.endsAt.toISOString()).toBe('2026-10-12T17:00:00.000Z');
  });

  it('generates selected weekdays within eight weeks and is deterministic', () => {
    const input = scheduleSchema.parse({ ...base, recurrence: 'weekly', weekdays: [1, 3],
      endDate: '2026-10-25' });
    expect(occurrenceDates(input)).toEqual(['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21']);
    expect(seriesId('staff', 'retry')).toBe(seriesId('staff', 'retry'));
    expect(occurrenceDates(scheduleSchema.parse({ ...base, recurrence: 'weekly', weekdays: [1],
      endDate: '2026-12-06' }))).toHaveLength(8);
    expect(() => occurrences(scheduleSchema.parse({ ...base, recurrence: 'weekly', weekdays: [1],
      endDate: '2026-12-14' }), 'Europe/Rome')).toThrow('invalid_weekly_pattern');
  });

  it('rejects reversed times and nonexistent or ambiguous local wall times', () => {
    expect(() => occurrences(scheduleSchema.parse({ ...base, endTime: '17:00' }), 'Europe/Rome'))
      .toThrow('invalid_time_range');
    expect(() => occurrences(scheduleSchema.parse({ ...base, startDate: '2026-03-29',
      startTime: '02:30', endTime: '03:30' }), 'Europe/Rome')).toThrow('invalid_local_time');
    expect(() => occurrences(scheduleSchema.parse({ ...base, startDate: '2026-10-25',
      startTime: '02:30', endTime: '03:30' }), 'Europe/Rome')).toThrow('ambiguous_local_time');
  });

  it('caps the combined partner benefit and keeps a price snapshot in cents', () => {
    expect(quote(1500, 10, 5)).toEqual({ regularPriceCents: 1500, discountCents: 225,
      finalPriceCents: 1275, gymPercent: 10, instructorPercent: 5, currency: 'EUR' });
    expect(quote(1500, 90, 30).finalPriceCents).toBe(0);
    expect(() => quote(1500, -1, 0)).toThrow('invalid_partner_benefit');
  });
});

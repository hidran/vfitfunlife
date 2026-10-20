import { describe, it, expect } from 'vitest';
import { COURSE_ERROR_CODES, courseErrorMessage } from './courseErrors';
import { itMessages } from '@/i18n/messages/it';
import { enMessages } from '@/i18n/messages/en';

const t = (key: string, values?: Record<string, string | number>) =>
  Object.entries(values ?? {}).reduce((text, [k, v]) => text.replace(`{{${k}}}`, String(v)),
    (enMessages as Record<string, string>)[key] ?? key);
const callableError = (message: string, details?: unknown) => Object.assign(new Error(message), { code: 'functions/failed-precondition', details });

describe('course error catalog', () => {
  it('maps every registry code to a key present in the source locale', () => {
    for (const code of COURSE_ERROR_CODES) {
      expect(itMessages, code).toHaveProperty(`courses.err.${code}`);
    }
  });
  it('covers the codes the registry and the business stack can return to a course screen', () => {
    for (const code of ['price_changed', 'expected_price_required', 'lesson_full', 'venue_not_active', 'room_overlap',
      'instructor_overlap', 'locked_schedule_too_long', 'course_instructor_not_allowed', 'checkout_amount_too_low',
      'rate_limited', 'waitlist_disabled', 'waitlist_full', 'waitlist_not_open', 'already_waitlisted',
      'venue_authorization_required', 'venue_owner_required', 'invalid_space', 'invalid_instructor',
      'course_owner_required', 'capacity_below_bookings', 'booked_schedule_locked']) {
      expect(COURSE_ERROR_CODES, code).toContain(code);
    }
  });
  it('has the price_changed reason variants in the source locale', () => {
    expect(itMessages).toHaveProperty('courses.err.price_changed_price');
    expect(itMessages).toHaveProperty('courses.err.price_changed_availability');
  });
  it('names the conflicting course and time for room and instructor overlaps', () => {
    const details = { courseName: 'Yoga Flow', startsAt: '2099-10-26T17:00:00.000Z', endsAt: '2099-10-26T18:00:00.000Z' };
    const room = courseErrorMessage(callableError('room_overlap', details), t, 'en');
    expect(room).toContain('Yoga Flow');
    expect(room).not.toContain('{{');
    expect(courseErrorMessage(callableError('instructor_overlap', details), t, 'en')).toContain('Yoga Flow');
    expect(courseErrorMessage(callableError('instructor_overlap', details), t, 'en'))
      .not.toBe(courseErrorMessage(callableError('room_overlap', details), t, 'en'));
  });
  it('still renders an overlap when the server sent no details', () => {
    expect(courseErrorMessage(callableError('room_overlap'), t, 'en')).not.toContain('{{');
  });
  it('gives the two price_changed reasons distinct messages', () => {
    const price = courseErrorMessage(callableError('price_changed', { reason: 'price' }), t, 'en');
    const availability = courseErrorMessage(callableError('price_changed', { reason: 'availability' }), t, 'en');
    expect(price).not.toBe(availability);
    expect(price).not.toBe('courses.error');
    expect(courseErrorMessage(callableError('price_changed'), t, 'en')).toBe(enMessages['courses.err.price_changed']);
  });
  it('interpolates the Stripe minimum into checkout_amount_too_low', () => {
    const text = courseErrorMessage(callableError('checkout_amount_too_low', { minCents: 50 }), t, 'en');
    expect(text).toMatch(/0\.50/);
  });
  it('maps the payments-disabled sentence by its exact text', () => {
    expect(courseErrorMessage(callableError('Online course payments are not enabled'), t, 'en'))
      .toBe(enMessages['courses.err.online_payments_disabled']);
  });
  it('accepts the lesson_full waitlist hint', () => {
    expect(courseErrorMessage(callableError('lesson_full', { waitlistAvailable: true }), t, 'en'))
      .toBe(enMessages['courses.err.lesson_full']);
  });
  it('falls back to courses.error for unknown or non-error values', () => {
    expect(courseErrorMessage(callableError('something_new'), t, 'en')).toBe(enMessages['courses.error']);
    expect(courseErrorMessage('boom', t, 'en')).toBe(enMessages['courses.error']);
    expect(courseErrorMessage(undefined, t, 'en')).toBe(enMessages['courses.error']);
  });
});

import { describe, it, expect } from 'vitest';
import { availabilitySaveErrorKey, dayOfWeekFromError, isSlotUnavailableError } from './errors';

const callableError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('availabilitySaveErrorKey', () => {
  it('explains a rejected schedule, a missing profile, and anything else', () => {
    expect(availabilitySaveErrorKey(callableError('functions/invalid-argument', 'day 1: windows overlap')))
      .toBe('provider.availability.error.invalid');
    expect(availabilitySaveErrorKey(callableError('functions/failed-precondition', 'no_instructor_profile')))
      .toBe('provider.availability.error.noProfile');
    expect(availabilitySaveErrorKey(new Error('offline'))).toBe('provider.availability.error.save');
  });
});

describe('dayOfWeekFromError', () => {
  it('reads the day out of validate.ts\'s day-specific messages', () => {
    expect(dayOfWeekFromError(callableError('functions/invalid-argument', 'day 3: windows overlap'))).toBe(3);
    expect(dayOfWeekFromError(callableError('functions/invalid-argument', 'day 0: at most 10 windows'))).toBe(0);
  });

  it('is null for a message with no day, or any other failure', () => {
    expect(dayOfWeekFromError(callableError('functions/invalid-argument', 'schedule[2]: start must be before end')))
      .toBeNull();
    expect(dayOfWeekFromError(callableError('functions/failed-precondition', 'no_instructor_profile'))).toBeNull();
    expect(dayOfWeekFromError(null)).toBeNull();
  });
});

describe('isSlotUnavailableError', () => {
  it('recognises createBooking refusing a taken or outside-hours start', () => {
    expect(isSlotUnavailableError(callableError('functions/failed-precondition', 'slot_unavailable'))).toBe(true);
  });

  it('ignores every other failure', () => {
    expect(isSlotUnavailableError(callableError('functions/failed-precondition', 'something else'))).toBe(false);
    expect(isSlotUnavailableError(callableError('functions/internal', 'slot_unavailable'))).toBe(false);
    expect(isSlotUnavailableError(null)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { availabilitySaveErrorKey } from './errors';

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

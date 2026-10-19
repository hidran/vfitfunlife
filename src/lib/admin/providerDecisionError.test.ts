import { describe, it, expect } from 'vitest';
import { providerDecisionErrorKey } from './providerDecisionError';

describe('providerDecisionErrorKey', () => {
  it('maps venue_exists, whatever wraps it', () => {
    expect(providerDecisionErrorKey({ code: 'functions/already-exists', message: 'venue_exists' }))
      .toBe('admin.providerDecision.error.venueExists');
    expect(providerDecisionErrorKey(Object.assign(new Error('venue_exists'), { code: 'functions/already-exists' })))
      .toBe('admin.providerDecision.error.venueExists');
  });

  it('returns null for anything else so the caller keeps its generic message', () => {
    expect(providerDecisionErrorKey(new Error('Admin required'))).toBeNull();
    expect(providerDecisionErrorKey({ message: 'venue_exists_not' })).toBeNull();
    expect(providerDecisionErrorKey(null)).toBeNull();
    expect(providerDecisionErrorKey(undefined)).toBeNull();
    expect(providerDecisionErrorKey('venue_exists')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { providerCardState, canAccessProviderArea, applicationOutcomeStatus } from './providerStatus';

describe('applicationOutcomeStatus', () => {
  it('maps autoApproved to the approved or the pending state', () => {
    expect(applicationOutcomeStatus({ autoApproved: true })).toBe('verified');
    expect(applicationOutcomeStatus({ autoApproved: false })).toBe('pending');
  });

  it('is undefined when the answer does not say', () => {
    expect(applicationOutcomeStatus({})).toBeUndefined();
    expect(applicationOutcomeStatus(undefined)).toBeUndefined();
    expect(applicationOutcomeStatus(null)).toBeUndefined();
  });
});

describe('providerCardState', () => {
  it('maps status to card variant', () => {
    expect(providerCardState(undefined)).toBe('cta');
    expect(providerCardState('none')).toBe('cta');
    expect(providerCardState('pending')).toBe('pending');
    expect(providerCardState('verified')).toBe('verified');
    expect(providerCardState('rejected')).toBe('rejected');
  });
});

describe('canAccessProviderArea', () => {
  it('allows only pending and verified', () => {
    expect(canAccessProviderArea('pending')).toBe(true);
    expect(canAccessProviderArea('verified')).toBe(true);
    expect(canAccessProviderArea('rejected')).toBe(false);
    expect(canAccessProviderArea('none')).toBe(false);
    expect(canAccessProviderArea(undefined)).toBe(false);
  });
});

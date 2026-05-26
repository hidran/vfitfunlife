import { describe, it, expect } from 'vitest';
import { providerCardState, canAccessProviderArea } from './providerStatus';

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

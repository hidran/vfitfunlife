import { describe, it, expect } from 'vitest';
import {
  isAwaitingVerification,
  isProviderVerified,
  needsVerificationDecision,
} from './providerVerification';

describe('isProviderVerified', () => {
  it('is true only when something actually said so', () => {
    expect(isProviderVerified({ providerProfile: { isVerified: true } })).toBe(true);
    expect(isProviderVerified({ isVerified: true })).toBe(true);
  });

  it('treats an absent providerProfile as not verified', () => {
    // The production case: 32 of 68 provider accounts carry no providerProfile at all. The
    // table already rendered them as unverified; the counter could not see them, because a
    // Firestore `== false` filter never matches a missing field. Both now agree.
    expect(isProviderVerified({})).toBe(false);
    expect(isProviderVerified({ providerProfile: null })).toBe(false);
    expect(isProviderVerified(undefined)).toBe(false);
    expect(isProviderVerified({ providerProfile: {} })).toBe(false);
  });

  it('does not accept a truthy non-true value as verification', () => {
    expect(isProviderVerified({ providerProfile: { isVerified: 'yes' as never } })).toBe(false);
    expect(isProviderVerified({ isVerified: 1 as never })).toBe(false);
  });

  it('is the exact complement of isAwaitingVerification', () => {
    for (const record of [
      { providerProfile: { isVerified: true } },
      { providerProfile: { isVerified: false } },
      {},
      undefined,
    ]) {
      expect(isAwaitingVerification(record)).toBe(!isProviderVerified(record));
    }
  });
});

describe('needsVerificationDecision', () => {
  it('counts an applicant who is still a customer', () => {
    // Role promotion belongs to the decision, so a pending applicant is role 'customer'.
    // Requiring role === 'provider' is what made the queue read zero while people waited.
    expect(needsVerificationDecision({ role: 'customer', providerStatus: 'pending' })).toBe(true);
  });

  it('counts a provider whose record never got a verification flag', () => {
    expect(needsVerificationDecision({ role: 'provider' })).toBe(true);
    expect(needsVerificationDecision({ role: 'provider', providerProfile: {} })).toBe(true);
    expect(
      needsVerificationDecision({ role: 'provider', providerProfile: { isVerified: false } })
    ).toBe(true);
  });

  it('leaves out anyone already decided', () => {
    expect(
      needsVerificationDecision({ role: 'provider', providerProfile: { isVerified: true } })
    ).toBe(false);
    // Rejected is a decision, not a queue item — it must not reappear as work to do.
    expect(needsVerificationDecision({ role: 'customer', providerStatus: 'rejected' })).toBe(false);
    expect(needsVerificationDecision({ role: 'provider', providerStatus: 'rejected' })).toBe(false);
  });

  it('leaves out ordinary customers who never applied', () => {
    expect(needsVerificationDecision({ role: 'customer' })).toBe(false);
    expect(needsVerificationDecision({ role: 'admin' })).toBe(false);
    expect(needsVerificationDecision(undefined)).toBe(false);
  });
});

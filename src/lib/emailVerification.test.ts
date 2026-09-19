import { describe, it, expect } from 'vitest';
import { isAwaitingEmailVerification, needsVerificationSync } from './emailVerification';

const passwordUser = (emailVerified = false) => ({
  email: 'mia@example.com',
  emailVerified,
  providerData: [{ providerId: 'password' }],
});
const googleUser = (emailVerified = true) => ({
  email: 'mia@gmail.com',
  emailVerified,
  providerData: [{ providerId: 'google.com' }],
});
const phoneUser = { email: null, emailVerified: false, providerData: [{ providerId: 'phone' }] };

describe('isAwaitingEmailVerification', () => {
  it('is true for an unverified email/password account', () => {
    expect(isAwaitingEmailVerification(passwordUser(), false)).toBe(true);
    expect(isAwaitingEmailVerification(passwordUser(), undefined)).toBe(true);
  });

  it('is false once either Auth or the profile says verified', () => {
    expect(isAwaitingEmailVerification(passwordUser(true), false)).toBe(false);
    expect(isAwaitingEmailVerification(passwordUser(), true)).toBe(false);
  });

  it('never asks social or phone sign-ins to verify', () => {
    expect(isAwaitingEmailVerification(googleUser(false), false)).toBe(false);
    expect(isAwaitingEmailVerification(phoneUser, undefined)).toBe(false);
  });
});

describe('needsVerificationSync', () => {
  it('syncs a social sign-in whose profile is not marked verified yet', () => {
    expect(needsVerificationSync(googleUser(), undefined)).toBe(true);
    expect(needsVerificationSync(googleUser(false), false)).toBe(true);
  });

  it('syncs an email account that Auth has verified but the profile has not', () => {
    expect(needsVerificationSync(passwordUser(true), false)).toBe(true);
  });

  it('does nothing when the profile already says verified', () => {
    expect(needsVerificationSync(googleUser(), true)).toBe(false);
    expect(needsVerificationSync(passwordUser(true), true)).toBe(false);
  });

  it('does nothing for unverified email accounts or accounts without an email', () => {
    expect(needsVerificationSync(passwordUser(false), false)).toBe(false);
    expect(needsVerificationSync(phoneUser, undefined)).toBe(false);
  });
});

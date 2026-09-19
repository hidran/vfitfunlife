import { describe, it, expect } from 'vitest';
import { isSocialVerifiedEmail } from './emailVerification';

const google = (email?: string) => ({ providerId: 'google.com', email });
const apple = (email?: string) => ({ providerId: 'apple.com', email });
const password = (email?: string) => ({ providerId: 'password', email });

describe('isSocialVerifiedEmail', () => {
  it('trusts the email of a Google sign-in', () => {
    expect(isSocialVerifiedEmail({ email: 'mia@gmail.com', providerData: [google('mia@gmail.com')] })).toBe(true);
  });

  it('trusts an Apple sign-in, including a private-relay address', () => {
    const relay = 'abc123@privaterelay.appleid.com';
    expect(isSocialVerifiedEmail({ email: relay, providerData: [apple(relay)] })).toBe(true);
  });

  it('compares emails case-insensitively', () => {
    expect(isSocialVerifiedEmail({ email: 'Mia@Gmail.com', providerData: [google('mia@gmail.com')] })).toBe(true);
  });

  it('does not trust a social provider whose email differs from the account email', () => {
    // Password account for a@x.com later linked to a Google account b@gmail.com:
    // Google vouched for b, not for a.
    expect(
      isSocialVerifiedEmail({ email: 'a@x.com', providerData: [password('a@x.com'), google('b@gmail.com')] }),
    ).toBe(false);
  });

  it('does not auto-verify email/password or phone accounts', () => {
    expect(isSocialVerifiedEmail({ email: 'a@x.com', providerData: [password('a@x.com')] })).toBe(false);
    expect(isSocialVerifiedEmail({ email: undefined, providerData: [{ providerId: 'phone' }] })).toBe(false);
  });

  it('needs an account email', () => {
    expect(isSocialVerifiedEmail({ email: undefined, providerData: [google(undefined)] })).toBe(false);
  });
});

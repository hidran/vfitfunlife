import { describe, it, expect } from 'vitest';
import { postAuthRoute, PROVIDER_HOME } from './postAuthRoute';

describe('postAuthRoute', () => {
  it('sends a plain customer home', () => {
    expect(postAuthRoute({ role: 'customer' })).toBe('/home');
    expect(postAuthRoute({ role: 'customer', providerStatus: 'none' })).toBe('/home');
  });

  it('sends verified providers to their dashboard', () => {
    expect(postAuthRoute({ role: 'provider', providerStatus: 'verified' })).toBe(PROVIDER_HOME);
    expect(PROVIDER_HOME).toBe('/provider/dashboard');
  });

  it('sends pending applicants to the dashboard, which they may already enter', () => {
    expect(postAuthRoute({ role: 'customer', providerStatus: 'pending' })).toBe(PROVIDER_HOME);
  });

  it('sends rejected applicants home, since the provider area would bounce them', () => {
    expect(postAuthRoute({ role: 'customer', providerStatus: 'rejected' })).toBe('/home');
  });

  it('sends staff to admin even when they also hold a provider status', () => {
    expect(postAuthRoute({ role: 'admin' })).toBe('/admin');
    expect(postAuthRoute({ role: 'superadmin', providerStatus: 'verified' })).toBe('/admin');
  });

  it('falls back to home without a profile', () => {
    expect(postAuthRoute(null)).toBe('/home');
    expect(postAuthRoute(undefined)).toBe('/home');
  });
});

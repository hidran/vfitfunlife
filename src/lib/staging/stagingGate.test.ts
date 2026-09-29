import { describe, it, expect } from 'vitest';
import {
  decideStagingGate,
  isPublicStagingPath,
  isRegistrationPath,
  isStagingHost,
  isStagingProject,
  prodUrlFor,
} from './stagingGate';

describe('isStagingHost', () => {
  it('matches both staging hosting domains', () => {
    expect(isStagingHost('vfit-app-staging.web.app')).toBe(true);
    expect(isStagingHost('vfit-app-staging.firebaseapp.com')).toBe(true);
  });

  it('never matches local dev, the emulator or production', () => {
    for (const h of ['localhost', '127.0.0.1', 'vfit-funlife.web.app', 'vfit-app-staging-preview.web.app']) {
      expect(isStagingHost(h)).toBe(false);
    }
  });
});

describe('isStagingProject', () => {
  it('is true only for the staging project id', () => {
    expect(isStagingProject('vfit-app-staging')).toBe(true);
    expect(isStagingProject('vfit-funlife')).toBe(false);
    expect(isStagingProject(undefined)).toBe(false);
  });
});

describe('paths', () => {
  it('treats login and forgot-password as public, with or without trailing slash', () => {
    expect(isPublicStagingPath('/auth/login')).toBe(true);
    expect(isPublicStagingPath('/auth/login/')).toBe(true);
    expect(isPublicStagingPath('/auth/forgot-password/')).toBe(true);
    expect(isPublicStagingPath('/')).toBe(false);
    expect(isPublicStagingPath('/auth/register/')).toBe(false);
    expect(isPublicStagingPath('/auth/login-extra')).toBe(false);
  });

  it('recognises registration pages', () => {
    expect(isRegistrationPath('/auth/register')).toBe(true);
    expect(isRegistrationPath('/auth/register/')).toBe(true);
    expect(isRegistrationPath('/auth/registered')).toBe(false);
  });

  it('builds the production URL with path and query', () => {
    expect(prodUrlFor('/fit/gyms/', '?id=abc&x=1')).toBe('https://vfit-funlife.web.app/fit/gyms/?id=abc&x=1');
    expect(prodUrlFor('/')).toBe('https://vfit-funlife.web.app/');
  });
});

describe('decideStagingGate', () => {
  const base = { authReady: true, signedIn: false, allowed: undefined };

  it('redirects registration pages whatever the auth state', () => {
    expect(decideStagingGate({ ...base, pathname: '/auth/register/', authReady: false })).toBe('redirect');
    expect(decideStagingGate({ ...base, pathname: '/auth/register/', signedIn: true, allowed: true })).toBe('redirect');
  });

  it('shows public pages immediately, before auth settles', () => {
    expect(decideStagingGate({ ...base, pathname: '/auth/login/', authReady: false })).toBe('allow');
  });

  it('holds other pages while auth is settling', () => {
    expect(decideStagingGate({ ...base, pathname: '/home/', authReady: false })).toBe('pending');
  });

  it('sends signed-out visitors on any non-public page to production', () => {
    expect(decideStagingGate({ ...base, pathname: '/' })).toBe('redirect');
    expect(decideStagingGate({ ...base, pathname: '/admin/' })).toBe('redirect');
  });

  it('lets signed-out visitors use login and forgot-password', () => {
    expect(decideStagingGate({ ...base, pathname: '/auth/login/' })).toBe('allow');
    expect(decideStagingGate({ ...base, pathname: '/auth/forgot-password/' })).toBe('allow');
  });

  it('waits for the allowlist lookup of a signed-in user', () => {
    expect(decideStagingGate({ ...base, pathname: '/home/', signedIn: true })).toBe('pending');
  });

  it('lets an allowed signed-in user anywhere (except registration)', () => {
    expect(decideStagingGate({ ...base, pathname: '/home/', signedIn: true, allowed: true })).toBe('allow');
  });

  it('signs out and redirects a signed-in user who is not allowed — even on the login page', () => {
    expect(decideStagingGate({ ...base, pathname: '/home/', signedIn: true, allowed: false })).toBe('signout-redirect');
    expect(decideStagingGate({ ...base, pathname: '/auth/login/', signedIn: true, allowed: false })).toBe('signout-redirect');
  });
});

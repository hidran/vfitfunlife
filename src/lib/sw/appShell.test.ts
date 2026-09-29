import { describe, expect, it } from 'vitest';
import { appShellDecision } from './appShell';

const base = { isNative: false, nodeEnv: 'production', disabled: false, supported: true };

describe('appShellDecision', () => {
  it('registers on the web in production builds', () => {
    expect(appShellDecision(base)).toBe('register');
  });

  it('never registers inside the Capacitor native shell', () => {
    expect(appShellDecision({ ...base, isNative: true })).toBe('skip');
    expect(appShellDecision({ ...base, isNative: true, nodeEnv: 'development' })).toBe('skip');
  });

  it('removes any installed worker in dev and when the kill switch is set', () => {
    expect(appShellDecision({ ...base, nodeEnv: 'development' })).toBe('unregister');
    expect(appShellDecision({ ...base, nodeEnv: 'test' })).toBe('unregister');
    expect(appShellDecision({ ...base, disabled: true })).toBe('unregister');
  });

  it('does nothing without service worker support', () => {
    expect(appShellDecision({ ...base, supported: false })).toBe('unsupported');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const record = vi.fn();
const traceFactory = vi.fn(() => ({ record }));
const initializePerformance = vi.fn(() => ({ perf: true }));

vi.mock('firebase/performance', () => ({
  initializePerformance,
  trace: traceFactory,
}));

import {
  __resetPerfForTests,
  isPerformanceMonitoringEnabled,
  schedulePerformanceMonitoring,
  trace,
} from './perf';
import type { FirebaseApp } from 'firebase/app';

const app = {} as FirebaseApp;

beforeEach(() => {
  __resetPerfForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('perf (disabled: test/dev builds)', () => {
  it('is disabled outside production builds', () => {
    expect(isPerformanceMonitoringEnabled()).toBe(false);
  });

  it('trace() is a pass-through and never loads the SDK', async () => {
    schedulePerformanceMonitoring(app);
    await expect(trace('x', async () => 42)).resolves.toBe(42);
    await expect(trace('x', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(initializePerformance).not.toHaveBeenCalled();
  });
});

describe('perf (enabled: production web build)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'p');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APP_ID', 'a');
    vi.stubEnv('NEXT_PUBLIC_USE_EMULATORS', 'false');
    // Run the idle callback synchronously.
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb();
      return 1;
    });
  });

  it('is skipped in the Capacitor native shell', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    expect(isPerformanceMonitoringEnabled()).toBe(false);
  });

  it('loads lazily and records traces measured before the SDK was ready', async () => {
    schedulePerformanceMonitoring(app);
    // Measured while the dynamic import is still in flight -> buffered.
    await trace('admin_dashboard_stats', async () => 'ok');
    await vi.waitFor(() => expect(initializePerformance).toHaveBeenCalledWith(app));
    await vi.waitFor(() =>
      expect(traceFactory).toHaveBeenCalledWith({ perf: true }, 'admin_dashboard_stats')
    );
    expect(record).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), {
      attributes: { outcome: 'ok' },
    });
  });
});

/**
 * Firebase Performance Monitoring (web), loaded lazily (P3-1).
 *
 * This module is imported by the root Firebase config, so it must stay tiny: it never
 * imports `firebase/performance` statically. The SDK is fetched with a dynamic import once
 * the page has loaded and the main thread is idle, so it adds nothing to any route's
 * initial JS and does not compete with first paint / hydration.
 *
 * Enabled only for real deployed builds: production NODE_ENV, a Firebase project + app id
 * configured, emulators off. Skipped inside the Capacitor native shells, where the web SDK
 * would report WKWebView/Android WebView timings under a `capacitor://` / `https://localhost`
 * origin, which is noise next to the web data (native perf would need the native SDK).
 *
 * `trace(name, fn)` wraps an async operation in a custom trace. Measurements taken before
 * the SDK has finished loading (e.g. the first dashboard fetch right after login) are
 * buffered and recorded retroactively once it is ready, so early calls are not lost.
 */
import type { FirebaseApp } from 'firebase/app';
import type { FirebasePerformance } from 'firebase/performance';

type TraceFactory = typeof import('firebase/performance').trace;

interface PendingMeasurement {
  name: string;
  startTime: number;
  duration: number;
  failed: boolean;
}

const MAX_PENDING = 50;

let perf: FirebasePerformance | null = null;
let traceFactory: TraceFactory | null = null;
let scheduled = false;
let pending: PendingMeasurement[] = [];

function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** Whether this build/runtime should load Performance Monitoring at all. */
export function isPerformanceMonitoringEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    process.env.NODE_ENV === 'production' &&
    !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID &&
    process.env.NEXT_PUBLIC_USE_EMULATORS !== 'true' &&
    !isNativeShell()
  );
}

function whenIdleAfterLoad(cb: () => void) {
  const idle = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(cb, { timeout: 10_000 });
    } else {
      setTimeout(cb, 2_000);
    }
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

function record(m: PendingMeasurement) {
  if (!perf || !traceFactory) return;
  try {
    traceFactory(perf, m.name).record(m.startTime, Math.max(1, Math.round(m.duration)), {
      attributes: { outcome: m.failed ? 'error' : 'ok' },
    });
  } catch {
    // Never let telemetry break the app.
  }
}

/**
 * Schedules Performance Monitoring to load after first paint. Safe to call repeatedly and
 * on the server (no-op). Called once from lib/firebase/config after the app is created.
 */
export function schedulePerformanceMonitoring(app: FirebaseApp): void {
  if (scheduled || !isPerformanceMonitoringEnabled()) return;
  scheduled = true;
  whenIdleAfterLoad(() => {
    import('firebase/performance')
      .then(({ initializePerformance, trace: factory }) => {
        perf = initializePerformance(app);
        traceFactory = factory;
        const queued = pending;
        pending = [];
        queued.forEach(record);
      })
      .catch((error) => {
        pending = [];
        console.warn('[perf] Performance Monitoring unavailable', error);
      });
  });
}

/**
 * Runs `fn` inside a custom trace named `name` (Firebase limits: ≤100 chars, no leading
 * underscore). A plain pass-through when monitoring is disabled.
 */
export async function trace<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!scheduled) return fn();
  const startTime = Date.now();
  const t0 = performance.now();
  let failed = false;
  try {
    return await fn();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const m = { name, startTime, duration: performance.now() - t0, failed };
    if (perf) record(m);
    else if (pending.length < MAX_PENDING) pending.push(m);
  }
}

/** Test hook. */
export function __resetPerfForTests() {
  perf = null;
  traceFactory = null;
  scheduled = false;
  pending = [];
}

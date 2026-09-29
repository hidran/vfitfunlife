/**
 * App-shell service worker registration (plan D3).
 *
 * Registers /sw.js (generated into out/ by scripts/generate-sw.mjs) with scope '/'. That is a
 * separate registration from the FCM push worker (/firebase-messaging-sw.js, scope
 * /firebase-cloud-messaging-push-scope — see src/lib/push/fcmRegistration.ts); the two never
 * touch each other's registration.
 *
 * Skipped on Capacitor native (the bundle is local, nothing to cache), in dev (next dev has no
 * sw.js and a caching worker would fight HMR), and when NEXT_PUBLIC_DISABLE_SW=true — which
 * also unregisters an already installed app-shell worker (rollback switch).
 */
import { Capacitor } from '@capacitor/core';

export const APP_SHELL_SW_PATH = '/sw.js';
export const APP_SHELL_SW_SCOPE = '/';

export type AppShellResult = 'registered' | 'skipped' | 'unregistered' | 'unsupported' | 'error';

export interface AppShellEnv {
  isNative: boolean;
  nodeEnv: string | undefined;
  disabled: boolean;
  supported: boolean;
}

export function appShellDecision(env: AppShellEnv): 'register' | 'unregister' | 'skip' | 'unsupported' {
  if (!env.supported) return 'unsupported';
  if (env.isNative) return 'skip';
  if (env.disabled || env.nodeEnv !== 'production') return 'unregister';
  return 'register';
}

function isAppShellRegistration(reg: ServiceWorkerRegistration): boolean {
  const worker = reg.active ?? reg.waiting ?? reg.installing;
  if (!worker) return false;
  try {
    return new URL(worker.scriptURL).pathname === APP_SHELL_SW_PATH;
  } catch {
    return false;
  }
}

async function unregisterAppShell(): Promise<boolean> {
  const regs = await navigator.serviceWorker.getRegistrations();
  const ours = regs.filter(isAppShellRegistration);
  await Promise.all(ours.map((reg) => reg.unregister()));
  return ours.length > 0;
}

/** Never throws. */
export async function registerAppShellServiceWorker(): Promise<AppShellResult> {
  try {
    const decision = appShellDecision({
      supported: typeof window !== 'undefined' && 'serviceWorker' in navigator,
      isNative: Capacitor.isNativePlatform(),
      nodeEnv: process.env.NODE_ENV,
      disabled: process.env.NEXT_PUBLIC_DISABLE_SW === 'true',
    });
    if (decision === 'unsupported') return 'unsupported';
    if (decision === 'skip') return 'skipped';
    if (decision === 'unregister') return (await unregisterAppShell()) ? 'unregistered' : 'skipped';

    await navigator.serviceWorker.register(APP_SHELL_SW_PATH, {
      scope: APP_SHELL_SW_SCOPE,
      updateViaCache: 'none',
    });
    return 'registered';
  } catch (err) {
    console.warn('[sw] app-shell registration failed:', err);
    return 'error';
  }
}

/** Registers once the page has loaded, so precaching never competes with first paint. */
export function scheduleAppShellRegistration(): void {
  if (typeof window === 'undefined') return;
  const run = () => {
    void registerAppShellServiceWorker();
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

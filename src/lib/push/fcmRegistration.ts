/**
 * FCM token registration (web + native).
 *
 * Load this module lazily (`await import('@/lib/push/fcmRegistration')`): it pulls in
 * firebase/messaging, firebase/functions and @capacitor/push-notifications, none of which
 * belong in the root bundle (see scripts/check-bundle-budget.mjs).
 *
 * - Web: once Notification permission is granted, registers public/firebase-messaging-sw.js
 *   (Firebase config passed as query params), calls getToken() with the VAPID key from
 *   NEXT_PUBLIC_FIREBASE_VAPID_KEY and stores the token via the `registerFcmToken` callable.
 *   Without a VAPID key web push is a no-op (dev console warning).
 * - Native: @capacitor/push-notifications register() + 'registration' listener →
 *   `registerFcmToken` with platform ios/android.
 * - Logout: disablePush() removes the token server-side (`unregisterFcmToken`) — it must run
 *   while still signed in — and deletes the web token locally.
 */
import { Capacitor } from '@capacitor/core';
import { httpsCallable } from 'firebase/functions';
import { app, auth, getFunctionsInstance, initializeMessaging } from '@/lib/firebase/app';
import { registerFcmToken } from '@/lib/firebase/functions';
import { pushTargetUrl } from './pushTarget';

export type PushPlatform = 'ios' | 'android' | 'web';

export type PushResult =
  | 'registered'
  | 'pending' // native: register() called, token arrives via the 'registration' event
  | 'unsupported'
  | 'denied'
  | 'no-vapid-key'
  | 'signed-out'
  | 'error';

export interface ForegroundPush {
  title: string;
  body: string;
  /** Route to open, from pushTargetUrl(). */
  url: string;
  data: Record<string, string>;
}

export interface EnablePushOptions {
  /** Ask for permission if not decided yet. Web browsers require a user gesture for this. */
  requestPermission?: boolean;
}

type ForegroundHandler = (message: ForegroundPush) => void;
type NavigateHandler = (url: string) => void;

export const SW_PATH = '/firebase-messaging-sw.js';
// Same scope the Firebase SDK uses for its default worker: keeps it from controlling pages.
export const SW_SCOPE = '/firebase-cloud-messaging-push-scope';
export const SW_CLICK_MESSAGE = 'vfit:push-click';

const SW_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const;

// ---- module state ------------------------------------------------------------------------

let registered: { token: string; uid: string; platform: PushPlatform } | null = null;
let foregroundHandler: ForegroundHandler | null = null;
let navigateHandler: NavigateHandler | null = null;
let webForegroundUnsub: (() => void) | null = null;
let swMessageListener: ((event: MessageEvent) => void) | null = null;
let nativeListenersPromise: Promise<void> | null = null;

/** Test-only: reset module state. */
export function __resetPushStateForTests() {
  registered = null;
  foregroundHandler = null;
  navigateHandler = null;
  webForegroundUnsub = null;
  swMessageListener = null;
  nativeListenersPromise = null;
}

export function getRegisteredPushToken() {
  return registered;
}

// ---- helpers -------------------------------------------------------------------------------

export function getVapidKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  return key ? key : undefined;
}

export function getPushPlatform(): PushPlatform {
  const p = Capacitor.getPlatform();
  return p === 'ios' || p === 'android' ? p : 'web';
}

/** SW URL carrying the Firebase web config — see public/firebase-messaging-sw.js. */
export function buildServiceWorkerUrl(options: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const key of SW_CONFIG_KEYS) {
    const value = options[key];
    if (typeof value === 'string' && value) params.set(key, value);
  }
  return `${SW_PATH}?${params.toString()}`;
}

function toStringRecord(data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
  }
  return out;
}

async function saveToken(token: string, platform: PushPlatform): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  if (registered && registered.token === token && registered.uid === uid) return true;
  await registerFcmToken({ token, platform });
  registered = { token, uid, platform };
  return true;
}

/**
 * Handlers for messages received while the app is in the foreground and for taps on
 * notifications (native, or the web service worker). Set by PushRegistrar.
 */
export function setPushHandlers(handlers: {
  onForeground?: ForegroundHandler | null;
  onNavigate?: NavigateHandler | null;
}) {
  if (handlers.onForeground !== undefined) foregroundHandler = handlers.onForeground;
  if (handlers.onNavigate !== undefined) navigateHandler = handlers.onNavigate;
}

// ---- web -----------------------------------------------------------------------------------

async function enableWebPush(opts: EnablePushOptions): Promise<PushResult> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return 'unsupported';
  }

  let permission = Notification.permission;
  if (permission === 'default' && opts.requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return 'denied';

  const vapidKey = getVapidKey();
  if (!vapidKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[push] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set — web push registration skipped.'
      );
    }
    return 'no-vapid-key';
  }

  if (!auth.currentUser) return 'signed-out';

  const messaging = await initializeMessaging();
  if (!messaging) return 'unsupported';

  const registration = await navigator.serviceWorker.register(
    buildServiceWorkerUrl(app.options as Record<string, unknown>),
    { scope: SW_SCOPE, updateViaCache: 'none' }
  );

  // A freshly registered worker is still installing; PushManager.subscribe() (inside getToken)
  // fails with "no active Service Worker" until it activates.
  await waitForActiveWorker(registration);

  const { getToken, onMessage } = await import('firebase/messaging');
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return 'error';

  if (!webForegroundUnsub) {
    webForegroundUnsub = onMessage(messaging, (payload) => {
      const data = toStringRecord(payload.data);
      foregroundHandler?.({
        title: payload.notification?.title ?? data.title ?? '',
        body: payload.notification?.body ?? data.body ?? '',
        url: pushTargetUrl(data),
        data,
      });
    });
  }
  if (!swMessageListener) {
    swMessageListener = (event: MessageEvent) => {
      const msg = event.data as { type?: string; url?: unknown } | null;
      if (msg?.type === SW_CLICK_MESSAGE && typeof msg.url === 'string') {
        navigateHandler?.(pushTargetUrl({ link: msg.url }));
      }
    };
    navigator.serviceWorker.addEventListener('message', swMessageListener);
  }

  return (await saveToken(token, 'web')) ? 'registered' : 'signed-out';
}

// ---- native --------------------------------------------------------------------------------

async function ensureNativeListeners(): Promise<void> {
  if (!nativeListenersPromise) {
    nativeListenersPromise = (async () => {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.addListener('registration', (token) => {
        saveToken(token.value, getPushPlatform()).catch((err) =>
          console.error('[push] registerFcmToken failed:', err)
        );
      });
      await PushNotifications.addListener('registrationError', (error) => {
        console.error('[push] native registration error:', error);
      });
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = toStringRecord(notification.data);
        foregroundHandler?.({
          title: notification.title ?? '',
          body: notification.body ?? '',
          url: pushTargetUrl(data),
          data,
        });
      });
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        navigateHandler?.(pushTargetUrl(toStringRecord(action.notification.data)));
      });
    })();
  }
  return nativeListenersPromise;
}

async function enableNativePush(opts: EnablePushOptions): Promise<PushResult> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let { receive } = await PushNotifications.checkPermissions();
  if ((receive === 'prompt' || receive === 'prompt-with-rationale') && opts.requestPermission) {
    ({ receive } = await PushNotifications.requestPermissions());
  }
  if (receive !== 'granted') return 'denied';
  if (!auth.currentUser) return 'signed-out';

  await ensureNativeListeners();
  // Fires 'registration' with the current token each time (also a refresh after login).
  await PushNotifications.register();
  return 'pending';
}

// ---- public API ----------------------------------------------------------------------------

/**
 * Registers this device/browser for push for the signed-in user. Safe to call repeatedly
 * (on every login / auth restore): the same token for the same user is only sent once per
 * session. Never throws.
 */
export async function enablePush(opts: EnablePushOptions = {}): Promise<PushResult> {
  try {
    return Capacitor.isNativePlatform() ? await enableNativePush(opts) : await enableWebPush(opts);
  } catch (err) {
    console.error('[push] enablePush failed:', err);
    return 'error';
  }
}

/**
 * Removes this device's token from the signed-in user. Call BEFORE signing out (the
 * callable needs auth). Never throws.
 */
export async function disablePush(): Promise<void> {
  const current = registered;
  registered = null;
  if (!current) return;

  try {
    if (auth.currentUser?.uid === current.uid) {
      const functions = await getFunctionsInstance();
      await httpsCallable<{ token: string }, { success: boolean }>(
        functions,
        'unregisterFcmToken'
      )({ token: current.token });
    }
  } catch (err) {
    console.warn('[push] unregisterFcmToken failed:', err);
  }

  if (current.platform === 'web') {
    try {
      const messaging = await initializeMessaging();
      if (messaging) {
        const { deleteToken } = await import('firebase/messaging');
        await deleteToken(messaging);
      }
    } catch (err) {
      console.warn('[push] deleteToken failed:', err);
    }
  }
}

/** Resolves once the registration has an active worker (or after `timeoutMs`, letting getToken report the error). */
export function waitForActiveWorker(registration: ServiceWorkerRegistration, timeoutMs = 10000): Promise<void> {
  if (registration.active) return Promise.resolve();
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' || worker.state === 'redundant') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

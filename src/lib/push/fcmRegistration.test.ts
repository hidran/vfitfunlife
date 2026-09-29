import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  const listeners: Record<string, (arg: any) => void> = {};
  return {
    isNative: false,
    platform: 'web' as string,
    currentUser: { uid: 'u1' } as { uid: string } | null,
    messaging: { id: 'messaging' } as object | null,
    registerFcmToken: vi.fn(async () => ({ success: true })),
    unregisterCallable: vi.fn(async () => ({ data: { success: true } })),
    httpsCallable: vi.fn(),
    getToken: vi.fn(async () => 'web-token'),
    deleteToken: vi.fn(async () => true),
    onMessage: vi.fn(() => () => {}),
    listeners,
    push: {
      checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
      requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
      register: vi.fn(async () => {}),
      addListener: vi.fn(async (event: string, cb: (arg: any) => void) => {
        listeners[event] = cb;
        return { remove: async () => {} };
      }),
    },
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => h.isNative,
    getPlatform: () => h.platform,
  },
}));

vi.mock('@/lib/firebase/config', () => ({
  app: {
    options: {
      apiKey: 'key',
      authDomain: 'proj.firebaseapp.com',
      projectId: 'proj',
      storageBucket: 'proj.appspot.com',
      messagingSenderId: '123',
      appId: '1:123:web:abc',
      measurementId: 'G-X',
    },
  },
  auth: {
    get currentUser() {
      return h.currentUser;
    },
  },
  getFunctionsInstance: vi.fn(async () => ({})),
  initializeMessaging: vi.fn(async () => h.messaging),
}));

vi.mock('@/lib/firebase/functions', () => ({ registerFcmToken: h.registerFcmToken }));

vi.mock('firebase/functions', () => ({ httpsCallable: h.httpsCallable }));

vi.mock('firebase/messaging', () => ({
  getToken: h.getToken,
  deleteToken: h.deleteToken,
  onMessage: h.onMessage,
}));

vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: h.push }));

import {
  enablePush,
  disablePush,
  buildServiceWorkerUrl,
  setPushHandlers,
  getRegisteredPushToken,
  __resetPushStateForTests,
  SW_SCOPE,
} from './fcmRegistration';

const swRegistration = { scope: SW_SCOPE };
const swRegister = vi.fn(async () => swRegistration);

function installWebApis(permission: NotificationPermission = 'granted') {
  const NotificationMock = Object.assign(function Notification() {}, {
    permission,
    requestPermission: vi.fn(async () => 'granted' as NotificationPermission),
  });
  vi.stubGlobal('Notification', NotificationMock);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: swRegister, addEventListener: vi.fn() },
  });
  return NotificationMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetPushStateForTests();
  h.isNative = false;
  h.platform = 'web';
  h.currentUser = { uid: 'u1' };
  h.messaging = { id: 'messaging' };
  h.httpsCallable.mockReturnValue(h.unregisterCallable);
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_VAPID_KEY', 'vapid-123');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('buildServiceWorkerUrl', () => {
  it('passes only the SW config keys as query params', () => {
    const url = buildServiceWorkerUrl({
      apiKey: 'k',
      projectId: 'p',
      messagingSenderId: '1',
      appId: 'a',
      measurementId: 'G-X',
      authDomain: undefined,
    });
    const parsed = new URL(url, 'https://example.test');
    expect(parsed.pathname).toBe('/firebase-messaging-sw.js');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      apiKey: 'k',
      projectId: 'p',
      messagingSenderId: '1',
      appId: 'a',
    });
  });
});

describe('enablePush (web)', () => {
  it('registers the SW with config, gets a token with the VAPID key and stores it', async () => {
    installWebApis('granted');

    await expect(enablePush()).resolves.toBe('registered');

    expect(swRegister).toHaveBeenCalledTimes(1);
    const [swUrl, swOpts] = swRegister.mock.calls[0] as unknown as [string, RegistrationOptions];
    expect(swUrl).toContain('/firebase-messaging-sw.js?');
    expect(swUrl).toContain('projectId=proj');
    expect(swOpts).toMatchObject({ scope: SW_SCOPE });
    expect(h.getToken).toHaveBeenCalledWith(h.messaging, {
      vapidKey: 'vapid-123',
      serviceWorkerRegistration: swRegistration,
    });
    expect(h.registerFcmToken).toHaveBeenCalledWith({ token: 'web-token', platform: 'web' });
    expect(getRegisteredPushToken()).toEqual({ token: 'web-token', uid: 'u1', platform: 'web' });
  });

  it('does not re-send the same token for the same user', async () => {
    installWebApis('granted');
    await enablePush();
    await enablePush();
    expect(h.registerFcmToken).toHaveBeenCalledTimes(1);
  });

  it('re-sends when a different user signs in on the same browser', async () => {
    installWebApis('granted');
    await enablePush();
    h.currentUser = { uid: 'u2' };
    await enablePush();
    expect(h.registerFcmToken).toHaveBeenCalledTimes(2);
  });

  it('is a no-op with a warning when the VAPID key is missing', async () => {
    installWebApis('granted');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_VAPID_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(enablePush()).resolves.toBe('no-vapid-key');

    expect(h.getToken).not.toHaveBeenCalled();
    expect(h.registerFcmToken).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_FIREBASE_VAPID_KEY'));
    warn.mockRestore();
  });

  it('does not prompt unless asked, and reports denied', async () => {
    const N = installWebApis('default');
    await expect(enablePush()).resolves.toBe('denied');
    expect(N.requestPermission).not.toHaveBeenCalled();
    expect(h.getToken).not.toHaveBeenCalled();
  });

  it('prompts when requestPermission is set', async () => {
    const N = installWebApis('default');
    await expect(enablePush({ requestPermission: true })).resolves.toBe('registered');
    expect(N.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('skips when signed out', async () => {
    installWebApis('granted');
    h.currentUser = null;
    await expect(enablePush()).resolves.toBe('signed-out');
    expect(h.getToken).not.toHaveBeenCalled();
  });

  it('reports unsupported when messaging is not supported', async () => {
    installWebApis('granted');
    h.messaging = null;
    await expect(enablePush()).resolves.toBe('unsupported');
  });

  it('never throws', async () => {
    installWebApis('granted');
    h.getToken.mockRejectedValueOnce(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(enablePush()).resolves.toBe('error');
    err.mockRestore();
  });

  it('forwards foreground messages with a target url', async () => {
    installWebApis('granted');
    const onForeground = vi.fn();
    setPushHandlers({ onForeground });
    await enablePush();

    const handler = (h.onMessage.mock.calls[0] as unknown as [unknown, (p: unknown) => void])[1];
    handler({
      notification: { title: 'Hi', body: 'There' },
      data: { type: 'booking_accepted', bookingId: 'b1' },
    });
    expect(onForeground).toHaveBeenCalledWith({
      title: 'Hi',
      body: 'There',
      url: '/bookings/detail?id=b1',
      data: { type: 'booking_accepted', bookingId: 'b1' },
    });
  });
});

describe('enablePush (native)', () => {
  beforeEach(() => {
    h.isNative = true;
    h.platform = 'ios';
  });

  it('registers and sends the token from the registration event with the platform', async () => {
    await expect(enablePush()).resolves.toBe('pending');
    expect(h.push.register).toHaveBeenCalledTimes(1);

    h.listeners.registration({ value: 'apns-or-fcm-token' });
    await vi.waitFor(() =>
      expect(h.registerFcmToken).toHaveBeenCalledWith({
        token: 'apns-or-fcm-token',
        platform: 'ios',
      })
    );
  });

  it('asks for permission only when requested', async () => {
    h.push.checkPermissions.mockResolvedValue({ receive: 'prompt' });
    await expect(enablePush()).resolves.toBe('denied');
    expect(h.push.requestPermissions).not.toHaveBeenCalled();

    await expect(enablePush({ requestPermission: true })).resolves.toBe('pending');
    expect(h.push.requestPermissions).toHaveBeenCalledTimes(1);
    h.push.checkPermissions.mockResolvedValue({ receive: 'granted' });
  });

  it('adds listeners once across repeated calls', async () => {
    await enablePush();
    await enablePush();
    const registrationListeners = h.push.addListener.mock.calls.filter(
      (c) => (c as unknown as [string])[0] === 'registration'
    );
    expect(registrationListeners).toHaveLength(1);
    expect(h.push.register).toHaveBeenCalledTimes(2);
  });

  it('routes notification taps', async () => {
    const onNavigate = vi.fn();
    setPushHandlers({ onNavigate });
    await enablePush();
    h.listeners.pushNotificationActionPerformed({
      notification: { data: { type: 'booking_cancelled', bookingId: 'x y' } },
    });
    expect(onNavigate).toHaveBeenCalledWith('/bookings/detail?id=x%20y');
  });
});

describe('disablePush', () => {
  it('removes the token server-side while signed in and deletes the web token', async () => {
    installWebApis('granted');
    await enablePush();

    await disablePush();

    expect(h.httpsCallable).toHaveBeenCalledWith(expect.anything(), 'unregisterFcmToken');
    expect(h.unregisterCallable).toHaveBeenCalledWith({ token: 'web-token' });
    expect(h.deleteToken).toHaveBeenCalledWith(h.messaging);
    expect(getRegisteredPushToken()).toBeNull();
  });

  it('is a no-op when nothing was registered', async () => {
    await disablePush();
    expect(h.httpsCallable).not.toHaveBeenCalled();
    expect(h.deleteToken).not.toHaveBeenCalled();
  });

  it('swallows server errors', async () => {
    installWebApis('granted');
    await enablePush();
    h.unregisterCallable.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(disablePush()).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('waitForActiveWorker', () => {
  it('resolves immediately when a worker is already active', async () => {
    const { waitForActiveWorker } = await import('./fcmRegistration');
    await expect(waitForActiveWorker({ active: {} } as unknown as ServiceWorkerRegistration)).resolves.toBeUndefined();
  });

  it('waits for the installing worker to activate', async () => {
    const { waitForActiveWorker } = await import('./fcmRegistration');
    let onChange: () => void = () => {};
    const worker = { state: 'installing', addEventListener: (_: string, cb: () => void) => { onChange = cb; } };
    let done = false;
    const p = waitForActiveWorker({ active: null, installing: worker } as unknown as ServiceWorkerRegistration)
      .then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    worker.state = 'activated';
    onChange();
    await p;
    expect(done).toBe(true);
  });
});

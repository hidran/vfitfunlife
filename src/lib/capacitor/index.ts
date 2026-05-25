/**
 * Capacitor Native Integration Utilities
 * 
 * These utilities help integrate native mobile features with the Next.js app.
 * All functions gracefully degrade when running in a web browser.
 */

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';

// Check if running on native platform
export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const getPlatform = (): 'ios' | 'android' | 'web' => {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
};

// App Lifecycle
export const initializeAppListeners = () => {
  if (!isNativePlatform()) return;

  // Handle app state changes
  App.addListener('appStateChange', ({ isActive }) => {
    console.log('[Capacitor] App state changed:', isActive ? 'active' : 'background');
  });

  // Handle back button (Android)
  App.addListener('backButton', ({ canGoBack }) => {
    if (!canGoBack) {
      App.exitApp();
    }
  });

  // Handle app url open (deep links)
  App.addListener('appUrlOpen', (data) => {
    console.log('[Capacitor] App opened with URL:', data.url);
  });
};

// Status Bar
export const setStatusBarStyle = async (style: 'dark' | 'light') => {
  if (!isNativePlatform()) return;

  try {
    await StatusBar.setStyle({
      style: style === 'dark' ? StatusBarStyle.Dark : StatusBarStyle.Light,
    });
  } catch (error) {
    console.warn('[Capacitor] Failed to set status bar style:', error);
  }
};

export const hideStatusBar = async () => {
  if (!isNativePlatform()) return;
  await StatusBar.hide();
};

export const showStatusBar = async () => {
  if (!isNativePlatform()) return;
  await StatusBar.show();
};

// Keyboard
export const initializeKeyboardListeners = () => {
  if (!isNativePlatform()) return;

  Keyboard.addListener('keyboardWillShow', (info) => {
    document.body.classList.add('keyboard-visible');
  });

  Keyboard.addListener('keyboardWillHide', () => {
    document.body.classList.remove('keyboard-visible');
  });
};

export const hideKeyboard = async () => {
  if (!isNativePlatform()) return;
  await Keyboard.hide();
};

// Splash Screen
export const hideSplashScreen = async () => {
  if (!isNativePlatform()) return;
  await SplashScreen.hide();
};

export const showSplashScreen = async () => {
  if (!isNativePlatform()) return;
  await SplashScreen.show();
};

// Preferences (Persistent Storage)
export const setPreference = async (key: string, value: string) => {
  await Preferences.set({ key, value });
};

export const getPreference = async (key: string): Promise<string | null> => {
  const { value } = await Preferences.get({ key });
  return value;
};

export const removePreference = async (key: string) => {
  await Preferences.remove({ key });
};

export const clearPreferences = async () => {
  await Preferences.clear();
};

// Network Status
export const getNetworkStatus = async () => {
  return await Network.getStatus();
};

export const addNetworkListener = (callback: (status: { connected: boolean }) => void) => {
  return Network.addListener('networkStatusChange', callback);
};

// Haptics
export const hapticImpact = async (style: 'light' | 'medium' | 'heavy' = 'medium') => {
  if (!isNativePlatform()) return;

  const impactStyle = {
    light: ImpactStyle.Light,
    medium: ImpactStyle.Medium,
    heavy: ImpactStyle.Heavy,
  }[style];

  await Haptics.impact({ style: impactStyle });
};

export const hapticNotification = async (type: 'success' | 'warning' | 'error' = 'success') => {
  if (!isNativePlatform()) return;
  
  const notificationType = {
    success: NotificationType.Success,
    warning: NotificationType.Warning,
    error: NotificationType.Error,
  }[type];
  
  await Haptics.notification({ type: notificationType });
};

// Share
export const shareContent = async (options: { title?: string; text?: string; url?: string }) => {
  if (!isNativePlatform()) {
    // Fallback to Web Share API
    if (navigator.share) {
      await navigator.share(options);
    } else {
      // Fallback to clipboard
      if (options.url) {
        await navigator.clipboard.writeText(options.url);
        alert('Link copied to clipboard!');
      }
    }
    return;
  }

  await Share.share({
    title: options.title,
    text: options.text,
    url: options.url,
  });
};

// Local Notifications
export const scheduleNotification = async (options: {
  title: string;
  body: string;
  id?: number;
  scheduleAt?: Date;
  extra?: Record<string, any>;
}) => {
  if (!isNativePlatform()) {
    console.warn('[Capacitor] Local notifications not available on web');
    return;
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        title: options.title,
        body: options.body,
        id: options.id || Math.floor(Math.random() * 100000),
        schedule: options.scheduleAt ? { at: options.scheduleAt } : undefined,
        extra: options.extra,
      },
    ],
  });
};

// Push Notifications Setup
export const initializePushNotifications = async () => {
  if (!isNativePlatform()) return null;

  // Request permission
  const permission = await PushNotifications.requestPermissions();
  
  if (permission.receive === 'granted') {
    // Register with FCM/APNs
    await PushNotifications.register();

    // Set up listeners
    PushNotifications.addListener('registration', (token) => {
      console.log('[Capacitor] Push registration token:', token.value);
      // Send this token to your backend
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Capacitor] Push registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Capacitor] Push received:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[Capacitor] Push action performed:', action);
    });

    return true;
  }

  return false;
};

// Device Info
export const getDeviceInfo = async () => {
  if (!isNativePlatform()) {
    return {
      platform: 'web',
      model: 'Browser',
      osVersion: navigator.userAgent,
      appVersion: '1.0.0',
    };
  }

  const info = await Device.getInfo();
  return info;
};

// Deep Link Handling
export const handleDeepLink = (url: string) => {
  // Parse the URL and navigate accordingly
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const params = new URLSearchParams(urlObj.search);

  console.log('[Capacitor] Deep link path:', path);
  console.log('[Capacitor] Deep link params:', Object.fromEntries(params));

  // Handle specific deep links
  if (path.startsWith('/booking/')) {
    const providerId = path.split('/')[2];
    // Navigate to booking
    window.location.href = `/book?providerId=${providerId}`;
  } else if (path.startsWith('/provider/')) {
    const providerId = path.split('/')[2];
    window.location.href = `/provider/${providerId}`;
  }
  // Add more handlers as needed
};

// Initialize all Capacitor features
export const initializeCapacitor = async () => {
  console.log('[Capacitor] Initializing...');
  console.log('[Capacitor] Platform:', getPlatform());

  initializeAppListeners();
  initializeKeyboardListeners();

  // Set status bar style based on theme
  await setStatusBarStyle('dark');

  // Hide splash screen after a delay
  setTimeout(() => {
    hideSplashScreen();
  }, 2000);

  // Initialize push notifications
  await initializePushNotifications();

  console.log('[Capacitor] Initialization complete');
};

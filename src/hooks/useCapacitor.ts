'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  isNativePlatform,
  getPlatform,
  getNetworkStatus,
  addNetworkListener,
  getDeviceInfo,
  hapticImpact,
  hapticNotification,
  shareContent,
  setPreference,
  getPreference,
  removePreference,
  hideKeyboard,
  setStatusBarStyle,
} from '@/lib/capacitor';

interface NetworkStatus {
  connected: boolean;
  connectionType?: string;
}

interface DeviceInfo {
  platform: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
}

/**
 * Hook for Capacitor native features
 * All functions gracefully degrade when running in web browser
 */
export function useCapacitor() {
  const [isNative, setIsNative] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web');
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({ connected: true });
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  useEffect(() => {
    setIsNative(isNativePlatform());
    setPlatform(getPlatform());

    // Get device info
    getDeviceInfo().then((info) => {
      setDeviceInfo(info as DeviceInfo);
    });

    // Get initial network status
    getNetworkStatus().then((status) => {
      setNetworkStatus({
        connected: status.connected,
        connectionType: status.connectionType,
      });
    });

    // Listen for network changes
    const listener = addNetworkListener((status) => {
      setNetworkStatus({
        connected: status.connected,
      });
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  // Haptic feedback
  const vibrate = useCallback((style: 'light' | 'medium' | 'heavy' = 'medium') => {
    return hapticImpact(style);
  }, []);

  const notify = useCallback((type: 'success' | 'warning' | 'error' = 'success') => {
    return hapticNotification(type);
  }, []);

  // Share
  const share = useCallback((options: { title?: string; text?: string; url?: string }) => {
    return shareContent(options);
  }, []);

  // Preferences (storage)
  const setStorage = useCallback((key: string, value: string) => {
    return setPreference(key, value);
  }, []);

  const getStorage = useCallback((key: string) => {
    return getPreference(key);
  }, []);

  const removeStorage = useCallback((key: string) => {
    return removePreference(key);
  }, []);

  // UI helpers
  const dismissKeyboard = useCallback(() => {
    return hideKeyboard();
  }, []);

  const setStatusBar = useCallback((style: 'dark' | 'light') => {
    return setStatusBarStyle(style);
  }, []);

  return {
    // State
    isNative,
    platform,
    networkStatus,
    isOnline: networkStatus.connected,
    deviceInfo,

    // Actions
    vibrate,
    notify,
    share,
    setStorage,
    getStorage,
    removeStorage,
    dismissKeyboard,
    setStatusBar,
  };
}

/**
 * Hook for managing keyboard visibility
 */
export function useKeyboard() {
  const [isVisible, setIsVisible] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!isNativePlatform()) return;

    const handleKeyboardShow = (event: Event) => {
      setIsVisible(true);
      const customEvent = event as CustomEvent;
      setHeight(customEvent.detail?.keyboardHeight || 0);
    };

    const handleKeyboardHide = () => {
      setIsVisible(false);
      setHeight(0);
    };

    // Listen for Capacitor keyboard events
    window.addEventListener('keyboardWillShow', handleKeyboardShow);
    window.addEventListener('keyboardWillHide', handleKeyboardHide);

    return () => {
      window.removeEventListener('keyboardWillShow', handleKeyboardShow);
      window.removeEventListener('keyboardWillHide', handleKeyboardHide);
    };
  }, []);

  return {
    isVisible,
    height,
    dismiss: hideKeyboard,
  };
}

/**
 * Hook for app lifecycle (background/foreground)
 */
export function useAppState() {
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isNativePlatform()) {
      // Fallback for web
      const handleVisibilityChange = () => {
        setIsActive(!document.hidden);
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }

    // For native, we'll use a custom event from the Capacitor App plugin
    // This is handled in initializeCapacitor()
    const handleAppStateChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      setIsActive(customEvent.detail?.isActive ?? true);
    };

    window.addEventListener('appStateChange', handleAppStateChange);
    return () => window.removeEventListener('appStateChange', handleAppStateChange);
  }, []);

  return { isActive };
}

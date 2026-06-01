import { toast, type ExternalToast } from 'sonner';
import { Capacitor } from '@capacitor/core';

/**
 * Light haptic tap when a toast appears on a native device. Dynamically
 * imported and fire-and-forget so it's a no-op (and zero cost) on the web.
 */
function haptic() {
  if (!Capacitor.isNativePlatform()) return;
  import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {});
}

/**
 * App-wide message system. Use this instead of calling sonner directly so
 * haptics and theming stay centralized. Works the same on web and inside the
 * Capacitor webview.
 */
export const notify = {
  success: (message: string, opts?: ExternalToast) => {
    haptic();
    return toast.success(message, opts);
  },
  error: (message: string, opts?: ExternalToast) => {
    haptic();
    return toast.error(message, opts);
  },
  info: (message: string, opts?: ExternalToast) => {
    haptic();
    return toast.info(message, opts);
  },
  message: (message: string, opts?: ExternalToast) => {
    haptic();
    return toast.message(message, opts);
  },
};

import { isSupportedLocale, type AppLocale } from '@/types/locale';
import { isNativePlatform } from '@/lib/utils';

/** Map a BCP-47-ish tag ("en-US", "DE") to a supported AppLocale, or null. */
export function localeFromTag(tag: string | null | undefined): AppLocale | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split('-')[0];
  return isSupportedLocale(base) ? base : null;
}

/** Synchronous best guess from the browser. Returns null on SSR or when unsupported. */
export function detectBrowserLocale(): AppLocale | null {
  if (typeof navigator === 'undefined') return null;
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const c of candidates) {
    const loc = localeFromTag(c);
    if (loc) return loc;
  }
  return null;
}

/** Device language on native (Capacitor); null on web or on any failure. */
export async function detectDeviceLocale(): Promise<AppLocale | null> {
  if (!isNativePlatform()) return null;
  try {
    const { Device } = await import('@capacitor/device');
    const { value } = await Device.getLanguageCode();
    return localeFromTag(value);
  } catch {
    return null;
  }
}

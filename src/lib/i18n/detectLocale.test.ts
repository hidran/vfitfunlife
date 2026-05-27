import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/utils', () => ({ isNativePlatform: vi.fn() }));
vi.mock('@capacitor/device', () => ({ Device: { getLanguageCode: vi.fn() } }));

import { isNativePlatform } from '@/lib/utils';
import { Device } from '@capacitor/device';
import { localeFromTag, detectBrowserLocale, detectDeviceLocale } from './detectLocale';

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.unstubAllGlobals(); });

describe('localeFromTag', () => {
  it('maps base tags to supported locales', () => {
    expect(localeFromTag('en-US')).toBe('en');
    expect(localeFromTag('de')).toBe('de');
    expect(localeFromTag('IT')).toBe('it');
    expect(localeFromTag('pt-BR')).toBeNull();
    expect(localeFromTag('')).toBeNull();
    expect(localeFromTag(null)).toBeNull();
  });
});

describe('detectBrowserLocale', () => {
  it('returns the first supported navigator language', () => {
    vi.stubGlobal('navigator', { language: 'pt-BR', languages: ['pt-BR', 'fr-FR', 'en'] });
    expect(detectBrowserLocale()).toBe('fr');
  });
  it('returns null when none supported', () => {
    vi.stubGlobal('navigator', { language: 'pt-BR', languages: ['pt-BR'] });
    expect(detectBrowserLocale()).toBeNull();
  });
});

describe('detectDeviceLocale', () => {
  it('returns null on web (not native)', async () => {
    vi.mocked(isNativePlatform).mockReturnValue(false);
    expect(await detectDeviceLocale()).toBeNull();
    expect(Device.getLanguageCode).not.toHaveBeenCalled();
  });
  it('maps the device language code on native', async () => {
    vi.mocked(isNativePlatform).mockReturnValue(true);
    vi.mocked(Device.getLanguageCode).mockResolvedValue({ value: 'de' } as never);
    expect(await detectDeviceLocale()).toBe('de');
  });
  it('returns null when the device call throws', async () => {
    vi.mocked(isNativePlatform).mockReturnValue(true);
    vi.mocked(Device.getLanguageCode).mockRejectedValue(new Error('no plugin'));
    expect(await detectDeviceLocale()).toBeNull();
  });
});

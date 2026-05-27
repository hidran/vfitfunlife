export const SUPPORTED_LOCALES = ['it', 'en', 'es', 'fr', 'de'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'it';

export const LOCALE_LABELS: Record<AppLocale, string> = {
  it: 'Italiano',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

export function isSupportedLocale(value: string): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

export function toLocaleTag(locale: AppLocale): string {
  switch (locale) {
    case 'it':
      return 'it-IT';
    case 'en':
      return 'en-US';
    case 'es':
      return 'es-ES';
    case 'fr':
      return 'fr-FR';
    case 'de':
      return 'de-DE';
    default:
      return 'it-IT';
  }
}

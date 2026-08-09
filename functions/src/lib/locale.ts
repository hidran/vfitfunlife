const LOCALE_LANGUAGE: Record<string, string> = {
  it: "Italian",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
};

/** Map a locale code to a human-readable language name (falls back to the raw code). */
export function localeLanguage(locale: string): string {
  return LOCALE_LANGUAGE[locale] ?? locale;
}

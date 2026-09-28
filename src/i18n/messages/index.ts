import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isSupportedLocale,
  type AppLocale,
} from '@/types/locale';
import { itMessages, type MessageKey, type Messages } from './it';

export type { MessageKey, Messages };

// Deliberately not `Exclude<AppLocale, typeof DEFAULT_LOCALE>`: DEFAULT_LOCALE is typed as
// the widened `AppLocale` (not the literal 'it'), which would exclude nothing and collapse
// this to `never`. The 'it' literal here must be kept in sync with DEFAULT_LOCALE's value.
type LazyLocale = Exclude<AppLocale, 'it'>;

// Non-Italian dictionaries are ~170 KB each (795 KB combined) and were previously all
// bundled statically. Only Italian (the fallback/source locale) ships in the initial
// bundle; the other four load on demand, one dynamic-import chunk per locale.
const lazyLoaders: Record<LazyLocale, () => Promise<Messages>> = {
  en: () => import('./en').then((m) => m.enMessages),
  es: () => import('./es').then((m) => m.esMessages),
  fr: () => import('./fr').then((m) => m.frMessages),
  de: () => import('./de').then((m) => m.deMessages),
};

function isLazyLocale(locale: AppLocale): locale is LazyLocale {
  return locale !== DEFAULT_LOCALE;
}

// Cache of resolved dictionaries. Italian is always present; others are added once loaded.
const cache = new Map<AppLocale, Messages>([[DEFAULT_LOCALE, itMessages]]);
const pending = new Map<LazyLocale, Promise<Messages>>();

/** Already-resolved messages for `locale`, if loaded, without triggering a fetch. */
export function getCachedMessages(locale: AppLocale): Messages | undefined {
  return cache.get(locale);
}

/**
 * Resolves (and caches) the dictionary for `locale`, dynamically importing its per-locale
 * chunk on first use. Italian resolves immediately — it's statically bundled as the
 * fallback/source locale. Safe to call repeatedly; concurrent calls for the same
 * not-yet-loaded locale share one in-flight import.
 */
export function loadMessages(locale: AppLocale): Promise<Messages> {
  const cached = cache.get(locale);
  if (cached) return Promise.resolve(cached);
  if (!isLazyLocale(locale)) return Promise.resolve(itMessages);

  let promise = pending.get(locale);
  if (!promise) {
    // `.finally` clears the in-flight entry on failure too (not just success), so a
    // network hiccup doesn't permanently wedge this locale behind one rejected promise —
    // the next call retries the dynamic import instead of replaying the old failure.
    promise = lazyLoaders[locale]()
      .then((messages) => {
        cache.set(locale, messages);
        return messages;
      })
      .finally(() => {
        pending.delete(locale);
      });
    pending.set(locale, promise);
  }
  return promise;
}

/**
 * Synchronous lookup used by `t()`. Falls back to Italian (and then the raw key) when
 * `locale`'s dictionary hasn't finished loading yet — callers that need to avoid ever
 * rendering with the wrong locale should `await loadMessages(locale)` before switching,
 * which is what I18nContext's `setLocale` does.
 */
export function getMessage(locale: AppLocale, key: MessageKey): string {
  const messages = cache.get(locale) ?? itMessages;
  return messages[key] ?? itMessages[key] ?? key;
}

// Kick off the dynamic import for a previously-chosen non-Italian locale as soon as this
// module is evaluated (during hydration), rather than waiting for I18nProvider's mount
// effect to run after first paint. By the time that effect (or a manual language switch)
// calls loadMessages(), the chunk is often already in flight or resolved.
if (typeof window !== 'undefined') {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isSupportedLocale(stored) && stored !== DEFAULT_LOCALE) {
      // Swallow failures here — I18nContext's own mount effect re-awaits loadMessages()
      // and logs/handles a load failure there; this is purely a head start.
      loadMessages(stored).catch(() => {});
    }
  } catch {
    // localStorage unavailable (private browsing, etc.) — I18nContext's own effects
    // fall back to browser/device detection and will load whatever locale they pick.
  }
}

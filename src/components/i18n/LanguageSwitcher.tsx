'use client';

import { Globe } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useChangeLocale } from '@/hooks/useChangeLocale';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  /**
   * `row` — one button per locale (settings screens).
   * `menu` — globe + native select with the full locale name.
   * `icon` — 44px square showing the current locale code; the native select is
   *   overlaid invisibly so the OS picker opens (collapsed sidebars).
   */
  variant?: 'row' | 'menu' | 'icon';
  /** `light` for surfaces that stay light regardless of theme (customer drawer). */
  tone?: 'auto' | 'light';
  className?: string;
}

const localeFlags = {
  it: '🇮🇹',
  en: '🇬🇧',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
} as const;

export function LanguageSwitcher({ variant = 'row', tone = 'auto', className }: LanguageSwitcherProps) {
  const { locale, locales, localeLabels, t } = useI18n();
  const changeLocale = useChangeLocale();
  const light = tone === 'light';

  if (variant === 'icon') {
    return (
      <div
        className={cn(
          'relative inline-flex min-h-11 min-w-11 flex-col items-center justify-center rounded-xl border transition-colors',
          'focus-within:ring-2 focus-within:ring-section-primary',
          light
            ? 'border-slate-200 bg-white text-slate-600'
            : 'border-hairline bg-surface-2 text-content-muted',
          className
        )}
        title={localeLabels[locale]}
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase leading-none" aria-hidden="true">
          {locale}
        </span>
        <select
          aria-label={t('common.language')}
          value={locale}
          onChange={(e) => changeLocale(e.target.value as typeof locale)}
          className="absolute -inset-px cursor-pointer appearance-none opacity-0"
        >
          {locales.map((l) => (
            <option key={l} value={l} className="text-black">
              {localeFlags[l]} {localeLabels[l]}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (variant === 'menu') {
    return (
      <div className={cn('relative inline-flex items-center', className)}>
        <Globe
          className={cn(
            'pointer-events-none absolute left-2 h-4 w-4',
            light ? 'text-slate-500' : 'text-content-muted'
          )}
          aria-hidden="true"
        />
        <select
          aria-label={t('common.language')}
          value={locale}
          onChange={(e) => changeLocale(e.target.value as typeof locale)}
          className={cn(
            'min-h-11 appearance-none rounded-lg border py-2 pl-8 pr-3 text-xs font-semibold uppercase focus:ring-2 focus:ring-section-primary focus:outline-none cursor-pointer',
            light
              ? 'border-slate-200 bg-white text-slate-700'
              : 'border-hairline bg-surface-2 text-content'
          )}
        >
          {locales.map((l) => (
            <option key={l} value={l} className="text-black">
              {localeFlags[l]} {localeLabels[l]}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => changeLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            'min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold uppercase transition-colors',
            locale === l
              ? 'border-section-primary bg-section-primary text-background-dark'
              : 'border-white/15 bg-white/5 text-text-tertiary'
          )}
        >
          <span className="mr-1" aria-hidden="true">
            {localeFlags[l]}
          </span>
          {localeLabels[l]}
        </button>
      ))}
    </div>
  );
}

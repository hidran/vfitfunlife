'use client';

import { Globe } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useChangeLocale } from '@/hooks/useChangeLocale';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  variant?: 'row' | 'menu';
  className?: string;
}

const localeFlags = {
  it: '🇮🇹',
  en: '🇬🇧',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
} as const;

export function LanguageSwitcher({ variant = 'row', className }: LanguageSwitcherProps) {
  const { locale, locales, localeLabels, t } = useI18n();
  const changeLocale = useChangeLocale();

  if (variant === 'menu') {
    return (
      <div className={cn('relative inline-flex items-center', className)}>
        <Globe className="pointer-events-none absolute left-2 h-4 w-4 text-content-muted" />
        <select
          aria-label={t('common.language')}
          value={locale}
          onChange={(e) => changeLocale(e.target.value as typeof locale)}
          className="appearance-none rounded-lg border border-hairline bg-surface-2 py-2 pl-8 pr-3 text-xs font-semibold uppercase text-content focus:ring-2 focus:ring-section-primary focus:outline-none cursor-pointer"
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
          className={cn(
            'rounded-xl border px-3 py-2 text-xs font-semibold uppercase transition-colors',
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

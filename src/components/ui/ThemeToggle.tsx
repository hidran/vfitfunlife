'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface ThemeToggleProps {
  className?: string;
  /** Segmented control: hide the text labels, icons only. */
  compact?: boolean;
  /**
   * `segmented` (default) shows light / dark / system side by side.
   * `cycle` is a single 44px icon button that steps light → dark → system,
   * for tight spots such as a collapsed sidebar.
   */
  variant?: 'segmented' | 'cycle';
  /**
   * `auto` (default) follows the theme tokens. `light` is for surfaces that
   * are always light regardless of theme (the customer side drawer).
   */
  tone?: 'auto' | 'light';
}

const ORDER: ThemePreference[] = ['light', 'dark', 'system'];

export function ThemeToggle({
  className,
  compact = false,
  variant = 'segmented',
  tone = 'auto',
}: ThemeToggleProps) {
  const { preference, setTheme } = useTheme();
  const { t } = useI18n();

  const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('settings.theme.light'), icon: Sun },
    { value: 'dark', label: t('settings.theme.dark'), icon: Moon },
    { value: 'system', label: t('settings.theme.system'), icon: Monitor },
  ];

  const light = tone === 'light';

  if (variant === 'cycle') {
    const current = options.find((o) => o.value === preference) ?? options[2];
    const nextValue = ORDER[(ORDER.indexOf(current.value) + 1) % ORDER.length];
    const next = options.find((o) => o.value === nextValue)!;
    const label = t('settings.theme.cycle', { current: current.label, next: next.label });
    return (
      <button
        type="button"
        onClick={() => setTheme(next.value)}
        aria-label={label}
        title={label}
        data-theme-preference={current.value}
        className={cn(
          'inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-section-primary',
          light
            ? 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
            : 'border-hairline bg-surface-2 text-content-muted hover:text-content',
          className
        )}
      >
        <current.icon className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('settings.appearance')}
      className={cn(
        'inline-flex rounded-xl border p-1',
        light ? 'border-slate-200 bg-white' : 'border-hairline bg-surface-2',
        className
      )}
    >
      {options.map((opt) => {
        const active = preference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-pressed={active}
            aria-label={opt.label}
            title={opt.label}
            className={cn(
              'flex min-h-11 min-w-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-section-primary',
              active
                ? 'bg-vfit-primary/20 text-vfit-primary'
                : light
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-content-muted hover:text-content'
            )}
          >
            <opt.icon className="h-4 w-4" aria-hidden="true" />
            {!compact && opt.label}
          </button>
        );
      })}
    </div>
  );
}

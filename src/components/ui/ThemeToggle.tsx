'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { preference, setTheme } = useTheme();
  const { t } = useI18n();

  const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('settings.theme.light'), icon: Sun },
    { value: 'dark', label: t('settings.theme.dark'), icon: Moon },
    { value: 'system', label: t('settings.theme.system'), icon: Monitor },
  ];

  return (
    <div
      role="group"
      aria-label={t('settings.appearance')}
      className={cn('inline-flex rounded-xl border border-hairline bg-surface-2 p-1', className)}
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
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-vfit-primary/20 text-vfit-primary'
                : 'text-content-muted hover:text-content'
            )}
          >
            <opt.icon className="h-4 w-4" />
            {!compact && opt.label}
          </button>
        );
      })}
    </div>
  );
}

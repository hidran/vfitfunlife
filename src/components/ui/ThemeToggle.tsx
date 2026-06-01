'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('settings.theme.light'), icon: Sun },
    { value: 'dark', label: t('settings.theme.dark'), icon: Moon },
  ];

  return (
    <div
      role="group"
      aria-label={t('settings.appearance')}
      className={cn('inline-flex rounded-xl border border-white/10 bg-white/5 p-1', className)}
    >
      {options.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-vfit-primary/20 text-vfit-primary'
                : 'text-text-secondary hover:text-text-inverse'
            )}
          >
            <opt.icon className="h-4 w-4" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

'use client';

import { useServiceCategories } from '@/hooks/useServiceCategories';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface ProviderOptInFieldProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  categories: string[];
  onChangeCategories: (categories: string[]) => void;
}

export function ProviderOptInField({ enabled, onToggle, categories, onChangeCategories }: ProviderOptInFieldProps) {
  const { t } = useI18n();
  const options = useServiceCategories();

  const toggle = (name: string) =>
    onChangeCategories(
      categories.includes(name) ? categories.filter((n) => n !== name) : [...categories, name]
    );

  return (
    <div className="mt-4 rounded-xl border border-white/10 p-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-5 h-5 accent-vfit-primary"
        />
        <span className="text-sm text-white">
          {t('provider.optIn.toggle')}
        </span>
      </label>

      {enabled && (
        <div className="mt-3">
          <p className="text-sm text-white/60 mb-2">{t('provider.optIn.pickServices')}</p>
          <div className="flex flex-wrap gap-2">
            {options.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.name)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm border transition-colors',
                  categories.includes(c.name)
                    ? 'border-vfit-primary bg-vfit-primary/10 text-white'
                    : 'border-white/10 text-white/70 hover:bg-white/5'
                )}
              >
                <span className="mr-1">{c.icon}</span>{c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

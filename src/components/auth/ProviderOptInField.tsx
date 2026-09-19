'use client';

import { useI18n } from '@/hooks/useI18n';
import { CategoryLeafPicker } from '@/components/provider/CategoryLeafPicker';

interface ProviderOptInFieldProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Requested taxonomy leaf ids. */
  categoryIds: string[];
  onChangeCategoryIds: (categoryIds: string[]) => void;
}

export function ProviderOptInField({ enabled, onToggle, categoryIds, onChangeCategoryIds }: ProviderOptInFieldProps) {
  const { t } = useI18n();

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
          <CategoryLeafPicker value={categoryIds} onChange={onChangeCategoryIds} />
        </div>
      )}
    </div>
  );
}

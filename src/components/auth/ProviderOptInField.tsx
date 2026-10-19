'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { CategoryLeafPicker } from '@/components/provider/CategoryLeafPicker';
import { ProviderTypeChoice } from '@/components/provider/ProviderTypeChoice';
import type { ProviderType } from '@/types/firebase';

interface ProviderOptInFieldProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Requested taxonomy leaf ids. */
  categoryIds: string[];
  onChangeCategoryIds: (categoryIds: string[]) => void;
  /**
   * Individual or company. The "Individual / Company or association" choice is shown only when
   * `onChangeProviderType` is given.
   */
  providerType?: ProviderType;
  onChangeProviderType?: (providerType: ProviderType) => void;
  /** Shown under the choice while 'business' is selected: the company details form. */
  businessDetails?: ReactNode;
  /** Disables the individual/company choice (e.g. while submitting). */
  disabled?: boolean;
}

export function ProviderOptInField({
  enabled,
  onToggle,
  categoryIds,
  onChangeCategoryIds,
  providerType = 'individual',
  onChangeProviderType,
  businessDetails,
  disabled,
}: ProviderOptInFieldProps) {
  const { t } = useI18n();

  return (
    <div className="auth-provider-opt-in mt-4 min-w-0 rounded-xl border border-white/10 p-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-5 h-5 accent-vfit-primary"
        />
        <span className="auth-provider-toggle text-sm text-white">
          {t('provider.optIn.toggle')}
        </span>
      </label>

      {enabled && onChangeProviderType && (
        <div className="mt-4 space-y-4">
          <ProviderTypeChoice value={providerType} onChange={onChangeProviderType} disabled={disabled} />
          {/* Hidden, not unmounted: switching back and forth keeps what was typed. */}
          {businessDetails && <div hidden={providerType !== 'business'}>{businessDetails}</div>}
        </div>
      )}

      {enabled && (
        <div className="mt-3">
          <p className="auth-provider-help text-sm text-white/60 mb-2">{t('provider.optIn.pickServices')}</p>
          <CategoryLeafPicker value={categoryIds} onChange={onChangeCategoryIds} />
        </div>
      )}
    </div>
  );
}

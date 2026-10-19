'use client';

import { useI18n } from '@/hooks/useI18n';
import { CategoryLeafPicker } from '@/components/provider/CategoryLeafPicker';
import { ProviderTypeToggle } from '@/components/provider/ProviderTypeToggle';
import { BusinessDetailsForm } from '@/components/provider/BusinessDetailsForm';
import type { BusinessDetailsErrors, BusinessDetailsField, BusinessDetailsValues } from '@/lib/businessDetails';
import type { ProviderType } from '@/types/firebase';

interface ProviderOptInFieldProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Requested taxonomy leaf ids. */
  categoryIds: string[];
  onChangeCategoryIds: (categoryIds: string[]) => void;
  providerType: ProviderType;
  onChangeProviderType: (providerType: ProviderType) => void;
  business: BusinessDetailsValues;
  onChangeBusiness: (business: BusinessDetailsValues) => void;
  businessErrors?: BusinessDetailsErrors;
  onClearBusinessError?: (field: BusinessDetailsField) => void;
  disabled?: boolean;
}

export function ProviderOptInField({
  enabled,
  onToggle,
  categoryIds,
  onChangeCategoryIds,
  providerType,
  onChangeProviderType,
  business,
  onChangeBusiness,
  businessErrors,
  onClearBusinessError,
  disabled,
}: ProviderOptInFieldProps) {
  const { t } = useI18n();

  return (
    <div className="auth-provider-opt-in mt-4 rounded-xl border border-white/10 p-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-5 h-5 accent-vfit-primary"
        />
        <span className="auth-provider-toggle text-sm text-white">
          {t('provider.optIn.toggle')}
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-4">
          <ProviderTypeToggle value={providerType} onChange={onChangeProviderType} disabled={disabled} />

          {providerType === 'business' && (
            <BusinessDetailsForm
              values={business}
              onChange={onChangeBusiness}
              errors={businessErrors}
              onClearError={onClearBusinessError}
              disabled={disabled}
            />
          )}

          <div>
            <p className="auth-provider-help text-sm text-white/60 mb-2">{t('provider.optIn.pickServices')}</p>
            <CategoryLeafPicker value={categoryIds} onChange={onChangeCategoryIds} disabled={disabled} />
          </div>
        </div>
      )}
    </div>
  );
}

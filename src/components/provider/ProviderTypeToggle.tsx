'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { ProviderType } from '@/types/firebase';

interface ProviderTypeToggleProps {
  value: ProviderType;
  onChange: (value: ProviderType) => void;
  disabled?: boolean;
}

const OPTIONS: readonly ProviderType[] = ['individual', 'business'];

/**
 * "Individual / Company" segmented control shown once someone opts in as a professional.
 * A radiogroup of two 44px buttons: the choice decides whether the company fields appear
 * and whether the application auto-approves (individual) or waits for an admin (company).
 */
export function ProviderTypeToggle({ value, onChange, disabled }: ProviderTypeToggleProps) {
  const { t } = useI18n();
  const labelId = useId();

  return (
    <div className="provider-type-toggle">
      <p id={labelId} className="mb-2 text-xs font-semibold text-content-muted">
        {t('provider.type.label')}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-2 gap-1 rounded-xl border border-hairline bg-surface p-1"
      >
        {OPTIONS.map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option)}
              className={cn(
                'min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors',
                selected
                  ? 'bg-vfit-primary/15 text-content border border-vfit-primary'
                  : 'border border-transparent text-content-muted hover:bg-content/5'
              )}
            >
              {t(option === 'individual' ? 'provider.type.individual' : 'provider.type.business')}
            </button>
          );
        })}
      </div>
      {value === 'business' && (
        <p className="mt-2 text-xs text-content-muted">{t('provider.type.businessHint')}</p>
      )}
    </div>
  );
}

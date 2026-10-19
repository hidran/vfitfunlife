'use client';

import { useId, useRef, type KeyboardEvent } from 'react';
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
 *
 * Follows the WAI-ARIA radio group pattern: only the checked radio is a tab stop, and the
 * arrow keys (left/up = previous, right/down = next, wrapping) move the selection and focus.
 */
export function ProviderTypeToggle({ value, onChange, disabled }: ProviderTypeToggleProps) {
  const { t } = useI18n();
  const labelId = useId();
  const refs = useRef<Record<ProviderType, HTMLButtonElement | null>>({ individual: null, business: null });

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : 0;
    if (!step) return;
    event.preventDefault();
    const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length];
    onChange(next);
    refs.current[next]?.focus();
  };

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
        {OPTIONS.map((option, index) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              ref={(el) => { refs.current[option] = el; }}
              onKeyDown={(e) => onKeyDown(e, index)}
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

'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import type { ProviderType } from '@/types/firebase';

const OPTIONS: { value: ProviderType; labelKey: MessageKey }[] = [
  { value: 'individual', labelKey: 'provider.optIn.typeIndividual' },
  { value: 'business', labelKey: 'provider.optIn.typeBusiness' },
];

interface ProviderTypeChoiceProps {
  value: ProviderType;
  onChange: (value: ProviderType) => void;
  disabled?: boolean;
}

/**
 * "Individual / Company or association" as a two-option segmented control.
 *
 * Native radio inputs (visually hidden, one shared name) under a fieldset/legend: the browser
 * gives the radio-group semantics, the label and the arrow-key navigation for free. Each
 * option is at least 44px tall and its label may wrap. Side by side from 380px; below that
 * (320px phones, where each half would be ~115px with the check mark eating into it) the two
 * options stack, so a long word like "professionista" never has to break mid-word.
 */
export function ProviderTypeChoice({ value, onChange, disabled }: ProviderTypeChoiceProps) {
  const { t } = useI18n();
  const name = useId();

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-content break-words">
        {t('provider.optIn.typeLegend')}
      </legend>
      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        {OPTIONS.map((option) => {
          const checked = value === option.value;
          return (
            <label key={option.value} className="min-w-0 cursor-pointer">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-full min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-center text-sm break-words transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-section-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
                  checked
                    ? 'border-vfit-primary bg-vfit-primary/15 font-semibold text-content'
                    : 'border-hairline bg-surface text-content hover:bg-content/5'
                )}
              >
                {checked && <Check aria-hidden className="h-4 w-4 shrink-0" />}
                <span className="min-w-0">{t(option.labelKey)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

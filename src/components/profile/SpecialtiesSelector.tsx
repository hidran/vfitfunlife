'use client';

import { useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { updateProviderSpecialties } from '@/lib/firebase/auth';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

interface SpecialtiesSelectorProps {
  userId: string;
  specialties: string[];
  availableSpecialties: string[];
  labelKeysByValue?: Partial<Record<string, MessageKey>>;
  onUpdate?: (specialties: string[]) => void;
  className?: string;
}

export function SpecialtiesSelector({
  userId,
  specialties,
  availableSpecialties,
  labelKeysByValue,
  onUpdate,
  className,
}: SpecialtiesSelectorProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>(specialties);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const serializeSelection = (values: string[]) => [...values].sort().join('|');

  const toggleSpecialty = (specialty: string) => {
    const newSelected = selected.includes(specialty)
      ? selected.filter((s) => s !== specialty)
      : [...selected, specialty];
    setSelected(newSelected);
    setHasChanges(serializeSelection(newSelected) !== serializeSelection(specialties));
    setError(null);
  };

  const handleSave = async () => {
    if (selected.length === 0) {
      setError(t('profile.specialties.error.minOne'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await updateProviderSpecialties(userId, selected);
      onUpdate?.(selected);
      setHasChanges(false);
    } catch (err) {
      console.error('Error saving specialties:', err);
      setError(t('profile.specialties.error.save'));
    } finally {
      setIsLoading(false);
    }
  };

  const getSpecialtyLabel = (specialty: string) => {
    const labelKey = labelKeysByValue?.[specialty];
    return labelKey ? t(labelKey) : specialty;
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-section-primary" size={20} />
          <h3 className="text-sm font-medium text-text-tertiary">
            {t('profile.specialties.title', { count: selected.length })}
          </h3>
        </div>
        {hasChanges && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={isLoading}
            disabled={isLoading}
          >
            <Check size={16} className="mr-1" />
            {t('profile.specialties.save')}
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {availableSpecialties.map((specialty) => {
          const isSelected = selected.includes(specialty);
          return (
            <button
              key={specialty}
              onClick={() => toggleSpecialty(specialty)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                isSelected
                  ? 'bg-section-gradient text-white shadow-lg'
                  : 'bg-background-secondary/20 text-text-secondary hover:bg-background-secondary/30 border border-hairline'
              )}
            >
              <span className="flex items-center gap-1.5">
                {isSelected && <Check size={12} />}
                {getSpecialtyLabel(specialty)}
              </span>
            </button>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-sm text-text-tertiary italic">
          {t('profile.specialties.emptyHint')}
        </p>
      )}
    </div>
  );
}

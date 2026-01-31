'use client';

import { useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { updateProviderSpecialties } from '@/lib/firebase/auth';

interface SpecialtiesSelectorProps {
  userId: string;
  specialties: string[];
  availableSpecialties: string[];
  onUpdate?: (specialties: string[]) => void;
  className?: string;
}

export function SpecialtiesSelector({
  userId,
  specialties,
  availableSpecialties,
  onUpdate,
  className,
}: SpecialtiesSelectorProps) {
  const [selected, setSelected] = useState<string[]>(specialties);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const toggleSpecialty = (specialty: string) => {
    const newSelected = selected.includes(specialty)
      ? selected.filter((s) => s !== specialty)
      : [...selected, specialty];
    setSelected(newSelected);
    setHasChanges(JSON.stringify(newSelected.sort()) !== JSON.stringify(specialties.sort()));
    setError(null);
  };

  const handleSave = async () => {
    if (selected.length === 0) {
      setError('Seleziona almeno una specializzazione');
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
      setError('Errore durante il salvataggio. Riprova.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-section-primary" size={20} />
          <h3 className="text-sm font-medium text-text-tertiary">
            Specializzazioni ({selected.length})
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
            Salva
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
                  : 'bg-background-secondary/20 text-text-secondary hover:bg-background-secondary/30 border border-white/10'
              )}
            >
              <span className="flex items-center gap-1.5">
                {isSelected && <Check size={12} />}
                {specialty}
              </span>
            </button>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-sm text-text-tertiary italic">
          Seleziona le tue specializzazioni
        </p>
      )}
    </div>
  );
}

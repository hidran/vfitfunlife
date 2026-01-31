'use client';

import { useState } from 'react';
import { Languages, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { updateProviderLanguages } from '@/lib/firebase/auth';

interface Language {
  code: string;
  name: string;
  flag: string;
}

interface LanguagesSelectorProps {
  userId: string;
  languages: string[];
  onUpdate?: (languages: string[]) => void;
  className?: string;
}

const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];

export function LanguagesSelector({
  userId,
  languages,
  onUpdate,
  className,
}: LanguagesSelectorProps) {
  const [selected, setSelected] = useState<string[]>(languages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const toggleLanguage = (code: string) => {
    const newSelected = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code];
    setSelected(newSelected);
    setHasChanges(JSON.stringify(newSelected.sort()) !== JSON.stringify(languages.sort()));
    setError(null);
  };

  const handleSave = async () => {
    if (selected.length === 0) {
      setError('Seleziona almeno una lingua');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await updateProviderLanguages(userId, selected);
      onUpdate?.(selected);
      setHasChanges(false);
    } catch (err) {
      console.error('Error saving languages:', err);
      setError('Errore durante il salvataggio. Riprova.');
    } finally {
      setIsLoading(false);
    }
  };

  const getLanguageName = (code: string): string => {
    return AVAILABLE_LANGUAGES.find((l) => l.code === code)?.name || code;
  };

  const getLanguageFlag = (code: string): string => {
    return AVAILABLE_LANGUAGES.find((l) => l.code === code)?.flag || '🌐';
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Languages className="text-section-primary" size={20} />
          <h3 className="text-sm font-medium text-text-tertiary">
            Lingue ({selected.length})
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
        {AVAILABLE_LANGUAGES.map((language) => {
          const isSelected = selected.includes(language.code);
          return (
            <button
              key={language.code}
              onClick={() => toggleLanguage(language.code)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2',
                isSelected
                  ? 'bg-section-gradient text-white shadow-lg'
                  : 'bg-background-secondary/20 text-text-secondary hover:bg-background-secondary/30 border border-white/10'
              )}
            >
              <span>{language.flag}</span>
              <span>{language.name}</span>
              {isSelected && <Check size={12} />}
            </button>
          );
        })}
      </div>

      {/* Selected Languages Display */}
      {selected.length > 0 && (
        <div className="pt-2 border-t border-white/10">
          <p className="text-xs text-text-tertiary mb-2">Lingue selezionate:</p>
          <div className="flex flex-wrap gap-1">
            {selected.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-section-gradient/10 text-section-primary text-xs border border-section-primary/20"
              >
                <span>{getLanguageFlag(code)}</span>
                <span>{getLanguageName(code)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {selected.length === 0 && (
        <p className="text-sm text-text-tertiary italic">
          Seleziona le lingue che parli
        </p>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { FileText, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { updateProviderProfile } from '@/lib/firebase/auth';

interface CancellationPolicyEditorProps {
  userId: string;
  policy: string | null;
  onUpdate?: (policy: string) => void;
  className?: string;
}

const PRESET_POLICIES = [
  {
    label: 'Flessibile',
    value: 'Cancellazione gratuita fino a 24 ore prima dell\'appuntamento. Oltre questo termine, verrà addebitato il 50% del costo del servizio.',
  },
  {
    label: 'Moderata',
    value: 'Cancellazione gratuita fino a 48 ore prima dell\'appuntamento. Oltre questo termine, verrà addebitato il 50% del costo del servizio.',
  },
  {
    label: 'Rigorosa',
    value: 'Cancellazione gratuita fino a 72 ore prima dell\'appuntamento. Cancellazioni tardive o mancata presentazione comporteranno l\'addebito del 100% del costo del servizio.',
  },
];

export function CancellationPolicyEditor({
  userId,
  policy,
  onUpdate,
  className,
}: CancellationPolicyEditorProps) {
  const [currentPolicy, setCurrentPolicy] = useState(policy || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!currentPolicy.trim()) {
      setError('Inserisci una politica di cancellazione');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateProviderProfile(userId, {
        cancellationPolicy: currentPolicy.trim(),
      });
      onUpdate?.(currentPolicy.trim());
      setSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving cancellation policy:', err);
      setError('Errore durante il salvataggio. Riprova.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectPreset = (value: string) => {
    setCurrentPolicy(value);
    setError(null);
  };

  const charCount = currentPolicy.length;
  const maxChars = 500;

  if (!isEditing) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="text-section-primary" size={20} />
            <h3 className="text-sm font-medium text-text-tertiary">
              Politica di Cancellazione
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            {policy ? 'Modifica' : 'Aggiungi'}
          </Button>
        </div>

        {policy ? (
          <div className="p-4 rounded-xl bg-background-secondary/5 border border-white/5">
            <p className="text-sm text-text-secondary whitespace-pre-wrap">
              {policy}
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-background-secondary/5 border border-dashed border-white/10 text-center">
            <AlertCircle size={24} className="text-text-tertiary/50 mx-auto mb-2" />
            <p className="text-sm text-text-tertiary">
              Nessuna politica di cancellazione impostata
            </p>
            <p className="text-xs text-text-tertiary/70 mt-1">
              Imposta le regole per le cancellazioni
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="text-section-primary" size={20} />
          <h3 className="text-sm font-medium text-text-tertiary">
            Modifica Politica di Cancellazione
          </h3>
        </div>
      </div>

      {/* Preset Options */}
      <div className="space-y-2">
        <p className="text-xs text-text-tertiary">Scegli un modello:</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_POLICIES.map((preset) => (
            <button
              key={preset.label}
              onClick={() => selectPreset(preset.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                currentPolicy === preset.value
                  ? 'bg-section-gradient text-white'
                  : 'bg-background-secondary/20 text-text-secondary hover:bg-background-secondary/30'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text Area */}
      <div>
        <textarea
          value={currentPolicy}
          onChange={(e) => {
            setCurrentPolicy(e.target.value);
            setError(null);
          }}
          placeholder="Descrivi la tua politica di cancellazione..."
          rows={4}
          maxLength={maxChars}
          className={cn(
            'w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-text-tertiary',
            'focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent',
            'transition-all duration-200 resize-none',
            error && 'border-error ring-1 ring-error'
          )}
        />
        <div className="flex justify-between mt-1">
          {error ? (
            <span className="text-xs text-error">{error}</span>
          ) : (
            <span />
          )}
          <span className={cn(
            'text-xs',
            charCount > maxChars * 0.9 ? 'text-warning-DEFAULT' : 'text-text-tertiary'
          )}>
            {charCount}/{maxChars}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={() => {
            setIsEditing(false);
            setCurrentPolicy(policy || '');
            setError(null);
          }}
          disabled={isSaving}
        >
          Annulla
        </Button>
        <Button
          variant="primary"
          size="sm"
          fullWidth
          onClick={handleSave}
          isLoading={isSaving}
          disabled={isSaving || !currentPolicy.trim()}
        >
          <Check size={16} className="mr-1" />
          Salva
        </Button>
      </div>

      {success && (
        <p className="text-sm text-success-DEFAULT text-center">
          Politica salvata con successo!
        </p>
      )}
    </div>
  );
}

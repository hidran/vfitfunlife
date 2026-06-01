'use client';

import { useState } from 'react';
import { FileText, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { updateProviderProfile } from '@/lib/firebase/auth';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

interface CancellationPolicyEditorProps {
  userId: string;
  policy: string | null;
  onUpdate?: (policy: string) => void;
  className?: string;
}

const PRESET_POLICIES: Array<{ labelKey: MessageKey; valueKey: MessageKey }> = [
  {
    labelKey: 'profile.cancellation.preset.flexible.label',
    valueKey: 'profile.cancellation.preset.flexible.value',
  },
  {
    labelKey: 'profile.cancellation.preset.moderate.label',
    valueKey: 'profile.cancellation.preset.moderate.value',
  },
  {
    labelKey: 'profile.cancellation.preset.strict.label',
    valueKey: 'profile.cancellation.preset.strict.value',
  },
];

export function CancellationPolicyEditor({
  userId,
  policy,
  onUpdate,
  className,
}: CancellationPolicyEditorProps) {
  const { t } = useI18n();
  const [currentPolicy, setCurrentPolicy] = useState(policy || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!currentPolicy.trim()) {
      setError(t('profile.cancellation.error.required'));
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
      setError(t('profile.cancellation.error.save'));
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
            {t('profile.cancellation.title')}
          </h3>
        </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            {policy ? t('profile.cancellation.edit') : t('profile.cancellation.add')}
          </Button>
        </div>

        {policy ? (
          <div className="p-4 rounded-xl bg-background-secondary/5 border border-hairline">
            <p className="text-sm text-text-secondary whitespace-pre-wrap">
              {policy}
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-background-secondary/5 border border-dashed border-hairline text-center">
            <AlertCircle size={24} className="text-text-tertiary/50 mx-auto mb-2" />
            <p className="text-sm text-text-tertiary">
              {t('profile.cancellation.empty')}
            </p>
            <p className="text-xs text-text-tertiary/70 mt-1">
              {t('profile.cancellation.emptyHint')}
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
            {t('profile.cancellation.editTitle')}
          </h3>
        </div>
      </div>

      {/* Preset Options */}
      <div className="space-y-2">
        <p className="text-xs text-text-tertiary">{t('profile.cancellation.choosePreset')}</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_POLICIES.map((preset) => (
            <button
              key={preset.labelKey}
              onClick={() => selectPreset(t(preset.valueKey))}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                currentPolicy === t(preset.valueKey)
                  ? 'bg-section-gradient text-white'
                  : 'bg-background-secondary/20 text-text-secondary hover:bg-background-secondary/30'
              )}
            >
              {t(preset.labelKey)}
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
          placeholder={t('profile.cancellation.placeholder')}
          rows={4}
          maxLength={maxChars}
          className={cn(
            'w-full bg-[#2A2D3A] border border-hairline rounded-xl px-4 py-3 text-content placeholder:text-text-tertiary',
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
          {t('profile.cancellation.cancel')}
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
          {t('profile.cancellation.save')}
        </Button>
      </div>

      {success && (
        <p className="text-sm text-success-DEFAULT text-center">
          {t('profile.cancellation.saved')}
        </p>
      )}
    </div>
  );
}

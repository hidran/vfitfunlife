'use client';
import { useState } from 'react';
import type { PrivacySettings, ProfileVisibility } from '@/types/profile';
import { Button } from '@/components/ui/button';
import { useUpdatePrivacySettings } from '@/lib/profile-mutations';
import { useI18n } from '@/hooks/useI18n';

interface Props { initial: PrivacySettings; onSaved?: () => void; }

type VisibilityOptionDef = { value: ProfileVisibility; i18nKey: 'public' | 'verifiedOnly' | 'private'; hint: string };
type ToggleFieldDef = { key: keyof Omit<PrivacySettings, 'profileVisibility'>; i18nKey: string; hint: string };

const visibilityOptionDefs: VisibilityOptionDef[] = [
  { value: 'public',        i18nKey: 'public',       hint: 'Anyone can find and view your profile.' },
  { value: 'verified_only', i18nKey: 'verifiedOnly',  hint: 'Only verified users can view your profile.' },
  { value: 'private',       i18nKey: 'private',       hint: 'Only people you book with can view your profile.' },
];

const toggleFieldDefs: ToggleFieldDef[] = [
  { key: 'showEmail',            i18nKey: 'showEmail',            hint: 'Display your email on your public profile.' },
  { key: 'showPhone',            i18nKey: 'showPhone',            hint: 'Display your phone number on your public profile.' },
  { key: 'allowDirectMessages',  i18nKey: 'allowDirectMessages',  hint: 'Other users can message you directly.' },
  { key: 'shareAnalytics',       i18nKey: 'shareAnalytics',       hint: 'Allow anonymized usage analytics.' },
];

export function PrivacySettingsForm({ initial, onSaved }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<PrivacySettings>(initial);
  const mut = useUpdatePrivacySettings();

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        await mut.mutateAsync(state);
        onSaved?.();
      }}
    >
      <fieldset>
        <legend className="text-sm font-semibold">{t('profile.settings.privacy.visibility')}</legend>
        <div className="mt-2 space-y-2">
          {visibilityOptionDefs.map(({ value, i18nKey, hint }) => {
            const label = t(`profile.settings.privacy.${i18nKey}` as any);
            return (
              <label key={value} htmlFor={`vis-${value}`} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <input
                  id={`vis-${value}`}
                  aria-label={label}
                  type="radio"
                  name="profileVisibility"
                  value={value}
                  checked={state.profileVisibility === value}
                  onChange={() => setState((s) => ({ ...s, profileVisibility: value }))}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-text-secondary">{hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {toggleFieldDefs.map(({ key, i18nKey, hint }) => {
        const label = t(`profile.settings.privacy.${i18nKey}` as any);
        return (
          <label key={key} htmlFor={`priv-${key}`} className="flex items-start justify-between rounded-lg border border-border p-3">
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-text-secondary">{hint}</span>
            </span>
            <input
              id={`priv-${key}`}
              aria-label={label}
              type="checkbox"
              role="switch"
              aria-checked={Boolean(state[key])}
              checked={Boolean(state[key])}
              onChange={(e) => setState((s) => ({ ...s, [key]: e.target.checked }))}
            />
          </label>
        );
      })}

      <Button type="submit" isLoading={mut.isPending}>{t('profile.settings.save')}</Button>
    </form>
  );
}

'use client';
import { useState } from 'react';
import type { PrivacySettings, ProfileVisibility } from '@/types/profile';
import { Button } from '@/components/ui/button';
import { useUpdatePrivacySettings } from '@/lib/profile-mutations';

interface Props { initial: PrivacySettings; onSaved?: () => void; }

const visibilityOptions: Array<{ value: ProfileVisibility; label: string; hint: string }> = [
  { value: 'public', label: 'Public', hint: 'Anyone can find and view your profile.' },
  { value: 'verified_only', label: 'Verified only', hint: 'Only verified users can view your profile.' },
  { value: 'private', label: 'Private', hint: 'Only people you book with can view your profile.' },
];

const toggleFields: Array<{ key: keyof Omit<PrivacySettings, 'profileVisibility'>; label: string; hint: string }> = [
  { key: 'showEmail', label: 'Show email', hint: 'Display your email on your public profile.' },
  { key: 'showPhone', label: 'Show phone', hint: 'Display your phone number on your public profile.' },
  { key: 'allowDirectMessages', label: 'Allow direct messages', hint: 'Other users can message you directly.' },
  { key: 'shareAnalytics', label: 'Share analytics', hint: 'Allow anonymized usage analytics.' },
];

export function PrivacySettingsForm({ initial, onSaved }: Props) {
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
        <legend className="text-sm font-semibold">Profile visibility</legend>
        <div className="mt-2 space-y-2">
          {visibilityOptions.map(({ value, label, hint }) => (
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
          ))}
        </div>
      </fieldset>

      {toggleFields.map(({ key, label, hint }) => (
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
      ))}

      <Button type="submit" isLoading={mut.isPending}>Save</Button>
    </form>
  );
}

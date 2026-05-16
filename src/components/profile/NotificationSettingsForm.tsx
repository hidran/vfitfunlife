'use client';
import { useState } from 'react';
import type { NotificationSettings } from '@/types/profile';
import { Button } from '@/components/ui/button';
import { useUpdateNotificationSettings } from '@/lib/profile-mutations';

interface Props { initial: NotificationSettings; onSaved?: () => void; }

type Channel = 'push' | 'email' | 'sms';
const labels: Record<string, string> = {
  booking: 'Booking updates',
  promotion: 'Promotions',
  system: 'System messages',
  chat: 'Chat messages',
  weeklyDigest: 'Weekly digest',
  reminder: 'Booking reminders',
};

export function NotificationSettingsForm({ initial, onSaved }: Props) {
  const [state, setState] = useState<NotificationSettings>(initial);
  const mut = useUpdateNotificationSettings();

  const setVal = (ch: Channel, key: string, val: boolean) => {
    setState((s) => ({ ...s, [ch]: { ...(s as any)[ch], [key]: val } }));
  };

  const renderChannel = (ch: Channel) => (
    <fieldset key={ch} className="space-y-2">
      <legend className="text-sm font-semibold uppercase tracking-wide">{ch}</legend>
      {Object.entries((state as any)[ch]).map(([k, v]) => (
        <label key={k} htmlFor={`${ch}-${k}`} className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm">{labels[k] ?? k}</span>
          <input
            id={`${ch}-${k}`}
            type="checkbox"
            role="switch"
            aria-checked={Boolean(v)}
            checked={Boolean(v)}
            onChange={(e) => setVal(ch, k, e.target.checked)}
            aria-label={`${ch} ${labels[k] ?? k}`}
          />
        </label>
      ))}
    </fieldset>
  );

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        await mut.mutateAsync(state);
        onSaved?.();
      }}
    >
      {renderChannel('push')}
      {renderChannel('email')}
      {renderChannel('sms')}
      <Button type="submit" isLoading={mut.isPending}>Save</Button>
    </form>
  );
}

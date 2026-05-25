'use client';
import { useState } from 'react';
import type { NotificationSettings } from '@/types/profile';
import { Button } from '@/components/ui/button';
import { useUpdateNotificationSettings } from '@/lib/profile-mutations';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

interface Props { initial: NotificationSettings; onSaved?: () => void; }

type Channel = 'push' | 'email' | 'sms';

const eventKeys: string[] = ['booking', 'promotion', 'system', 'chat', 'weeklyDigest', 'reminder'];

export function NotificationSettingsForm({ initial, onSaved }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<NotificationSettings>(initial);
  const mut = useUpdateNotificationSettings();

  const setVal = (ch: Channel, key: string, val: boolean) => {
    setState((s) => ({ ...s, [ch]: { ...(s as any)[ch], [key]: val } }));
  };

  const getEventLabel = (k: string): string => {
    const msgKey = `profile.settings.notifications.${k}` as MessageKey;
    return eventKeys.includes(k) ? t(msgKey) : k;
  };

  const renderChannel = (ch: Channel) => (
    <fieldset key={ch} className="space-y-2">
      <legend className="text-sm font-semibold uppercase tracking-wide">
        {t(`profile.settings.notifications.${ch}` as MessageKey)}
      </legend>
      {Object.entries((state as any)[ch]).map(([k, v]) => {
        const label = getEventLabel(k);
        return (
          <label key={k} htmlFor={`${ch}-${k}`} className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm">{label}</span>
            <input
              id={`${ch}-${k}`}
              type="checkbox"
              role="switch"
              aria-checked={Boolean(v)}
              checked={Boolean(v)}
              onChange={(e) => setVal(ch, k, e.target.checked)}
              aria-label={`${t(`profile.settings.notifications.${ch}` as MessageKey)} ${label}`}
            />
          </label>
        );
      })}
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
      <Button type="submit" isLoading={mut.isPending}>{t('profile.settings.save')}</Button>
    </form>
  );
}

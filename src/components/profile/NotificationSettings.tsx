'use client';

import { useState, useCallback } from 'react';
import { Mail, Bell, MessageSquare, Tag, Calendar, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { updateNotificationSettings } from '@/lib/firebase/auth';
import { NotificationSettings as NotificationSettingsType } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

interface NotificationSettingsProps {
  userId: string;
  settings: NotificationSettingsType;
  onUpdate?: (settings: NotificationSettingsType) => void;
  className?: string;
}

const defaultSettings: NotificationSettingsType = {
  email: true,
  push: true,
  sms: false,
  marketing: true,
  bookingReminders: true,
  promotions: true,
  newMessages: true,
};

const notificationOptions = [
  {
    key: 'email' as const,
    labelKey: 'profile.notifications.option.email.label',
    descriptionKey: 'profile.notifications.option.email.description',
    icon: Mail,
  },
  {
    key: 'push' as const,
    labelKey: 'profile.notifications.option.push.label',
    descriptionKey: 'profile.notifications.option.push.description',
    icon: Bell,
  },
  {
    key: 'sms' as const,
    labelKey: 'profile.notifications.option.sms.label',
    descriptionKey: 'profile.notifications.option.sms.description',
    icon: MessageSquare,
  },
  {
    key: 'bookingReminders' as const,
    labelKey: 'profile.notifications.option.bookingReminders.label',
    descriptionKey: 'profile.notifications.option.bookingReminders.description',
    icon: Calendar,
  },
  {
    key: 'promotions' as const,
    labelKey: 'profile.notifications.option.promotions.label',
    descriptionKey: 'profile.notifications.option.promotions.description',
    icon: Tag,
  },
  {
    key: 'newMessages' as const,
    labelKey: 'profile.notifications.option.newMessages.label',
    descriptionKey: 'profile.notifications.option.newMessages.description',
    icon: MessageSquare,
  },
  {
    key: 'marketing' as const,
    labelKey: 'profile.notifications.option.marketing.label',
    descriptionKey: 'profile.notifications.option.marketing.description',
    icon: Mail,
  },
] as const satisfies ReadonlyArray<{
  key: keyof NotificationSettingsType;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  icon: typeof Mail;
}>;

export function NotificationSettings({
  userId,
  settings: initialSettings,
  onUpdate,
  className,
}: NotificationSettingsProps) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<NotificationSettingsType>({
    ...defaultSettings,
    ...initialSettings,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleToggle = useCallback((key: keyof NotificationSettingsType) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setError(null);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await updateNotificationSettings(userId, settings);
      setSuccess(true);
      onUpdate?.(settings);
      setIsEditing(false);

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving notification settings:', err);
      setError(t('profile.notifications.error.save'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setSettings({ ...defaultSettings, ...initialSettings });
    setIsEditing(false);
    setError(null);
  };

  const enabledCount = Object.values(settings).filter(Boolean).length;

  if (!isEditing) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-text-tertiary">{t('profile.notifications.title')}</h3>
            <p className="text-xs text-text-tertiary/70">
              {t('profile.notifications.enabledCount', { enabled: enabledCount, total: notificationOptions.length })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            {t('profile.notifications.manage')}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {notificationOptions.slice(0, 4).map((option) => {
            const isEnabled = settings[option.key];
            if (!isEnabled) return null;

            return (
              <div
                key={option.key}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-success-DEFAULT/10 text-success-DEFAULT text-xs"
              >
                <option.icon size={12} />
                <span>{t(option.labelKey)}</span>
              </div>
            );
          })}
          {enabledCount > 4 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-background-secondary/10 text-text-tertiary text-xs">
              {t('profile.notifications.more', { count: enabledCount - 4 })}
            </span>
          )}
          {enabledCount === 0 && (
            <p className="text-sm text-text-tertiary italic">
              {t('profile.notifications.allDisabled')}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-tertiary">{t('profile.notifications.preferencesTitle')}</h3>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isSaving}
          >
            <X size={16} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            isLoading={isSaving}
          >
            <Check size={16} />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {notificationOptions.map((option) => {
          const isEnabled = settings[option.key];

          return (
            <button
              key={option.key}
              onClick={() => handleToggle(option.key)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left',
                isEnabled
                  ? 'bg-section-gradient/10 border border-section-primary/30'
                  : 'bg-background-secondary/5 border border-transparent hover:bg-background-secondary/10'
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                  isEnabled ? 'bg-section-gradient text-white' : 'bg-background-secondary/20 text-text-tertiary'
                )}
              >
                <option.icon size={18} />
              </div>

              <div className="flex-1 min-w-0">
                <p className={cn(
                  'font-medium text-sm',
                  isEnabled ? 'text-text-inverse' : 'text-text-secondary'
                )}>
                  {t(option.labelKey)}
                </p>
                <p className="text-xs text-text-tertiary truncate">
                  {t(option.descriptionKey)}
                </p>
              </div>

              <div
                className={cn(
                  'w-12 h-6 rounded-full relative transition-colors duration-200',
                  isEnabled ? 'bg-section-primary' : 'bg-background-secondary/30'
                )}
              >
                <div
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200',
                    isEnabled ? 'translate-x-7' : 'translate-x-1'
                  )}
                />
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-error">{error}</p>
      )}

      {success && (
        <p className="text-sm text-success-DEFAULT">{t('profile.notifications.saved')}</p>
      )}
    </div>
  );
}

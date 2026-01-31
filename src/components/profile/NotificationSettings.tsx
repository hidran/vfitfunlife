'use client';

import { useState, useCallback } from 'react';
import { Mail, Bell, MessageSquare, Tag, Calendar, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { updateNotificationSettings } from '@/lib/firebase/auth';
import { NotificationSettings as NotificationSettingsType } from '@/types/firebase';

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
    label: 'Email Notifications',
    description: 'Receive updates via email',
    icon: Mail,
  },
  {
    key: 'push' as const,
    label: 'Push Notifications',
    description: 'Receive push notifications on your device',
    icon: Bell,
  },
  {
    key: 'sms' as const,
    label: 'SMS Notifications',
    description: 'Receive text messages for important updates',
    icon: MessageSquare,
  },
  {
    key: 'bookingReminders' as const,
    label: 'Booking Reminders',
    description: 'Get reminded about upcoming bookings',
    icon: Calendar,
  },
  {
    key: 'promotions' as const,
    label: 'Promotions & Offers',
    description: 'Receive special offers and discounts',
    icon: Tag,
  },
  {
    key: 'newMessages' as const,
    label: 'New Messages',
    description: 'Get notified when you receive new messages',
    icon: MessageSquare,
  },
  {
    key: 'marketing' as const,
    label: 'Marketing Communications',
    description: 'Receive news, updates, and marketing emails',
    icon: Mail,
  },
];

export function NotificationSettings({
  userId,
  settings: initialSettings,
  onUpdate,
  className,
}: NotificationSettingsProps) {
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
      setError('Failed to save notification settings');
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
            <h3 className="text-sm font-medium text-text-tertiary">Notifications</h3>
            <p className="text-xs text-text-tertiary/70">
              {enabledCount} of {notificationOptions.length} enabled
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            Manage
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
                <span>{option.label}</span>
              </div>
            );
          })}
          {enabledCount > 4 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-background-secondary/10 text-text-tertiary text-xs">
              +{enabledCount - 4} more
            </span>
          )}
          {enabledCount === 0 && (
            <p className="text-sm text-text-tertiary italic">
              All notifications are disabled
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-tertiary">Notification Preferences</h3>
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
                  {option.label}
                </p>
                <p className="text-xs text-text-tertiary truncate">
                  {option.description}
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
        <p className="text-sm text-success-DEFAULT">Notification settings saved!</p>
      )}
    </div>
  );
}

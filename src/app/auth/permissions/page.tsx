'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MapPin, Bell, CheckCircle2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useI18n } from '@/hooks/useI18n';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import type { MessageKey } from '@/i18n/messages';

interface Permission {
  id: 'location' | 'notifications';
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  icon: typeof MapPin;
  granted: boolean;
}

export default function PermissionsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([
    {
      id: 'location',
      titleKey: 'auth.permissions.location.title',
      descriptionKey: 'auth.permissions.location.description',
      icon: MapPin,
      granted: false,
    },
    {
      id: 'notifications',
      titleKey: 'auth.permissions.notifications.title',
      descriptionKey: 'auth.permissions.notifications.description',
      icon: Bell,
      granted: false,
    },
  ]);

  const handleRequestLocation = async () => {
    if (!Capacitor.isNativePlatform()) {
      // Web: Use browser geolocation API
      try {
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              updatePermission('location', true);
              resolve();
            },
            (error) => {
              console.log('Location permission denied:', error);
              reject(error);
            }
          );
        });
      } catch (err) {
        console.error('Location error:', err);
      }
    } else {
      // Native: Use Capacitor Geolocation
      try {
        const permission = await Geolocation.checkPermissions();

        if (permission.location === 'granted') {
          updatePermission('location', true);
        } else {
          const result = await Geolocation.requestPermissions();
          if (result.location === 'granted') {
            updatePermission('location', true);
          }
        }
      } catch (err) {
        console.error('Location permission error:', err);
      }
    }
  };

  const handleRequestNotifications = async () => {
    if (!Capacitor.isNativePlatform()) {
      // Web: Use browser Notification API
      try {
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            updatePermission('notifications', true);
          }
        }
      } catch (err) {
        console.error('Notification permission error:', err);
      }
    } else {
      // Native: Will be handled by FCM setup
      // For now, just mark as granted
      updatePermission('notifications', true);
    }
  };

  const updatePermission = (id: 'location' | 'notifications', granted: boolean) => {
    setPermissions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, granted } : p))
    );
  };

  const handleContinue = async () => {
    setIsLoading(true);

    // Store permissions state in localStorage
    const permissionsState = {
      location: permissions.find((p) => p.id === 'location')?.granted || false,
      notifications: permissions.find((p) => p.id === 'notifications')?.granted || false,
    };
    localStorage.setItem('permissions', JSON.stringify(permissionsState));

    // Navigate to home
    router.push('/home');
  };

  const handleSkip = () => {
    router.push('/home');
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
      <LanguageSwitcher variant="menu" className="absolute right-4 top-4 z-10" />
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-1 bg-white/20 rounded-full" />
          <div className="w-12 h-1 bg-gradient-to-r from-primary to-secondary rounded-full" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">{t('auth.permissions.title')}</h1>
        <p className="text-text-secondary">
          {t('auth.permissions.subtitle')}
        </p>
      </div>

      {/* Permissions List */}
      <div className="flex-1 px-6 pb-8">
        <div className="space-y-4 max-w-md mx-auto">
          {permissions.map((permission) => {
            const Icon = permission.icon;
            return (
              <div
                key={permission.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-white">
                        {t(permission.titleKey)}
                      </h3>
                      {permission.granted && (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      )}
                    </div>
                    <p className="text-sm text-text-secondary">
                      {t(permission.descriptionKey)}
                    </p>
                  </div>
                </div>

                {!permission.granted && (
                  <Button
                    onClick={
                      permission.id === 'location'
                        ? handleRequestLocation
                        : handleRequestNotifications
                    }
                    variant="outline"
                    className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white"
                  >
                    {t('auth.permissions.allowAction', { permission: t(permission.titleKey) })}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="px-6 pb-8 space-y-3">
        <Button
          onClick={handleContinue}
          className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity py-3"
          disabled={isLoading}
        >
          {t('auth.permissions.continue')}
        </Button>
        <button
          type="button"
          onClick={handleSkip}
          className="w-full text-text-secondary text-sm hover:text-text-inverse transition-colors"
          disabled={isLoading}
        >
          {t('auth.permissions.skip')}
        </button>
      </div>
    </div>
  );
}

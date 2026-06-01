'use client';

import { useMemo, useState } from 'react';
import { Bell, Calendar, CheckCheck, Gift, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/Badge';
import { useNotificationStore, type AppNotificationType } from '@/stores/notificationStore';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import { toLocaleTag } from '@/types/locale';

const TYPE_META: Record<
  AppNotificationType,
  { icon: typeof Calendar; labelKey: MessageKey; colorClass: string; bgClass: string }
> = {
  booking: {
    icon: Calendar,
    labelKey: 'notifications.type.booking',
    colorClass: 'text-info',
    bgClass: 'bg-info/15',
  },
  message: {
    icon: MessageCircle,
    labelKey: 'notifications.type.message',
    colorClass: 'text-section-primary',
    bgClass: 'bg-section-primary/15',
  },
  promo: {
    icon: Gift,
    labelKey: 'notifications.type.promo',
    colorClass: 'text-warning',
    bgClass: 'bg-warning/15',
  },
  system: {
    icon: Bell,
    labelKey: 'notifications.type.system',
    colorClass: 'text-text-tertiary',
    bgClass: 'bg-surface-2',
  },
};

export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const notifications = useNotificationStore((state) => state.notifications);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const toggleRead = useNotificationStore((state) => state.toggleRead);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const visibleNotifications = useMemo(
    () =>
      showUnreadOnly
        ? notifications.filter((notification) => !notification.read)
        : notifications,
    [notifications, showUnreadOnly]
  );

  return (
    <div className="container-mobile py-6 space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-inverse">{t('notifications.title')}</h1>
          <Badge variant={unreadCount > 0 ? 'info' : 'default'}>
            {t('notifications.unreadCount', { count: unreadCount })}
          </Badge>
        </div>
        <p className="text-sm text-text-secondary">
          {t('notifications.subtitle')}
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={markAllAsRead} disabled={unreadCount === 0}>
          <CheckCheck className="mr-2 h-4 w-4" />
          {t('notifications.markAllRead')}
        </Button>
        <button
          type="button"
          onClick={() => setShowUnreadOnly((prev) => !prev)}
          className={cn(
            'rounded-full border px-3 py-2 text-xs font-semibold transition-colors',
            showUnreadOnly
              ? 'border-section-primary bg-section-primary/15 text-section-primary'
              : 'border-white/15 bg-surface-2 text-text-secondary'
          )}
        >
          {t('notifications.unreadOnly')}
        </button>
      </section>

      <section className="space-y-3 pb-20">
        {visibleNotifications.length === 0 ? (
          <div className="rounded-2xl border border-hairline bg-surface-2 p-5 text-center text-sm text-text-secondary">
            {t('notifications.emptyFiltered')}
          </div>
        ) : (
          visibleNotifications.map((notification) => {
            const meta = TYPE_META[notification.type];
            const Icon = meta.icon;

            return (
              <article
                key={notification.id}
                className={cn(
                  'rounded-2xl border p-4 transition-colors',
                  notification.read
                    ? 'border-hairline bg-surface-2'
                    : 'border-section-primary/30 bg-section-primary/10'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('mt-0.5 rounded-full p-2', meta.bgClass)}>
                    <Icon className={cn('h-4 w-4', meta.colorClass)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-text-inverse">{notification.title}</p>
                      <Badge size="sm" variant="default">
                        {t(meta.labelKey)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">{notification.body}</p>
                    <p className="mt-2 text-xs text-text-tertiary">
                      {new Date(notification.timestamp).toLocaleString(toLocaleTag(locale), {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRead(notification.id)}
                    className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-text-tertiary transition-colors hover:text-text-inverse"
                  >
                    {notification.read ? t('notifications.unread') : t('notifications.read')}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Bell, Calendar, CheckCheck, Gift, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/Badge';
import { useNotificationStore, type AppNotificationType } from '@/stores/notificationStore';

const TYPE_META: Record<
  AppNotificationType,
  { icon: typeof Calendar; label: string; colorClass: string; bgClass: string }
> = {
  booking: {
    icon: Calendar,
    label: 'Booking',
    colorClass: 'text-info',
    bgClass: 'bg-info/15',
  },
  message: {
    icon: MessageCircle,
    label: 'Chat',
    colorClass: 'text-section-primary',
    bgClass: 'bg-section-primary/15',
  },
  promo: {
    icon: Gift,
    label: 'Promo',
    colorClass: 'text-warning',
    bgClass: 'bg-warning/15',
  },
  system: {
    icon: Bell,
    label: 'Sistema',
    colorClass: 'text-text-tertiary',
    bgClass: 'bg-white/10',
  },
};

export default function NotificationsPage() {
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
          <h1 className="text-2xl font-bold text-text-inverse">Notifiche</h1>
          <Badge variant={unreadCount > 0 ? 'info' : 'default'}>{unreadCount} non lette</Badge>
        </div>
        <p className="text-sm text-text-secondary">
          Centro notifiche per booking, chat e aggiornamenti account.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={markAllAsRead} disabled={unreadCount === 0}>
          <CheckCheck className="mr-2 h-4 w-4" />
          Segna tutte come lette
        </Button>
        <button
          type="button"
          onClick={() => setShowUnreadOnly((prev) => !prev)}
          className={cn(
            'rounded-full border px-3 py-2 text-xs font-semibold transition-colors',
            showUnreadOnly
              ? 'border-section-primary bg-section-primary/15 text-section-primary'
              : 'border-white/15 bg-white/5 text-text-secondary'
          )}
        >
          Solo non lette
        </button>
      </section>

      <section className="space-y-3 pb-20">
        {visibleNotifications.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-text-secondary">
            Nessuna notifica da mostrare con il filtro attuale.
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
                    ? 'border-white/10 bg-white/5'
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
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">{notification.body}</p>
                    <p className="mt-2 text-xs text-text-tertiary">
                      {new Date(notification.timestamp).toLocaleString('it-IT', {
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
                    {notification.read ? 'Non letta' : 'Letta'}
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

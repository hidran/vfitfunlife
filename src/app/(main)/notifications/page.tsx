'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Bell,
  BellOff,
  Calendar,
  Check,
  CheckCheck,
  ChevronRight,
  Gift,
  MessageCircle,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/Badge';
import { useNotificationStore, type InboxNotification } from '@/stores/notificationStore';
import type { InboxCategory } from '@/lib/notifications/inbox';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import { toLocaleTag } from '@/types/locale';
import { notify } from '@/lib/notify';

const TYPE_META: Record<
  InboxCategory,
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
  const router = useRouter();
  const uid = useNotificationStore((state) => state.uid);
  const status = useNotificationStore((state) => state.status);
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const visibleNotifications = useMemo(
    () => (showUnreadOnly ? notifications.filter((n) => !n.isRead) : notifications),
    [notifications, showUnreadOnly]
  );

  const localeTag = toLocaleTag(locale);
  const formatWhen = (date: Date | null) => {
    if (!date || Date.now() - date.getTime() < 60_000) return t('notifications.inbox.justNow');
    return date.toLocaleString(localeTag, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      const count = await markAllRead();
      if (count > 0) notify.success(t('notifications.inbox.markAllDone', { count }));
    } catch (error) {
      console.error('[notifications] mark all read failed', error);
      notify.error(t('notifications.inbox.actionError'));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleToggleRead = async (notification: InboxNotification) => {
    try {
      await markRead(notification.id, !notification.isRead);
    } catch (error) {
      console.error('[notifications] toggle read failed', error);
      notify.error(t('notifications.inbox.actionError'));
    }
  };

  const handleOpen = async (notification: InboxNotification) => {
    if (!notification.isRead) {
      markRead(notification.id, true).catch((error) =>
        console.error('[notifications] mark read failed', error)
      );
    }
    if (!notification.bookingId || !uid) return;
    setOpeningId(notification.id);
    try {
      const { resolveNotificationHref } = await import('@/lib/firebase/notifications');
      const href = await resolveNotificationHref(uid, notification);
      if (href) router.push(href);
    } catch (error) {
      console.error('[notifications] open failed', error);
      notify.error(t('notifications.inbox.actionError'));
    } finally {
      setOpeningId(null);
    }
  };

  const isLoading = status === 'idle' || status === 'loading';

  return (
    <div className="container-mobile py-6 space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-text-inverse">{t('notifications.title')}</h1>
          <Badge variant={unreadCount > 0 ? 'info' : 'default'}>
            <span aria-live="polite">{t('notifications.unreadCount', { count: unreadCount })}</span>
          </Badge>
        </div>
        <p className="text-sm text-text-secondary">{t('notifications.subtitle')}</p>
      </header>

      <section className="flex flex-wrap items-center gap-2" aria-label={t('notifications.title')}>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleMarkAll}
          isLoading={markingAll}
          disabled={unreadCount === 0 || markingAll}
        >
          <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('notifications.markAllRead')}
        </Button>
        <button
          type="button"
          onClick={() => setShowUnreadOnly((prev) => !prev)}
          aria-pressed={showUnreadOnly}
          className={cn(
            'min-h-11 rounded-full border px-4 text-xs font-semibold transition-colors focus-ring',
            showUnreadOnly
              ? 'border-section-primary bg-section-primary/15 text-section-primary'
              : 'border-content/15 bg-surface-2 text-text-secondary'
          )}
        >
          {t('notifications.unreadOnly')}
        </button>
      </section>

      <section className="pb-20" aria-busy={isLoading}>
        {isLoading ? (
          <div role="status" className="space-y-3">
            <span className="sr-only">{t('notifications.inbox.loading')}</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-2" aria-hidden="true" />
            ))}
          </div>
        ) : status === 'error' ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 rounded-2xl border border-hairline bg-surface-2 p-5 text-center text-sm text-text-secondary"
          >
            <AlertCircle className="h-6 w-6 text-error" aria-hidden="true" />
            {t('notifications.inbox.loadError')}
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-hairline bg-surface-2 p-6 text-center">
            <BellOff className="h-6 w-6 text-text-tertiary" aria-hidden="true" />
            <p className="font-semibold text-text-inverse">
              {notifications.length === 0
                ? t('notifications.inbox.emptyTitle')
                : t('notifications.emptyFiltered')}
            </p>
            {notifications.length === 0 && (
              <p className="text-sm text-text-secondary">{t('notifications.inbox.emptyBody')}</p>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleNotifications.map((notification) => {
              const meta = TYPE_META[notification.category];
              const Icon = meta.icon;
              const hasTarget = Boolean(notification.bookingId);
              const title = notification.title || t(meta.labelKey);

              return (
                <li
                  key={notification.id}
                  className={cn(
                    'flex items-stretch rounded-2xl border transition-colors',
                    notification.isRead
                      ? 'border-hairline bg-surface-2'
                      : 'border-section-primary/30 bg-section-primary/10'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleOpen(notification)}
                    disabled={openingId === notification.id}
                    className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-l-2xl p-4 text-left focus-ring disabled:opacity-70"
                  >
                    <span className={cn('mt-0.5 shrink-0 rounded-full p-2', meta.bgClass)}>
                      <Icon className={cn('h-4 w-4', meta.colorClass)} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {!notification.isRead && (
                          <>
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-section-primary"
                              aria-hidden="true"
                            />
                            <span className="sr-only">{t('notifications.unread')}: </span>
                          </>
                        )}
                        <span
                          className={cn(
                            'truncate text-text-inverse',
                            notification.isRead ? 'font-medium' : 'font-semibold'
                          )}
                        >
                          {title}
                        </span>
                      </span>
                      {notification.body && (
                        <span className="mt-1 block text-sm text-text-secondary">
                          {notification.body}
                        </span>
                      )}
                      <span className="mt-2 flex items-center gap-2 text-xs text-text-tertiary">
                        <Badge size="sm" variant="default">
                          {t(meta.labelKey)}
                        </Badge>
                        <time dateTime={notification.createdAt?.toISOString()}>
                          {formatWhen(notification.createdAt)}
                        </time>
                      </span>
                    </span>
                    {hasTarget && (
                      <ChevronRight
                        className="mt-1 h-4 w-4 shrink-0 self-center text-text-tertiary"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleRead(notification)}
                    aria-label={
                      notification.isRead
                        ? t('notifications.inbox.markUnread', { title })
                        : t('notifications.inbox.markRead', { title })
                    }
                    title={
                      notification.isRead
                        ? t('notifications.inbox.markUnreadShort')
                        : t('notifications.inbox.markReadShort')
                    }
                    className="flex w-12 shrink-0 items-center justify-center rounded-r-2xl border-l border-hairline text-text-tertiary transition-colors hover:text-text-inverse focus-ring"
                  >
                    {notification.isRead ? (
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

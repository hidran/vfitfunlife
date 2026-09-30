'use client';

import { useState } from 'react';
import Image from 'next/image';
import { MoreVertical, Check, X, Calendar, Clock, User, Loader2 } from 'lucide-react';
import { ProviderBooking, BookingFilters } from '@/types/provider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import { BOOKING_STATUS_META, isActive } from '@/lib/bookingStatus';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { cn, formatPrice } from '@/lib/utils';

/** An action may return a promise; the row shows a spinner and locks its buttons until it settles. */
type RowAction = (id: string) => Promise<unknown> | void;

interface BookingTableProps {
  bookings: ProviderBooking[];
  onConfirm?: RowAction;
  /** Turn down a request (`requested` → `declined`). */
  onDecline?: RowAction;
  /** Cancel a booking already accepted, from the row menu. */
  onCancel?: (id: string) => void;
  onComplete?: RowAction;
  onView?: (id: string) => void;
  onMessage?: (id: string) => void;
  selectedIds?: string[];
  onSelect?: (id: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  loading?: boolean;
}

export function BookingTable({
  bookings,
  onConfirm,
  onDecline,
  onCancel,
  onComplete,
  onView,
  onMessage,
  selectedIds = [],
  onSelect,
  onSelectAll,
  loading = false,
}: BookingTableProps) {
  const { t, locale } = useI18n();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  /** The row whose action is in flight, and which action, so only that button spins. */
  const [busy, setBusy] = useState<{ id: string; action: 'confirm' | 'decline' | 'complete' } | null>(null);

  const run = async (id: string, action: 'confirm' | 'decline' | 'complete', fn?: RowAction) => {
    if (!fn || busy) return;
    setBusy({ id, action });
    try {
      await fn(id);
    } finally {
      setBusy(null);
    }
  };

  const formatDate = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString(toLocaleTag(locale), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleTimeString(toLocaleTag(locale), {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const spinnerOr = (booking: ProviderBooking, action: 'confirm' | 'decline' | 'complete', icon: React.ReactNode) =>
    busy?.id === booking.id && busy.action === action ? (
      <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" />
    ) : (
      icon
    );

  // A render function, not a nested component: a component declared here would be a new type
  // on every render and remount (dropping focus and the open menu) each time.
  function renderActions(booking: ProviderBooking) {
    const rowBusy = busy?.id === booking.id;
    return (
      <div className="flex items-center justify-end gap-2">
        {booking.status === 'requested' && (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => run(booking.id, 'confirm', onConfirm)}
              disabled={busy !== null}
              aria-busy={rowBusy && busy?.action === 'confirm'}
              className="px-3 py-1.5 min-h-11"
            >
              {spinnerOr(booking, 'confirm', <Check className="w-4 h-4 mr-1" />)}
              {t('provider.bookingTable.action.confirm')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => run(booking.id, 'decline', onDecline)}
              disabled={busy !== null}
              aria-busy={rowBusy && busy?.action === 'decline'}
              className="px-3 py-1.5 min-h-11 border-red-500/50 text-red-400 light:text-red-700 hover:bg-red-500/10"
            >
              {spinnerOr(booking, 'decline', <X className="w-4 h-4 mr-1" />)}
              {t('provider.bookingTable.action.decline')}
            </Button>
          </>
        )}
        {booking.status === 'accepted' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => run(booking.id, 'complete', onComplete)}
            disabled={busy !== null}
            aria-busy={rowBusy && busy?.action === 'complete'}
            className="px-3 py-1.5 min-h-11"
          >
            {spinnerOr(booking, 'complete', <Check className="w-4 h-4 mr-1" />)}
            {t('provider.bookingTable.action.complete')}
          </Button>
        )}

        <div className="relative">
          <button
            onClick={() => setOpenMenuId(openMenuId === booking.id ? null : booking.id)}
            aria-label={t('provider.bookingTable.col.actions')}
            aria-expanded={openMenuId === booking.id}
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-content/10 transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-content-muted" />
          </button>

          {openMenuId === booking.id && (
            <div className="absolute right-0 mt-1 w-48 bg-surface-input rounded-lg border border-hairline shadow-xl z-10 py-1">
              <button
                onClick={() => {
                  onView?.(booking.id);
                  setOpenMenuId(null);
                }}
                className="w-full px-4 py-2 text-left text-sm text-content hover:bg-content/5"
              >
                {t('provider.bookingTable.action.viewDetails')}
              </button>
              <button
                onClick={() => {
                  onMessage?.(booking.id);
                  setOpenMenuId(null);
                }}
                className="w-full px-4 py-2 text-left text-sm text-content hover:bg-content/5"
              >
                {t('provider.bookingTable.action.messageClient')}
              </button>
              {isActive(booking.status) && (
                <button
                  onClick={() => {
                    onCancel?.(booking.id);
                    setOpenMenuId(null);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 light:text-red-700 hover:bg-red-500/10"
                >
                  {t('provider.bookingTable.action.cancelBooking')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const statusBadgeOf = (booking: ProviderBooking) => {
    const statusMeta = BOOKING_STATUS_META[booking.status];
    return (
      <Badge variant={statusMeta.tone} size="sm">
        {t(statusMeta.labelKey)}
      </Badge>
    );
  };

  const clientAvatar = (booking: ProviderBooking) =>
    booking.clientPhotoUrl ? (
      <Image
        src={booking.clientPhotoUrl}
        alt={booking.userName}
        width={40}
        height={40}
        unoptimized
        className="w-10 h-10 shrink-0 rounded-full object-cover"
      />
    ) : (
      <div className="w-10 h-10 shrink-0 rounded-full bg-surface-input flex items-center justify-center">
        <User className="w-5 h-5 text-content-faint light:text-content-muted" />
      </div>
    );

  const isAllSelected = bookings.length > 0 && selectedIds.length === bookings.length;
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < bookings.length;

  if (loading) {
    return (
      <div className="bg-surface-elevated rounded-xl border border-content/5 light:border-hairline p-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-content/20 border-t-section-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="bg-surface-elevated rounded-xl border border-content/5 light:border-hairline p-12 text-center">
        <div className="w-16 h-16 bg-surface-input rounded-full flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-8 h-8 text-content-faint light:text-content-muted" />
        </div>
        <h3 className="text-lg font-medium text-content mb-2">{t('provider.bookingTable.empty.title')}</h3>
        <p className="text-content-muted">{t('provider.bookingTable.empty.subtitle')}</p>
      </div>
    );
  }

  return (
    <>
    {/* Phones: one card per booking, actions always in view. The table below needs ~900px;
        on a phone it scrolled sideways with Confirm/Decline starting off-screen. */}
    <ul className="md:hidden space-y-3">
      {bookings.map((booking) => (
        <li
          key={booking.id}
          className="bg-surface-elevated rounded-xl border border-content/5 light:border-hairline p-4 space-y-3"
        >
          {/* On narrow phones the status badge drops under the client instead of squeezing the name */}
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="flex flex-1 items-center gap-3 min-w-[10rem]">
              {clientAvatar(booking)}
              <div className="min-w-0">
                <p className="font-medium text-content truncate">{booking.userName}</p>
                <p className="text-sm text-content-muted truncate">{booking.userEmail || booking.userPhone}</p>
              </div>
            </div>
            {statusBadgeOf(booking)}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-content">
              {booking.serviceName} · {booking.durationMinutes} min
            </span>
            <span className="flex items-center gap-1.5 text-content/85">
              <Calendar className="w-4 h-4 text-content-faint light:text-content-muted" />
              {formatDate(booking.scheduledAt)}
            </span>
            <span className="flex items-center gap-1.5 text-content-muted">
              <Clock className="w-4 h-4" />
              {formatTime(booking.scheduledAt)}
            </span>
            <span className="font-medium text-content">{formatPrice(booking.finalPrice, locale)}</span>
          </div>
          {renderActions(booking)}
        </li>
      ))}
    </ul>

    <div className="hidden md:block bg-surface-elevated rounded-xl border border-content/5 light:border-hairline overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-content/5 light:border-hairline bg-surface-input/50">
              {onSelect && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={(e) => onSelectAll?.(e.target.checked)}
                    className="w-4 h-4 rounded border-content/20 bg-transparent text-section-primary focus:ring-section-primary"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">{t('provider.bookingTable.col.client')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">{t('provider.bookingTable.col.service')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">{t('provider.bookingTable.col.dateTime')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">{t('provider.bookingTable.col.price')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-content-muted">{t('provider.bookingTable.col.status')}</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-content-muted">{t('provider.bookingTable.col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-content/5 light:divide-hairline">
            {bookings.map((booking) => {
              const isSelected = selectedIds.includes(booking.id);

              return (
                <tr
                  key={booking.id}
                  className={cn(
                    'hover:bg-surface-input/30 transition-colors',
                    isSelected && 'bg-section-primary/5'
                  )}
                >
                  {onSelect && (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onSelect(booking.id, e.target.checked)}
                        className="w-4 h-4 rounded border-content/20 bg-transparent text-section-primary focus:ring-section-primary"
                      />
                    </td>
                  )}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      {clientAvatar(booking)}
                      <div>
                        <p className="font-medium text-content">{booking.userName}</p>
                        <p className="text-sm text-content-muted">{booking.userEmail || booking.userPhone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-content">{booking.serviceName}</p>
                    <p className="text-sm text-content-muted">{booking.durationMinutes} min</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-content/85">
                      <Calendar className="w-4 h-4 text-content-faint light:text-content-muted" />
                      <span>{formatDate(booking.scheduledAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-content-muted text-sm mt-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatTime(booking.scheduledAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-content font-medium">{formatPrice(booking.finalPrice, locale)}</p>
                    {booking.depositPaid && (
                      <p className="text-xs text-green-400 light:text-green-700">{t('provider.bookingTable.depositPaid')}</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {statusBadgeOf(booking)}
                  </td>
                  <td className="px-4 py-4">
                    {renderActions(booking)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

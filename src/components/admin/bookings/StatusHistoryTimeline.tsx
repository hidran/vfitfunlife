'use client';

/**
 * The booking's status audit trail.
 *
 * Every transition appends `{ status, actorUid, actorRole, at }`, which is what makes
 * dispute resolution and the P0-2 trainer-reliability metric possible. Attribution comes
 * from `actorRole`, not from the status: an admin cancelling a booking still lands it in
 * `cancelled_by_trainer`, so reading the status alone would blame the trainer.
 */

import { History } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { BOOKING_STATUS_META } from '@/lib/bookingStatus';
import { toLocaleTag } from '@/types/locale';
import type { BookingStatusHistoryEntry } from '@/types/firebase';
import type { MessageKey } from '@/i18n/messages';

const ROLE_TONE: Record<string, string> = {
  client: 'text-info',
  trainer: 'text-success',
  admin: 'text-warning',
  system: 'text-content-muted',
};

interface StatusHistoryTimelineProps {
  history?: BookingStatusHistoryEntry[];
}

export function StatusHistoryTimeline({ history }: StatusHistoryTimelineProps) {
  const { t, locale } = useI18n();
  if (!history?.length) return null;

  const entries = [...history].sort((a, b) => {
    const at = (x: BookingStatusHistoryEntry) =>
      (x.at as unknown as { toDate?: () => Date })?.toDate?.()?.getTime() ??
      new Date(x.at as unknown as string).getTime();
    return at(a) - at(b);
  });

  const fmt = (entry: BookingStatusHistoryEntry) => {
    const d =
      (entry.at as unknown as { toDate?: () => Date })?.toDate?.() ??
      new Date(entry.at as unknown as string);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleString(toLocaleTag(locale), {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
  };

  return (
    <section className="bg-surface-elevated rounded-xl border border-hairline p-6">
      <h3 className="text-lg font-semibold text-content mb-4 flex items-center gap-2">
        <History className="w-5 h-5" />
        {t('admin.bookings.statusHistory' as MessageKey)}
      </h3>

      <ol className="relative space-y-4 pl-6">
        <span
          aria-hidden
          className="absolute left-[6px] top-2 bottom-2 w-px bg-hairline"
        />
        {entries.map((entry, i) => {
          const meta = BOOKING_STATUS_META[entry.status];
          return (
            <li key={`${entry.status}-${i}`} className="relative">
              <span
                aria-hidden
                className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-surface border-2 border-hairline"
              />
              <p className="text-sm font-medium text-content">
                {meta ? t(meta.labelKey) : entry.status}
              </p>
              <p className="text-xs text-content-muted">
                <span className={ROLE_TONE[entry.actorRole] ?? ''}>{entry.actorRole}</span>
                {' · '}
                {/* "migration" marks entries synthesised by the enum backfill, which have
                    no real actor uid behind them. */}
                {entry.actorUid === 'migration' ? 'migration' : entry.actorUid.slice(0, 10)}
                {' · '}
                {fmt(entry)}
              </p>
              {entry.note && (
                <p className="text-xs text-content-muted mt-1 italic">{entry.note}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

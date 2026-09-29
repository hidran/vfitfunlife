'use client';

import { StatusBadge } from './StatusBadge';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import type { ProviderClient, ClientBookingHistory } from '@/types/provider';

interface OverviewTabProps {
  client: ProviderClient;
  bookingHistory: ClientBookingHistory[];
}

export default function OverviewTab({ client, bookingHistory }: OverviewTabProps) {
  const { t, locale } = useI18n();

  const formatDate = (date: Date | { toDate(): Date } | undefined) => {
    if (!date) return t('provider.clientDetail.dateNever');
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString(toLocaleTag(locale), {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Notes */}
      <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-content">{t('provider.clientDetail.notes.title')}</h3>
        </div>

        <p className="text-content/85 leading-relaxed whitespace-pre-wrap">
          {client.notes || t('provider.clientDetail.notes.empty')}
        </p>
      </div>

      {/* Recent Activity */}
      <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
        <h3 className="text-lg font-semibold text-content mb-4">{t('provider.clientDetail.recentActivity')}</h3>
        <div className="space-y-4">
          {bookingHistory.slice(0, 3).map((entry) => (
            <div
              key={entry.booking.id}
              className="flex items-center justify-between p-3 bg-surface-input rounded-lg"
            >
              <div>
                <p className="font-medium text-content">{entry.serviceName}</p>
                <p className="text-sm text-content-muted">{formatDate(entry.date)}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-content">€{entry.amount}</p>
                <StatusBadge status={entry.status} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

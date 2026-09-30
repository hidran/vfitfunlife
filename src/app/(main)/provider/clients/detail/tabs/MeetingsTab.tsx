'use client';

import { Calendar } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { formatPrice } from '@/lib/utils';
import type { ClientBookingHistory } from '@/types/provider';

interface MeetingsTabProps {
  bookingHistory: ClientBookingHistory[];
}

export default function MeetingsTab({ bookingHistory }: MeetingsTabProps) {
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
    <div className="bg-surface-elevated rounded-xl border border-hairline overflow-hidden">
      <div className="p-6 border-b border-hairline">
        <h3 className="text-lg font-semibold text-content">{t('provider.clientDetail.bookingHistory')}</h3>
      </div>
      <div className="divide-y divide-content/5 light:divide-hairline">
        {bookingHistory.map((entry) => (
          <div
            key={entry.booking.id}
            className="flex items-center justify-between p-4 hover:bg-surface-input/30"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-surface-input flex items-center justify-center">
                <Calendar className="w-6 h-6 text-section-primary light:text-primary-dark" />
              </div>
              <div>
                <p className="font-medium text-content">{entry.serviceName}</p>
                <p className="text-sm text-content-muted">{formatDate(entry.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <StatusBadge status={entry.status} />
              <p className="font-medium text-content">{formatPrice(entry.amount, locale)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

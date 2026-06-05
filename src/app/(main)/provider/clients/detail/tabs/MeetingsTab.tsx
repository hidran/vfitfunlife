'use client';

import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import type { ClientBookingHistory } from '@/types/provider';

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  confirmed: 'bg-blue-500/20 text-blue-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

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
      <div className="divide-y divide-white/5">
        {bookingHistory.map((entry) => (
          <div
            key={entry.booking.id}
            className="flex items-center justify-between p-4 hover:bg-surface-input/30"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-surface-input flex items-center justify-center">
                <Calendar className="w-6 h-6 text-section-primary" />
              </div>
              <div>
                <p className="font-medium text-content">{entry.serviceName}</p>
                <p className="text-sm text-gray-400">{formatDate(entry.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className={cn('text-xs px-3 py-1 rounded-full', STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS])}>
                {entry.status}
              </span>
              <p className="font-medium text-content">€{entry.amount}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

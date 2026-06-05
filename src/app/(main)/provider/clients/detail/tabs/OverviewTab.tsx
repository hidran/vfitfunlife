'use client';

import { useState, useEffect } from 'react';
import { Edit, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import type { ProviderClient, ClientBookingHistory } from '@/types/provider';

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  confirmed: 'bg-blue-500/20 text-blue-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

interface OverviewTabProps {
  client: ProviderClient;
  bookingHistory: ClientBookingHistory[];
}

export default function OverviewTab({ client, bookingHistory }: OverviewTabProps) {
  const { t, locale } = useI18n();
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState('');

  useEffect(() => {
    setEditedNotes(client.notes ?? '');
  }, [client]);

  const handleSaveNotes = () => {
    setIsEditingNotes(false);
  };

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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsEditingNotes(!isEditingNotes)}
          >
            {isEditingNotes ? (
              <><X className="w-4 h-4 mr-2" /> {t('provider.clientDetail.notes.cancel')}</>
            ) : (
              <><Edit className="w-4 h-4 mr-2" /> {t('provider.clientDetail.notes.edit')}</>
            )}
          </Button>
        </div>

        {isEditingNotes ? (
          <div className="space-y-3">
            <textarea
              value={editedNotes}
              onChange={(e) => setEditedNotes(e.target.value)}
              className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-3 text-content placeholder-gray-500 outline-none focus:border-section-primary min-h-[150px]"
            />
            <Button onClick={handleSaveNotes} size="sm">
              <Save className="w-4 h-4 mr-2" />
              {t('provider.clientDetail.notes.save')}
            </Button>
          </div>
        ) : (
          <p className="text-gray-300 leading-relaxed">
            {client.notes || t('provider.clientDetail.notes.empty')}
          </p>
        )}
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
                <p className="text-sm text-gray-400">{formatDate(entry.date)}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-content">€{entry.amount}</p>
                <span className={cn('text-xs px-2 py-0.5 rounded', STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS])}>
                  {entry.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

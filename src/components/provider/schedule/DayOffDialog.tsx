'use client';

/**
 * "Imposta giorno libero" — closes one date to new bookings.
 *
 * Writes that date's exception as isAvailable: false through updateMyAvailability; every
 * other exception is left as stored. Bookings already on the day are NOT cancelled (the
 * trainer has to tell those clients), so the dialog warns when there are any.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { applyDateOverride } from '@/lib/firebase/availability';
import { dayOffOverride, overlappingActive } from '@/lib/availability/dayOverride';
import type { ScheduleEvent } from '@/types/provider';
import { ScheduleSheet } from './ScheduleSheet';

class AlreadyOff extends Error {}

interface DayOffDialogProps {
  uid: string;
  /** "YYYY-MM-DD" */
  date: string;
  events: ScheduleEvent[];
  onClose: () => void;
  onSaved: () => void;
}

export function DayOffDialog({ uid, date, events, onClose, onSaved }: DayOffDialogProps) {
  const { t, locale } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = overlappingActive(events, date);

  const [y, m, d] = date.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(toLocaleTag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await applyDateOverride(uid, (stored) => {
        const existing = stored.overrides.find((o) => o.date === date);
        if (existing && !existing.isAvailable) throw new AlreadyOff();
        return dayOffOverride(date, existing);
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof AlreadyOff ? t('provider.schedule.dayOff.alreadyOff') : t('provider.schedule.dayOff.error'));
      setSaving(false);
    }
  };

  return (
    <ScheduleSheet
      title={t('provider.schedule.dateModal.setDayOff')}
      description={t('provider.schedule.dayOff.description', { date: label })}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1 min-h-11">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={saving} isLoading={saving} className="flex-1 min-h-11">
            {t('provider.schedule.dayOff.confirm')}
          </Button>
        </>
      }
    >
      {active.length > 0 && (
        <p className="flex gap-2 text-sm text-warning" role="status">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          {t('provider.schedule.dayOff.warning', { count: active.length })}
        </p>
      )}
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
    </ScheduleSheet>
  );
}

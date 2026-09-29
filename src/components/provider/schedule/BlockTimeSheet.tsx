'use client';

/**
 * "Blocca orario" — takes a from–to range out of one day's bookable hours.
 *
 * Stored as that date's exception (see lib/availability/dayOverride.ts): the day's windows
 * minus the range, merged with any exception the date already has. Existing bookings in the
 * range are not touched — the sheet says so when there are any.
 */

import { useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { applyDateOverride } from '@/lib/firebase/availability';
import { blockRangeOverride, overlappingActive } from '@/lib/availability/dayOverride';
import { romeDateKey } from '@/lib/availability/dates';
import type { MessageKey } from '@/i18n/messages';
import type { ScheduleEvent } from '@/types/provider';
import { ScheduleSheet, fieldClass } from './ScheduleSheet';

/** Half-hour marks, 00:00–23:30 — the same grid the availability editor offers. */
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`,
);

class BlockRefusal extends Error {}

interface BlockTimeSheetProps {
  uid: string;
  /** "YYYY-MM-DD" to prefill. */
  initialDate: string;
  /** The header button asks for the date; the day modal already has one. */
  dateEditable: boolean;
  /** The loaded calendar events, to warn about bookings inside the range. */
  events: ScheduleEvent[];
  onClose: () => void;
  onSaved: () => void;
}

export function BlockTimeSheet({ uid, initialDate, dateEditable, events, onClose, onSaved }: BlockTimeSheetProps) {
  const { t } = useI18n();
  const ids = { date: useId(), from: useId(), to: useId() };
  const [date, setDate] = useState(initialDate);
  const [from, setFrom] = useState('12:00');
  const [to, setTo] = useState('13:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validRange = from < to;
  const clashes = date && validRange ? overlappingActive(events, date, from, to) : [];

  const handleSave = async () => {
    if (saving) return;
    if (!validRange) {
      setError(t('provider.schedule.block.error.invalidRange'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await applyDateOverride(uid, (stored) => {
        const result = blockRangeOverride({
          schedule: stored.schedule ?? [],
          existing: stored.overrides.find((o) => o.date === date),
          date,
          from,
          to,
        });
        if (!result.ok) throw new BlockRefusal(result.reason);
        return result.override;
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof BlockRefusal
          ? t(`provider.schedule.block.error.${err.message}` as MessageKey)
          : t('provider.schedule.block.error.generic'),
      );
      setSaving(false);
    }
  };

  return (
    <ScheduleSheet
      title={t('provider.schedule.block.title')}
      description={t('provider.schedule.block.subtitle')}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1 min-h-11">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !date} isLoading={saving} className="flex-1 min-h-11">
            {t('provider.schedule.block.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {dateEditable && (
          <div className="space-y-2">
            <label htmlFor={ids.date} className="text-sm font-medium text-content">
              {t('provider.schedule.block.date')}
            </label>
            <input
              id={ids.date}
              type="date"
              value={date}
              min={romeDateKey(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor={ids.from} className="text-sm font-medium text-content">
              {t('provider.schedule.block.from')}
            </label>
            <select id={ids.from} value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass}>
              {HALF_HOURS.slice(0, -1).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor={ids.to} className="text-sm font-medium text-content">
              {t('provider.schedule.block.to')}
            </label>
            <select id={ids.to} value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass}>
              {HALF_HOURS.slice(1).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        {clashes.length > 0 && (
          <p className="flex gap-2 text-sm text-warning" role="status">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            {t('provider.schedule.block.warning', { count: clashes.length })}
          </p>
        )}
        {error && <p className="text-sm text-error" role="alert">{error}</p>}
      </div>
    </ScheduleSheet>
  );
}

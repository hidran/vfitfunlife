'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar } from '@/components/provider/Calendar';
import { ScheduleEvent, CalendarView } from '@/types/provider';
import { useShallow } from 'zustand/react/shallow';
import { useProviderStore } from '@/stores/providerStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { X, Clock, MapPin, User, FileText } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { AddAppointmentSheet } from '@/components/provider/schedule/AddAppointmentSheet';
import { BlockTimeSheet } from '@/components/provider/schedule/BlockTimeSheet';
import { DayOffDialog } from '@/components/provider/schedule/DayOffDialog';
import { localDateKey, romeDateKey } from '@/lib/availability/dates';
import { getUpcomingConfirmedSessions } from '@/lib/firebase/provider';
import { buildIcs, canExportIcs, deliverIcs } from '@/lib/calendar/ics';
import { notify } from '@/lib/notify';

/** Which schedule action sheet is open, and for which day ("YYYY-MM-DD"). */
type Sheet =
  | { kind: 'add'; date: string }
  | { kind: 'block'; date: string; dateEditable: boolean }
  | { kind: 'dayOff'; date: string };

function monthRange(anchor: Date): { start: Date; end: Date } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
}

export default function ProviderSchedulePage() {
  const { t, locale } = useI18n();
  const { schedule, fetchSchedule, isLoadingSchedule } = useProviderStore(
    useShallow((s) => ({
      schedule: s.schedule,
      fetchSchedule: s.fetchSchedule,
      isLoadingSchedule: s.isLoadingSchedule,
    })),
  );
  const [view, setView] = useState<CalendarView>('month');
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [range, setRange] = useState(() => monthRange(new Date()));
  const [exporting, setExporting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const uid = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    fetchSchedule(range.start, range.end);
  }, [fetchSchedule, range]);

  // Decided after mount: it depends on the platform, which the static export cannot know.
  useEffect(() => {
    setShowExport(canExportIcs());
  }, []);

  const refresh = useCallback(() => {
    fetchSchedule(range.start, range.end);
  }, [fetchSchedule, range]);

  // Blocked entries carry a placeholder title from the data layer; label them here.
  const events = useMemo(
    () => schedule.map((e) => (e.type === 'blocked'
      ? { ...e, title: e.blockKind === 'dayOff' ? t('provider.schedule.event.dayOff') : t('provider.schedule.event.blocked') }
      : e)),
    [schedule, t],
  );

  /** A tapped past day still opens on today: nothing can be booked or blocked in the past. */
  const actionDate = (date: Date) => {
    const key = localDateKey(date);
    const today = romeDateKey(new Date());
    return key < today ? today : key;
  };

  const openSheet = (next: Sheet) => {
    setSelectedDate(null);
    setSheet(next);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const sessions = await getUpcomingConfirmedSessions();
      if (sessions.length === 0) {
        notify.info(t('provider.schedule.ics.empty'));
        return;
      }
      const ics = buildIcs(sessions.map((s) => ({
        id: s.id,
        start: s.start,
        end: s.end,
        summary: s.title,
        location: s.location,
        description: s.notes,
      })));
      await deliverIcs(ics, `vfit-agenda-${romeDateKey(new Date())}.ics`);
      notify.success(t('provider.schedule.ics.done'));
    } catch (err) {
      // Closing the native share sheet rejects with AbortError: not a failure.
      if ((err as { name?: string })?.name !== 'AbortError') notify.error(t('provider.schedule.ics.error'));
    } finally {
      setExporting(false);
    }
  };

  const handleEventClick = (event: ScheduleEvent) => {
    setSelectedEvent(event);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString(toLocaleTag(locale), {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('provider.schedule.title')}</h1>
          <p className="text-content-muted mt-1">
            {t('provider.schedule.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {showExport && (
            <Button variant="secondary" size="sm" className="min-h-11" onClick={handleExport} isLoading={exporting}>
              {t('provider.schedule.btn.syncCalendar')}
            </Button>
          )}
          <Button
            size="sm"
            className="min-h-11"
            disabled={!uid}
            onClick={() => openSheet({ kind: 'block', date: romeDateKey(new Date()), dateEditable: true })}
          >
            {t('provider.schedule.btn.blockTime')}
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <Calendar
        events={events}
        onEventClick={handleEventClick}
        onDateSelect={handleDateSelect}
        onRangeChange={(start, end) => setRange({ start, end })}
        view={view}
        onViewChange={setView}
        loading={isLoadingSchedule}
      />

      {/* Event Detail Modal */}
      {selectedEvent && (
        <Modal onClose={() => setSelectedEvent(null)}>
          <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-content">
                {selectedEvent.type === 'blocked' ? t('provider.schedule.modal.blockedTime') : t('provider.schedule.modal.appointment')}
              </h3>
              <button
                onClick={() => setSelectedEvent(null)}
                aria-label={t('common.close')}
                className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-2"
              >
                <X className="w-5 h-5 text-content-muted" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-section-gradient flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-content-muted">{t('provider.schedule.modal.time')}</p>
                  <p className="text-content font-medium">
                    {formatTime(selectedEvent.start)} - {formatTime(selectedEvent.end)}
                  </p>
                </div>
              </div>

              {selectedEvent.type === 'booking' && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center">
                      <User className="w-5 h-5 text-content-muted" />
                    </div>
                    <div>
                      <p className="text-sm text-content-muted">{t('provider.schedule.modal.client')}</p>
                      <p className="text-content font-medium">{selectedEvent.clientName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center">
                      <FileText className="w-5 h-5 text-content-muted" />
                    </div>
                    <div>
                      <p className="text-sm text-content-muted">{t('provider.schedule.modal.service')}</p>
                      <p className="text-content font-medium">{selectedEvent.serviceName}</p>
                    </div>
                  </div>

                  {selectedEvent.location && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-content-muted" />
                      </div>
                      <div>
                        <p className="text-sm text-content-muted">{t('provider.schedule.modal.location')}</p>
                        <p className="text-content font-medium">{selectedEvent.location}</p>
                      </div>
                    </div>
                  )}

                  {selectedEvent.status && (
                    <div className="pt-4 border-t border-hairline">
                      <span className={`
                        px-3 py-1 rounded-full text-sm font-medium
                        ${selectedEvent.status === 'confirmed' ? 'bg-green-500/20 text-green-400 light:text-green-700' : ''}
                        ${selectedEvent.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 light:text-yellow-700' : ''}
                        ${selectedEvent.status === 'completed' ? 'bg-gray-500/20 text-content-muted' : ''}
                        ${selectedEvent.status === 'cancelled' ? 'bg-red-500/20 text-red-400 light:text-red-700' : ''}
                      `}>
                        {t(`provider.calendar.legend.${selectedEvent.status}`)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {selectedEvent.notes && (
                <div className="pt-4 border-t border-hairline">
                  <p className="text-sm text-content-muted mb-1">{t('provider.schedule.modal.notes')}</p>
                  <p className="text-content">{selectedEvent.notes}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              {selectedEvent.type === 'booking' && selectedEvent.bookingId && (
                <Button
                  onClick={() => window.location.href = `/provider/bookings/detail?id=${selectedEvent.bookingId}`}
                  fullWidth
                >
                  {t('provider.schedule.modal.viewBookingDetails')}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setSelectedEvent(null)}
                fullWidth
              >
                {t('provider.schedule.modal.close')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Date Selection Modal */}
      {selectedDate && !selectedEvent && (
        <Modal onClose={() => setSelectedDate(null)}>
          <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-content">
                {selectedDate.toLocaleDateString(toLocaleTag(locale), {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </h3>
              <button
                onClick={() => setSelectedDate(null)}
                aria-label={t('common.close')}
                className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-2"
              >
                <X className="w-5 h-5 text-content-muted" />
              </button>
            </div>

            <div className="space-y-3">
              <Button
                fullWidth
                className="min-h-11"
                disabled={!uid}
                onClick={() => openSheet({ kind: 'add', date: actionDate(selectedDate) })}
              >
                {t('provider.schedule.dateModal.addAppointment')}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                className="min-h-11"
                disabled={!uid}
                onClick={() => openSheet({ kind: 'block', date: actionDate(selectedDate), dateEditable: false })}
              >
                {t('provider.schedule.dateModal.blockTime')}
              </Button>
              <Button
                variant="outline"
                fullWidth
                className="min-h-11"
                disabled={!uid}
                onClick={() => openSheet({ kind: 'dayOff', date: actionDate(selectedDate) })}
              >
                {t('provider.schedule.dateModal.setDayOff')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {sheet?.kind === 'add' && uid && (
        <AddAppointmentSheet
          instructorId={uid}
          initialDate={sheet.date}
          onClose={() => setSheet(null)}
          onCreated={() => {
            notify.success(t('provider.schedule.add.success'));
            refresh();
          }}
        />
      )}
      {sheet?.kind === 'block' && uid && (
        <BlockTimeSheet
          uid={uid}
          initialDate={sheet.date}
          dateEditable={sheet.dateEditable}
          events={schedule}
          onClose={() => setSheet(null)}
          onSaved={() => {
            notify.success(t('provider.schedule.block.success'));
            refresh();
          }}
        />
      )}
      {sheet?.kind === 'dayOff' && uid && (
        <DayOffDialog
          uid={uid}
          date={sheet.date}
          events={schedule}
          onClose={() => setSheet(null)}
          onSaved={() => {
            notify.success(t('provider.schedule.dayOff.success'));
            refresh();
          }}
        />
      )}
    </div>
  );
}

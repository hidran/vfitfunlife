'use client';

import { useState, useEffect } from 'react';
import { Calendar } from '@/components/provider/Calendar';
import { ScheduleEvent, CalendarView } from '@/types/provider';
import { useProviderStore } from '@/stores/providerStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { X, Clock, MapPin, User, FileText } from 'lucide-react';

export default function ProviderSchedulePage() {
  const { t, locale } = useI18n();
  const { schedule, fetchSchedule, isLoadingSchedule } = useProviderStore();
  const [view, setView] = useState<CalendarView>('month');
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    fetchSchedule(start, end);
  }, [fetchSchedule]);

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
          <p className="text-gray-400 mt-1">
            {t('provider.schedule.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm">
            {t('provider.schedule.btn.syncCalendar')}
          </Button>
          <Button size="sm">
            {t('provider.schedule.btn.blockTime')}
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <Calendar
        events={schedule}
        onEventClick={handleEventClick}
        onDateSelect={handleDateSelect}
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
                className="p-2 rounded-lg hover:bg-surface-2"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-section-gradient flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">{t('provider.schedule.modal.time')}</p>
                  <p className="text-content font-medium">
                    {formatTime(selectedEvent.start)} - {formatTime(selectedEvent.end)}
                  </p>
                </div>
              </div>

              {selectedEvent.type === 'booking' && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center">
                      <User className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">{t('provider.schedule.modal.client')}</p>
                      <p className="text-content font-medium">{selectedEvent.clientName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">{t('provider.schedule.modal.service')}</p>
                      <p className="text-content font-medium">{selectedEvent.serviceName}</p>
                    </div>
                  </div>

                  {selectedEvent.location && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('provider.schedule.modal.location')}</p>
                        <p className="text-content font-medium">{selectedEvent.location}</p>
                      </div>
                    </div>
                  )}

                  {selectedEvent.status && (
                    <div className="pt-4 border-t border-hairline">
                      <span className={`
                        px-3 py-1 rounded-full text-sm font-medium
                        ${selectedEvent.status === 'confirmed' ? 'bg-green-500/20 text-green-400' : ''}
                        ${selectedEvent.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : ''}
                        ${selectedEvent.status === 'completed' ? 'bg-gray-500/20 text-gray-400' : ''}
                        ${selectedEvent.status === 'cancelled' ? 'bg-red-500/20 text-red-400' : ''}
                      `}>
                        {selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {selectedEvent.notes && (
                <div className="pt-4 border-t border-hairline">
                  <p className="text-sm text-gray-400 mb-1">{t('provider.schedule.modal.notes')}</p>
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
                className="p-2 rounded-lg hover:bg-surface-2"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-3">
              <Button fullWidth>
                {t('provider.schedule.dateModal.addAppointment')}
              </Button>
              <Button variant="secondary" fullWidth>
                {t('provider.schedule.dateModal.blockTime')}
              </Button>
              <Button variant="outline" fullWidth>
                {t('provider.schedule.dateModal.setDayOff')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

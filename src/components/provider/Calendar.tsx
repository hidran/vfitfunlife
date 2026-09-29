'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScheduleEvent, CalendarView, ScheduleEventStatus } from '@/types/provider';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

interface CalendarProps {
  events: ScheduleEvent[];
  onEventClick?: (event: ScheduleEvent) => void;
  onDateSelect?: (date: Date) => void;
  onRangeChange?: (start: Date, end: Date) => void;
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  loading?: boolean;
}

const VIEW_KEYS: CalendarView[] = ['month', 'week', 'day', 'agenda'];

const STATUS_COLORS: Record<ScheduleEventStatus | string, string> = {
  pending: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400 light:text-yellow-700',
  confirmed: 'bg-green-500/20 border-green-500/50 text-green-400 light:text-green-700',
  completed: 'bg-gray-500/20 border-gray-500/50 text-content-muted',
  cancelled: 'bg-red-500/20 border-red-500/50 text-red-400 light:text-red-700',
  blocked: 'bg-surface-input border-hairline text-content-muted',
};

export function Calendar({
  events,
  onEventClick,
  onDateSelect,
  onRangeChange,
  view = 'month',
  onViewChange,
  loading = false,
}: CalendarProps) {
  const { t } = useI18n();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const DAYS = [
    t('provider.calendar.day.sun'),
    t('provider.calendar.day.mon'),
    t('provider.calendar.day.tue'),
    t('provider.calendar.day.wed'),
    t('provider.calendar.day.thu'),
    t('provider.calendar.day.fri'),
    t('provider.calendar.day.sat'),
  ];
  const MONTHS = [
    t('provider.calendar.month.january'),
    t('provider.calendar.month.february'),
    t('provider.calendar.month.march'),
    t('provider.calendar.month.april'),
    t('provider.calendar.month.may'),
    t('provider.calendar.month.june'),
    t('provider.calendar.month.july'),
    t('provider.calendar.month.august'),
    t('provider.calendar.month.september'),
    t('provider.calendar.month.october'),
    t('provider.calendar.month.november'),
    t('provider.calendar.month.december'),
  ];
  const VIEW_LABELS: Record<CalendarView, string> = {
    month: t('provider.calendar.view.month'),
    week: t('provider.calendar.view.week'),
    day: t('provider.calendar.view.day'),
    agenda: t('provider.calendar.view.agenda'),
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = useMemo(() => {
    return new Date(year, month + 1, 0).getDate();
  }, [year, month]);

  const firstDayOfMonth = useMemo(() => {
    return new Date(year, month, 1).getDay();
  }, [year, month]);

  const calendarDays = useMemo(() => {
    const days = [];
    
    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }
    
    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }
    
    // Next month padding to fill 6 rows
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }
    
    return days;
  }, [year, month, firstDayOfMonth, daysInMonth]);

  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventDate = new Date(event.start);
      return (
        eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear()
      );
    });
  };

  /** Moves the visible month and tells the parent which range to load for it. */
  const goTo = (target: Date) => {
    setCurrentDate(target);
    const y = target.getFullYear();
    const m = target.getMonth();
    onRangeChange?.(new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59, 999));
  };

  const handlePrevMonth = () => {
    goTo(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    goTo(new Date(year, month + 1, 1));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateSelect?.(date);
  };

  const today = new Date();

  return (
    <div className="bg-surface-elevated rounded-xl border border-content/5 light:border-hairline overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 border-b border-content/5 light:border-hairline">
        <div className="flex items-center gap-2 sm:gap-4">
          <h2 className="text-lg font-semibold text-content">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              aria-label={t('provider.calendar.prevMonth')}
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-content/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-content-muted" />
            </button>
            <button
              onClick={handleNextMonth}
              aria-label={t('provider.calendar.nextMonth')}
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-content/10 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-content-muted" />
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-surface-input rounded-lg p-1">
            {VIEW_KEYS.map((v) => (
              <button
                key={v}
                onClick={() => onViewChange?.(v)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors',
                  view === v
                    ? 'bg-section-gradient text-white'
                    : 'text-content-muted hover:text-content'
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => goTo(new Date())}
          >
            <CalendarIcon className="w-4 h-4 mr-1" />
            {t('provider.calendar.today')}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 sm:px-4 py-2 border-b border-content/5 light:border-hairline text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500/50" />
          <span className="text-content-muted">{t('provider.calendar.legend.confirmed')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
          <span className="text-content-muted">{t('provider.calendar.legend.pending')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-gray-500/50" />
          <span className="text-content-muted">{t('provider.calendar.legend.completed')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/50" />
          <span className="text-content-muted">{t('provider.calendar.legend.cancelled')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-surface-input border border-content/20" />
          <span className="text-content-muted">{t('provider.calendar.legend.blocked')}</span>
        </div>
      </div>

      {/* Calendar Grid — tighter on phones so 7 columns fit in 390px */}
      <div className="p-2 sm:p-4">
        {/* Day Headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map((day) => (
            <div
              key={day}
              className="text-center text-xs sm:text-sm font-medium text-content-muted py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {calendarDays.map(({ date, isCurrentMonth }, index) => {
            const dateEvents = getEventsForDate(date);
            const isToday =
              date.getDate() === today.getDate() &&
              date.getMonth() === today.getMonth() &&
              date.getFullYear() === today.getFullYear();
            const isSelected =
              selectedDate &&
              date.getDate() === selectedDate.getDate() &&
              date.getMonth() === selectedDate.getMonth() &&
              date.getFullYear() === selectedDate.getFullYear();

            return (
              <div
                key={index}
                onClick={() => handleDateClick(date)}
                className={cn(
                  'min-h-[64px] min-w-0 p-1 sm:min-h-[100px] sm:p-2 rounded-lg border transition-all cursor-pointer overflow-hidden',
                  isCurrentMonth
                    ? 'bg-surface-input border-content/5 light:border-hairline'
                    : 'bg-surface-input/50 border-transparent',
                  isToday && 'ring-1 ring-section-primary',
                  isSelected && 'ring-2 ring-section-primary',
                  'hover:border-hairline'
                )}
              >
                <div
                  className={cn(
                    'text-sm font-medium mb-1',
                    isCurrentMonth ? 'text-content' : 'text-content-faint light:text-content-muted',
                    isToday && 'text-section-primary light:text-primary-dark'
                  )}
                >
                  {date.getDate()}
                </div>
                
                <div className="space-y-1">
                  {dateEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded border truncate cursor-pointer',
                        event.type === 'blocked'
                          ? STATUS_COLORS.blocked
                          : event.status
                          ? STATUS_COLORS[event.status]
                          : 'bg-gray-500/20 text-content-muted'
                      )}
                    >
                      {event.blockKind === 'dayOff'
                        ? t('provider.calendar.dayOff')
                        : `${event.start.getHours().toString().padStart(2, '0')}:${event.start
                            .getMinutes()
                            .toString()
                            .padStart(2, '0')} ${event.blockKind === 'range' ? t('provider.calendar.legend.blocked') : event.title}`}
                    </div>
                  ))}
                  {dateEvents.length > 3 && (
                    <div className="text-xs text-content-faint light:text-content-muted pl-1">
                      {t('provider.calendar.more', { count: dateEvents.length - 3 })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-surface-input/50 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-content/20 border-t-section-primary rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

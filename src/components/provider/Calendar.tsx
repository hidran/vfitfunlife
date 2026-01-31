'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScheduleEvent, CalendarView, ScheduleEventStatus } from '@/types/provider';
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

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const STATUS_COLORS: Record<ScheduleEventStatus | string, string> = {
  pending: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
  confirmed: 'bg-green-500/20 border-green-500/50 text-green-400',
  completed: 'bg-gray-500/20 border-gray-500/50 text-gray-400',
  cancelled: 'bg-red-500/20 border-red-500/50 text-red-400',
  blocked: 'bg-[#1A1D29] border-white/10 text-gray-400',
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
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

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

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateSelect?.(date);
  };

  const today = new Date();

  return (
    <div className="bg-[#2A2D3A] rounded-xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-400" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-[#1A1D29] rounded-lg p-1">
            {(['month', 'week', 'day', 'agenda'] as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => onViewChange?.(v)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors',
                  view === v
                    ? 'bg-section-gradient text-white'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            <CalendarIcon className="w-4 h-4 mr-1" />
            Today
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-white/5 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500/50" />
          <span className="text-gray-400">Confirmed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
          <span className="text-gray-400">Pending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-gray-500/50" />
          <span className="text-gray-400">Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/50" />
          <span className="text-gray-400">Cancelled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#1A1D29] border border-white/20" />
          <span className="text-gray-400">Blocked</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        {/* Day Headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map((day) => (
            <div
              key={day}
              className="text-center text-sm font-medium text-gray-400 py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1">
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
                  'min-h-[100px] p-2 rounded-lg border transition-all cursor-pointer',
                  isCurrentMonth
                    ? 'bg-[#1A1D29] border-white/5'
                    : 'bg-[#1A1D29]/50 border-transparent',
                  isToday && 'ring-1 ring-section-primary',
                  isSelected && 'ring-2 ring-section-primary',
                  'hover:border-white/10'
                )}
              >
                <div
                  className={cn(
                    'text-sm font-medium mb-1',
                    isCurrentMonth ? 'text-white' : 'text-gray-500',
                    isToday && 'text-section-primary'
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
                          : 'bg-gray-500/20 text-gray-400'
                      )}
                    >
                      {event.start.getHours().toString().padStart(2, '0')}:
                      {event.start.getMinutes().toString().padStart(2, '0')} {event.title}
                    </div>
                  ))}
                  {dateEvents.length > 3 && (
                    <div className="text-xs text-gray-500 pl-1">
                      +{dateEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-[#1A1D29]/50 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-section-primary rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

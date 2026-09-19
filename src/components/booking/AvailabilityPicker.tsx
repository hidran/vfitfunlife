'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import type { TimeSlot } from '@/types/booking';

interface AvailabilityPickerProps {
  availability: TimeSlot[];
  selectedDate: Date | null;
  selectedTime: string | null;
  onSelectDate: (date: Date) => void;
  onSelectTime: (time: string) => void;
  isLoading?: boolean;
  minDate?: Date;
  maxDate?: Date;
  timezone?: string;
  className?: string;
  /** Shown instead of the time slots, e.g. "sign in to see times" or a load failure. */
  slotsNotice?: React.ReactNode;
}

export function AvailabilityPicker({
  availability,
  selectedDate,
  selectedTime,
  onSelectDate,
  onSelectTime,
  isLoading = false,
  minDate = new Date(),
  maxDate,
  timezone = 'Europe/Rome',
  className,
  slotsNotice,
}: AvailabilityPickerProps) {
  const { t, locale } = useI18n();
  const [currentMonth, setCurrentMonth] = useState(new Date());

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

  // Ensure minDate is not in the past
  const effectiveMinDate = new Date(Math.max(minDate.getTime(), new Date().getTime()));

  // Calculate days to display
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    // Previous month padding
    const prevMonthDays = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
        isDisabled: true,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const isDisabled =
        date < new Date(effectiveMinDate.setHours(0, 0, 0, 0)) ||
        (maxDate && date > maxDate);

      days.push({
        date,
        isCurrentMonth: true,
        isDisabled,
        isToday: new Date().toDateString() === date.toDateString(),
        isSelected: selectedDate?.toDateString() === date.toDateString(),
      });
    }

    // Next month padding to fill 6 rows
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
        isDisabled: true,
      });
    }

    return days;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const calendarDays = generateCalendarDays();

  // Group time slots by period
  const morningSlots = availability.filter((s) => {
    const hour = parseInt(s.time.split(':')[0]);
    return hour < 12;
  });

  const afternoonSlots = availability.filter((s) => {
    const hour = parseInt(s.time.split(':')[0]);
    return hour >= 12 && hour < 17;
  });

  const eveningSlots = availability.filter((s) => {
    const hour = parseInt(s.time.split(':')[0]);
    return hour >= 17;
  });

  const TimeSlotGroup = ({ title, slots }: { title: string; slots: TimeSlot[] }) => {
    if (slots.length === 0) return null;

    return (
      <div className="mb-4">
        <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
          {title}
        </h4>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map((slot) => (
            <button
              key={slot.time}
              onClick={() => slot.isAvailable && onSelectTime(slot.time)}
              disabled={!slot.isAvailable}
              className={cn(
                'py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200',
                slot.isAvailable && !slot.isBooked && [
                  'bg-surface-elevated text-white hover:bg-[var(--section-primary)]/20',
                  selectedTime === slot.time && [
                    'bg-[var(--section-primary)] text-white',
                    'ring-2 ring-[var(--section-primary)] ring-offset-2 ring-offset-background-dark',
                  ],
                ],
                (!slot.isAvailable || slot.isBooked) && [
                  'bg-surface-elevated/50 text-text-tertiary cursor-not-allowed',
                  'line-through',
                ]
              )}
            >
              {slot.time}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Calendar */}
      <div className="bg-surface-elevated/50 rounded-2xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-text-secondary" />
          </button>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--section-primary)]" />
            <span className="font-semibold text-white">
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>
          </div>

          <button
            onClick={handleNextMonth}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Days of week */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAYS.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-text-tertiary py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => (
            <button
              key={index}
              onClick={() => !day.isDisabled && onSelectDate(day.date)}
              disabled={day.isDisabled}
              className={cn(
                'aspect-square rounded-lg text-sm font-medium transition-all duration-200',
                !day.isCurrentMonth && 'text-text-tertiary/50',
                day.isCurrentMonth && !day.isDisabled && 'text-white hover:bg-white/10',
                day.isDisabled && 'text-text-tertiary/30 cursor-not-allowed',
                day.isToday && [
                  'ring-1 ring-[var(--section-primary)]',
                  !day.isSelected && 'text-[var(--section-primary)]',
                ],
                day.isSelected && [
                  'bg-[var(--section-primary)] text-white',
                  'ring-2 ring-[var(--section-primary)] ring-offset-2 ring-offset-background-dark',
                ]
              )}
            >
              {day.date.getDate()}
            </button>
          ))}
        </div>
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div className="bg-surface-elevated/50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--section-primary)]" />
              <h3 className="font-semibold text-white">
                {t('booking.availability.slotsTitle')}
              </h3>
            </div>
            <span className="text-sm text-text-secondary">
              {selectedDate.toLocaleDateString(toLocaleTag(locale), {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>

          {slotsNotice ? (
            <div className="py-8 text-center text-text-secondary">{slotsNotice}</div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : availability.length === 0 ? (
            <div className="text-center py-8 text-text-secondary">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>{t('booking.availability.noSlots')}</p>
              <p className="text-sm text-text-tertiary mt-1">
                {t('booking.availability.tryAnotherDate')}
              </p>
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto scrollbar-hide">
              <TimeSlotGroup title={t('booking.availability.morning')} slots={morningSlots} />
              <TimeSlotGroup title={t('booking.availability.afternoon')} slots={afternoonSlots} />
              <TimeSlotGroup title={t('booking.availability.evening')} slots={eveningSlots} />
            </div>
          )}

          {/* Timezone indicator */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <p className="text-xs text-text-tertiary text-center">
              {t('booking.availability.timezone', { tz: timezone })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import { ChevronLeft, ChevronRight, Clock, Calendar, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import type { TimeSlot } from '@/types/booking';
import { dayAvailability, type BookableDays } from '@/lib/availability/bookableDays';

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
  /**
   * Which days have ≥1 free start (see useBookableDays). Only a confirmed `false` disables
   * a day; unknown days stay selectable while they load so the calendar is usable immediately.
   */
  bookableDays?: BookableDays;
  /** While true, days not answered yet are shown as loading and can't be picked. */
  isCheckingDays?: boolean;
  /** The month on show, reported on mount and on every prev/next, so the caller can check its days. */
  onMonthChange?: (month: Date) => void;
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
  bookableDays,
  isCheckingDays = false,
  onMonthChange,
}: AvailabilityPickerProps) {
  const { t, locale } = useI18n();
  const slotsTitleId = useId();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [slotsDate, setSlotsDate] = useState<Date | null>(null);
  const [awaitingAvailability, setAwaitingAvailability] = useState(false);
  const availabilityLoadStarted = useRef(false);

  useEffect(() => {
    if (isLoading) {
      availabilityLoadStarted.current = true;
    } else if (availabilityLoadStarted.current) {
      availabilityLoadStarted.current = false;
      setAwaitingAvailability(false);
    } else if (slotsNotice) {
      setAwaitingAvailability(false);
    }
  }, [isLoading, slotsNotice]);

  const handleDateSelect = (date: Date) => {
    setSlotsDate(date);
    setSlotsOpen(true);
    setAwaitingAvailability(true);
    onSelectDate(date);
  };

  const handleTimeSelect = (time: string) => {
    onSelectTime(time);
    setSlotsOpen(false);
  };

  useEffect(() => {
    onMonthChange?.(currentMonth);
  }, [currentMonth, onMonthChange]);

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
      const outOfRange =
        date < new Date(effectiveMinDate.setHours(0, 0, 0, 0)) ||
        (maxDate && date > maxDate);
      const status = dayAvailability(bookableDays, date);
      // Only days with a free start are pickable: a weekend or a day inside the minimum
      // notice used to open an empty "no available times" list.
      const isPending = !outOfRange && isCheckingDays && status === 'unknown';
      const isDisabled = outOfRange || status === 'unavailable';

      days.push({
        date,
        isCurrentMonth: true,
        isDisabled,
        isPending,
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

  const TimeSlotGroup = ({
    title,
    slots,
    onSelectTime,
  }: {
    title: string;
    slots: TimeSlot[];
    onSelectTime: (time: string) => void;
  }) => {
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
                slot.isAvailable && !slot.isBooked && selectedTime !== slot.time &&
                  'bg-surface-elevated text-content hover:bg-[var(--section-primary)]/20',
                // Selected: no hover tint (a tap leaves :hover on touch screens, and the /20 tint
                // then replaced the fill), and dark text — white on the section colours is
                // ~2:1, dark is 6–12:1, WCAG AA in every section.
                slot.isAvailable && !slot.isBooked && selectedTime === slot.time && [
                  'bg-[var(--section-primary)] text-slate-950 font-semibold',
                  'ring-2 ring-[var(--section-primary)] ring-offset-2 ring-offset-background-dark',
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
            aria-label={t('provider.calendar.prevMonth')}
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-content/10 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-text-secondary" />
          </button>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--section-primary)]" />
            <span className="font-semibold text-content">
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>
          </div>

          <button
            onClick={handleNextMonth}
            aria-label={t('provider.calendar.nextMonth')}
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-content/10 transition-colors"
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
              onClick={() => !day.isDisabled && handleDateSelect(day.date)}
              disabled={day.isDisabled}
              aria-disabled={day.isDisabled || undefined}
              aria-busy={day.isPending || undefined}
              className={cn(
                'aspect-square rounded-lg text-sm font-medium transition-all duration-200',
                !day.isCurrentMonth && 'text-text-tertiary/50',
                day.isCurrentMonth && !day.isDisabled && !day.isSelected && 'text-content hover:bg-content/10',
                day.isDisabled && 'text-text-tertiary/30 cursor-not-allowed',
                day.isPending && 'animate-pulse',
                day.isToday && [
                  'ring-1 ring-[var(--section-primary)]',
                  // A disabled today keeps its ring but not the accent text, so it reads as off.
                  !day.isSelected && !day.isDisabled && 'text-[var(--section-primary)]',
                ],
                day.isSelected && [
                  // Dark on the section colour for AA contrast, as for the selected time slot.
                  'bg-[var(--section-primary)] text-slate-950 font-semibold',
                  'ring-2 ring-[var(--section-primary)] ring-offset-2 ring-offset-background-dark',
                ]
              )}
            >
              {day.date.getDate()}
            </button>
          ))}
        </div>
      </div>

      {/* Selected-day slots open as a bottom sheet on mobile and a centered dialog on desktop. */}
      {slotsOpen && slotsDate && (
        <Modal
          onClose={() => {
            setSlotsOpen(false);
            setAwaitingAvailability(false);
          }}
          labelledBy={slotsTitleId}
          placement="bottom"
          className="w-full sm:max-w-lg self-end sm:self-auto rounded-t-3xl sm:rounded-2xl border border-hairline bg-background-dark p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[85dvh] sm:max-h-[80vh] animate-slide-up"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-[var(--section-primary)]" />
                <h3 id={slotsTitleId} className="font-semibold text-content">
                  {t('booking.availability.slotsTitle')}
                </h3>
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {slotsDate.toLocaleDateString(toLocaleTag(locale), {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSlotsOpen(false);
                setAwaitingAvailability(false);
              }}
              aria-label={t('common.close')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-content/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[55dvh] overflow-y-auto scrollbar-hide">
            {slotsNotice ? (
              <div className="py-8 text-center text-text-secondary">{slotsNotice}</div>
            ) : isLoading || awaitingAvailability ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : availability.length === 0 ? (
              <div className="py-8 text-center text-text-secondary">
                <Clock className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>{t('booking.availability.noSlots')}</p>
                <p className="mt-1 text-sm text-text-tertiary">
                  {t('booking.availability.tryAnotherDate')}
                </p>
              </div>
            ) : (
              <div>
                <TimeSlotGroup
                  title={t('booking.availability.morning')}
                  slots={morningSlots}
                  onSelectTime={handleTimeSelect}
                />
                <TimeSlotGroup
                  title={t('booking.availability.afternoon')}
                  slots={afternoonSlots}
                  onSelectTime={handleTimeSelect}
                />
                <TimeSlotGroup
                  title={t('booking.availability.evening')}
                  slots={eveningSlots}
                  onSelectTime={handleTimeSelect}
                />
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-hairline pt-3">
            <p className="text-center text-xs text-text-tertiary">
              {t('booking.availability.timezone', { tz: timezone })}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

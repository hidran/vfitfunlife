'use client';

import { useMemo, useState } from 'react';
import { Clock, Plus, Trash2, Check, X, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AvailabilitySchedule, DaySchedule, TimeSlot } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

interface AvailabilityCalendarProps {
  schedule: AvailabilitySchedule | null;
  onUpdate?: (schedule: AvailabilitySchedule) => void;
  isEditable?: boolean;
  className?: string;
}

type AvailabilityDay = keyof AvailabilitySchedule;

const daysOfWeek: Array<{
  key: AvailabilityDay;
  labelKey: MessageKey;
  shortKey: MessageKey;
}> = [
  {
    key: 'monday',
    labelKey: 'profile.availability.day.monday.label',
    shortKey: 'profile.availability.day.monday.short',
  },
  {
    key: 'tuesday',
    labelKey: 'profile.availability.day.tuesday.label',
    shortKey: 'profile.availability.day.tuesday.short',
  },
  {
    key: 'wednesday',
    labelKey: 'profile.availability.day.wednesday.label',
    shortKey: 'profile.availability.day.wednesday.short',
  },
  {
    key: 'thursday',
    labelKey: 'profile.availability.day.thursday.label',
    shortKey: 'profile.availability.day.thursday.short',
  },
  {
    key: 'friday',
    labelKey: 'profile.availability.day.friday.label',
    shortKey: 'profile.availability.day.friday.short',
  },
  {
    key: 'saturday',
    labelKey: 'profile.availability.day.saturday.label',
    shortKey: 'profile.availability.day.saturday.short',
  },
  {
    key: 'sunday',
    labelKey: 'profile.availability.day.sunday.label',
    shortKey: 'profile.availability.day.sunday.short',
  },
];

const defaultDaySchedule: DaySchedule = {
  isAvailable: false,
  slots: [],
};

const defaultSchedule: AvailabilitySchedule = {
  monday: { ...defaultDaySchedule },
  tuesday: { ...defaultDaySchedule },
  wednesday: { ...defaultDaySchedule },
  thursday: { ...defaultDaySchedule },
  friday: { ...defaultDaySchedule },
  saturday: { ...defaultDaySchedule },
  sunday: { ...defaultDaySchedule },
};

export function AvailabilityCalendar({
  schedule: initialSchedule,
  onUpdate,
  isEditable = true,
  className,
}: AvailabilityCalendarProps) {
  const { locale, t } = useI18n();
  const [schedule, setSchedule] = useState<AvailabilitySchedule>({
    ...defaultSchedule,
    ...initialSchedule,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<AvailabilityDay | null>(null);
  const [newSlot, setNewSlot] = useState<TimeSlot>({ start: '09:00', end: '17:00' });

  const localeTag = useMemo(() => {
    const tags = {
      it: 'it-IT',
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
    } as const;
    return tags[locale] ?? tags.it;
  }, [locale]);

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [localeTag]
  );

  const handleToggleDay = (day: AvailabilityDay) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        isAvailable: !prev[day].isAvailable,
      },
    }));
  };

  const handleAddSlot = (day: AvailabilityDay) => {
    if (!newSlot.start || !newSlot.end) return;
    if (newSlot.start >= newSlot.end) return;

    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: [...prev[day].slots, { ...newSlot }].sort((a, b) =>
          a.start.localeCompare(b.start)
        ),
      },
    }));
    setNewSlot({ start: '09:00', end: '17:00' });
  };

  const handleRemoveSlot = (day: AvailabilityDay, index: number) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.filter((_, i) => i !== index),
      },
    }));
  };

  const handleSave = () => {
    onUpdate?.(schedule);
    setIsEditing(false);
    setSelectedDay(null);
  };

  const handleCancel = () => {
    setSchedule({ ...defaultSchedule, ...initialSchedule });
    setIsEditing(false);
    setSelectedDay(null);
  };

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = Number.parseInt(hours, 10);
    const minute = Number.parseInt(minutes, 10);
    return timeFormatter.format(new Date(2000, 0, 1, hour, minute));
  };

  const getAvailableDaysCount = () => {
    return Object.values(schedule).filter((day) => day.isAvailable).length;
  };

  if (!isEditing) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="text-section-primary" size={20} />
            <h3 className="text-sm font-medium text-text-tertiary">{t('profile.availability.title')}</h3>
          </div>
          {isEditable && (
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
              {t('profile.availability.editAction')}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {daysOfWeek.map((day) => {
            const daySchedule = schedule[day.key];
            const isAvailable = daySchedule.isAvailable;

            return (
              <div
                key={day.key}
                className={cn(
                  'text-center p-2 rounded-lg transition-colors',
                  isAvailable
                    ? 'bg-success-DEFAULT/10 border border-success-DEFAULT/30'
                    : 'bg-background-secondary/5 border border-hairline'
                )}
              >
                <p
                  className={cn(
                    'text-xs font-medium uppercase',
                    isAvailable ? 'text-success-DEFAULT' : 'text-text-tertiary'
                  )}
                >
                  {t(day.shortKey)}
                </p>
                <div className="mt-1">
                  {isAvailable ? (
                    <div className="space-y-0.5">
                      {daySchedule.slots.slice(0, 2).map((slot, i) => (
                        <p key={i} className="text-[10px] text-text-inverse">
                          {slot.start.slice(0, 5)}
                        </p>
                      ))}
                      {daySchedule.slots.length > 2 && (
                        <p className="text-[10px] text-text-tertiary">
                          {t('profile.availability.moreSlots', { count: daySchedule.slots.length - 2 })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-text-tertiary">{t('profile.availability.off')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-xs text-text-tertiary">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-success-DEFAULT" />
            <span>{t('profile.availability.daysAvailable', { count: getAvailableDaysCount() })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-text-tertiary/30" />
            <span>{t('profile.availability.daysOff', { count: 7 - getAvailableDaysCount() })}</span>
          </div>
        </div>
      </div>
    );
  }

  const selectedDayConfig = daysOfWeek.find((day) => day.key === selectedDay);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-tertiary">{t('profile.availability.editTitle')}</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            <X size={16} />
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            <Check size={16} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {daysOfWeek.map((day) => {
          const daySchedule = schedule[day.key];
          const isAvailable = daySchedule.isAvailable;
          const isSelected = selectedDay === day.key;

          return (
            <button
              key={day.key}
              onClick={() => setSelectedDay(day.key)}
              className={cn(
                'text-center p-2 rounded-lg transition-all duration-200',
                isSelected
                  ? 'bg-section-gradient text-white ring-2 ring-section-primary ring-offset-2 ring-offset-background-dark'
                  : isAvailable
                    ? 'bg-success-DEFAULT/10 border border-success-DEFAULT/30 text-success-DEFAULT'
                    : 'bg-background-secondary/5 border border-hairline text-text-tertiary'
              )}
            >
              <p className="text-xs font-medium uppercase">{t(day.shortKey)}</p>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="p-4 rounded-xl bg-background-secondary/5 border border-hairline space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-text-inverse">
              {t(selectedDayConfig?.labelKey ?? 'profile.availability.day.monday.label')}
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">{t('profile.availability.availableToggle')}</span>
              <button
                onClick={() => handleToggleDay(selectedDay)}
                className={cn(
                  'w-12 h-6 rounded-full relative transition-colors duration-200',
                  schedule[selectedDay].isAvailable ? 'bg-section-primary' : 'bg-background-secondary/30'
                )}
              >
                <div
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200',
                    schedule[selectedDay].isAvailable ? 'translate-x-7' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          </div>

          {schedule[selectedDay].isAvailable && (
            <>
              <div className="space-y-2">
                {schedule[selectedDay].slots.map((slot, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 rounded-lg bg-background-secondary/10"
                  >
                    <Clock size={16} className="text-text-tertiary" />
                    <span className="flex-1 text-sm text-text-inverse">
                      {formatTime(slot.start)} - {formatTime(slot.end)}
                    </span>
                    <button
                      onClick={() => handleRemoveSlot(selectedDay, index)}
                      className="p-1 rounded text-text-tertiary hover:text-error hover:bg-error/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {schedule[selectedDay].slots.length === 0 && (
                  <p className="text-sm text-text-tertiary text-center py-2">
                    {t('profile.availability.noSlots')}
                  </p>
                )}
              </div>

              <div className="p-3 rounded-lg bg-background-secondary/10 border border-hairline">
                <p className="text-xs text-text-tertiary mb-2">{t('profile.availability.addSlot')}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={newSlot.start}
                    onChange={(event) => setNewSlot({ ...newSlot, start: event.target.value })}
                    className="flex-1 bg-background-secondary/20 border border-hairline rounded-lg px-3 py-2 text-sm text-text-inverse focus:outline-none focus:border-section-primary"
                  />
                  <span className="text-text-tertiary">{t('profile.availability.to')}</span>
                  <input
                    type="time"
                    value={newSlot.end}
                    onChange={(event) => setNewSlot({ ...newSlot, end: event.target.value })}
                    className="flex-1 bg-background-secondary/20 border border-hairline rounded-lg px-3 py-2 text-sm text-text-inverse focus:outline-none focus:border-section-primary"
                  />
                  <button
                    onClick={() => handleAddSlot(selectedDay)}
                    disabled={!newSlot.start || !newSlot.end || newSlot.start >= newSlot.end}
                    className="p-2 rounded-lg bg-section-gradient text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!selectedDay && (
        <p className="text-center text-sm text-text-tertiary py-4">
          {t('profile.availability.selectDayHint')}
        </p>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Plus, Trash2, Copy, ChevronDown, Clock, Calendar, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvailabilitySettings, DayOfWeek, DayAvailability, TimeRange, DateOverride } from '@/types/provider';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { cn } from '@/lib/utils';

interface AvailabilityEditorProps {
  settings: AvailabilitySettings;
  onSave: (settings: AvailabilitySettings) => void;
  loading?: boolean;
}

const DAY_KEYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  return `${hour.toString().padStart(2, '0')}:${minute}`;
});
const MAX_TIME_OPTION = TIME_OPTIONS[TIME_OPTIONS.length - 1]; // '23:30'
const MIN_BOOKINGS_PER_DAY = 1;
const MAX_BOOKINGS_PER_DAY = 50; // mirrors functions/src/availability/validate.ts

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * A sensible default for a new window: right after the previous one ends, one hour long
 * (clamped to the last selectable time). Always appending 09:00–17:00 duplicated the default
 * schedule's own window, which the server then refused as an overlap with a confusing
 * "windows overlap" message instead of a clear "add a real second window" affordance.
 */
export function nextSlotDefault(existingSlots: TimeRange[]): TimeRange {
  if (existingSlots.length === 0) return { start: '09:00', end: '17:00' };
  const start = existingSlots[existingSlots.length - 1].end;
  const end = fromMinutes(Math.min(toMinutes(start) + 60, toMinutes(MAX_TIME_OPTION)));
  return { start, end: end > start ? end : MAX_TIME_OPTION };
}

/**
 * Days whose windows the server would refuse: an end at or before its start, or two windows
 * overlapping. Mirrors validate.ts's own checks so the editor can catch it before a round
 * trip produces a misleading error, and can point at exactly which day is wrong.
 */
export function problemDays(weeklySchedule: AvailabilitySettings['weeklySchedule']): Set<DayOfWeek> {
  const bad = new Set<DayOfWeek>();
  for (const day of DAY_KEYS) {
    const { isAvailable, slots } = weeklySchedule[day];
    if (!isAvailable || slots.length === 0) continue;
    const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < sorted.length; i++) {
      const invalid = sorted[i].start >= sorted[i].end;
      const overlapsPrevious = i > 0 && sorted[i].start < sorted[i - 1].end;
      if (invalid || overlapsPrevious) {
        bad.add(day);
        break;
      }
    }
  }
  return bad;
}

export function AvailabilityEditor({ settings, onSave, loading }: AvailabilityEditorProps) {
  const { t, locale } = useI18n();
  const [localSettings, setLocalSettings] = useState<AvailabilitySettings>(settings);

  const DAYS: { key: DayOfWeek; label: string }[] = [
    { key: 'monday', label: t('provider.availabilityEditor.day.monday') },
    { key: 'tuesday', label: t('provider.availabilityEditor.day.tuesday') },
    { key: 'wednesday', label: t('provider.availabilityEditor.day.wednesday') },
    { key: 'thursday', label: t('provider.availabilityEditor.day.thursday') },
    { key: 'friday', label: t('provider.availabilityEditor.day.friday') },
    { key: 'saturday', label: t('provider.availabilityEditor.day.saturday') },
    { key: 'sunday', label: t('provider.availabilityEditor.day.sunday') },
  ];
  const [activeTab, setActiveTab] = useState<'weekly' | 'overrides'>('weekly');
  const [expandedDay, setExpandedDay] = useState<DayOfWeek | null>(null);
  const badDays = problemDays(localSettings.weeklySchedule);
  const [newOverrideDate, setNewOverrideDate] = useState('');

  const updateDayAvailability = (day: DayOfWeek, updates: Partial<DayAvailability>) => {
    setLocalSettings(prev => ({
      ...prev,
      weeklySchedule: {
        ...prev.weeklySchedule,
        [day]: {
          ...prev.weeklySchedule[day],
          ...updates,
        },
      },
    }));
  };

  const addTimeSlot = (day: DayOfWeek) => {
    const currentSlots = localSettings.weeklySchedule[day].slots;
    updateDayAvailability(day, {
      slots: [...currentSlots, nextSlotDefault(currentSlots)],
    });
  };

  const removeTimeSlot = (day: DayOfWeek, index: number) => {
    const currentSlots = localSettings.weeklySchedule[day].slots;
    updateDayAvailability(day, {
      slots: currentSlots.filter((_, i) => i !== index),
    });
  };

  const updateTimeSlot = (day: DayOfWeek, index: number, field: keyof TimeRange, value: string) => {
    const currentSlots = localSettings.weeklySchedule[day].slots;
    const updatedSlots = currentSlots.map((slot, i) =>
      i === index ? { ...slot, [field]: value } : slot
    );
    updateDayAvailability(day, { slots: updatedSlots });
  };

  const copyToAllDays = (sourceDay: DayOfWeek) => {
    const sourceSchedule = localSettings.weeklySchedule[sourceDay];
    const newSchedule = { ...localSettings.weeklySchedule };

    DAY_KEYS.forEach((key) => {
      if (key !== sourceDay) {
        newSchedule[key] = {
          isAvailable: sourceSchedule.isAvailable,
          slots: [...sourceSchedule.slots],
        };
      }
    });

    setLocalSettings(prev => ({
      ...prev,
      weeklySchedule: newSchedule,
    }));
  };

  const addDateOverride = () => {
    // One exception per date: the server stores them keyed by date.
    if (!newOverrideDate || localSettings.dateOverrides.some((o) => o.date === newOverrideDate)) return;

    const newOverride: DateOverride = {
      id: `override-${newOverrideDate}`,
      date: newOverrideDate,
      isAvailable: false,
      slots: [],
      reason: '',
    };

    setLocalSettings(prev => ({
      ...prev,
      dateOverrides: [...prev.dateOverrides, newOverride],
    }));
    setNewOverrideDate('');
  };

  const removeDateOverride = (id: string) => {
    setLocalSettings(prev => ({
      ...prev,
      dateOverrides: prev.dateOverrides.filter(o => o.id !== id),
    }));
  };

  const updateDateOverride = (id: string, updates: Partial<DateOverride>) => {
    setLocalSettings(prev => ({
      ...prev,
      dateOverrides: prev.dateOverrides.map(o =>
        o.id === id ? { ...o, ...updates } : o
      ),
    }));
  };

  const updateOverrideSlots = (id: string, update: (slots: TimeRange[]) => TimeRange[]) => {
    setLocalSettings(prev => ({
      ...prev,
      dateOverrides: prev.dateOverrides.map(o =>
        o.id === id ? { ...o, slots: update(o.slots) } : o
      ),
    }));
  };

  const handleSave = () => {
    onSave(localSettings);
  };

  return (
    <div className="bg-surface-elevated rounded-xl border border-white/5 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setActiveTab('weekly')}
          className={cn(
            'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors',
            activeTab === 'weekly'
              ? 'text-white border-b-2 border-section-primary'
              : 'text-gray-400 hover:text-white'
          )}
        >
          <Clock className="w-4 h-4" />
          {t('provider.availabilityEditor.tab.weekly')}
        </button>
        <button
          onClick={() => setActiveTab('overrides')}
          className={cn(
            'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors',
            activeTab === 'overrides'
              ? 'text-white border-b-2 border-section-primary'
              : 'text-gray-400 hover:text-white'
          )}
        >
          <Calendar className="w-4 h-4" />
          {t('provider.availabilityEditor.tab.overrides')}
          {localSettings.dateOverrides.length > 0 && (
            <span className="bg-section-primary text-white text-xs px-1.5 py-0.5 rounded-full">
              {localSettings.dateOverrides.length}
            </span>
          )}
        </button>
      </div>

      {/* Weekly Schedule */}
      {activeTab === 'weekly' && (
        <div className="p-6 space-y-4">
          {DAYS.map(({ key, label }) => {
            const daySchedule = localSettings.weeklySchedule[key];
            const isExpanded = expandedDay === key;
            const hasProblem = badDays.has(key);

            return (
              <div
                key={key}
                className={cn(
                  'bg-surface-input rounded-lg border transition-all',
                  hasProblem ? 'border-error/60' : isExpanded ? 'border-section-primary/50' : 'border-white/5'
                )}
              >
                <div className="flex items-center gap-3 p-2">
                  <input
                    type="checkbox"
                    checked={daySchedule.isAvailable}
                    onChange={(e) => updateDayAvailability(key, { isAvailable: e.target.checked })}
                    aria-label={label}
                    className="ml-2 h-5 w-5 flex-shrink-0 rounded border-white/20 bg-transparent text-section-primary focus:ring-section-primary"
                  />
                  {/* A real button (not a clickable div) so the row is keyboard-operable; the
                      checkbox stays a sibling since interactive content can't nest in a button. */}
                  <button
                    type="button"
                    onClick={() => setExpandedDay(isExpanded ? null : key)}
                    aria-expanded={isExpanded}
                    className="flex min-h-[44px] flex-1 items-center justify-between rounded-lg py-2 pr-2 text-left"
                  >
                    <span className={cn(
                      'flex items-center gap-2 font-medium',
                      daySchedule.isAvailable ? 'text-white' : 'text-gray-500'
                    )}>
                      {label}
                      {hasProblem && <AlertCircle className="h-4 w-4 flex-shrink-0 text-error" aria-hidden="true" />}
                    </span>

                    <div className="flex items-center gap-3">
                      {daySchedule.isAvailable && daySchedule.slots.length > 0 && (
                        <span className="text-sm text-gray-400">
                          {daySchedule.slots.length > 1
                            ? t('provider.availabilityEditor.slots', { count: daySchedule.slots.length })
                            : t('provider.availabilityEditor.slot', { count: daySchedule.slots.length })}
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          'w-5 h-5 text-gray-400 transition-transform',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </div>
                  </button>
                </div>

                {hasProblem && (
                  <p role="alert" className="px-4 pb-2 text-xs text-error">
                    {t('provider.availabilityEditor.dayProblem')}
                  </p>
                )}

                {isExpanded && daySchedule.isAvailable && (
                  <div className="px-4 pb-4 space-y-3">
                    {daySchedule.slots.map((slot, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="flex min-h-[44px] items-center gap-2 bg-surface-elevated rounded-lg px-3 py-2">
                          <select
                            value={slot.start}
                            onChange={(e) => updateTimeSlot(key, index, 'start', e.target.value)}
                            aria-label={t('provider.availabilityEditor.startTime')}
                            className="min-h-[44px] bg-transparent text-white text-sm outline-none"
                          >
                            {TIME_OPTIONS.map(time => (
                              <option key={time} value={time}>{time}</option>
                            ))}
                          </select>
                        </div>

                        <span className="text-gray-500">{t('provider.availabilityEditor.slotTo')}</span>

                        <div className="flex min-h-[44px] items-center gap-2 bg-surface-elevated rounded-lg px-3 py-2">
                          <select
                            value={slot.end}
                            onChange={(e) => updateTimeSlot(key, index, 'end', e.target.value)}
                            aria-label={t('provider.availabilityEditor.endTime')}
                            className="min-h-[44px] bg-transparent text-white text-sm outline-none"
                          >
                            {TIME_OPTIONS.map(time => (
                              <option key={time} value={time}>{time}</option>
                            ))}
                          </select>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => removeTimeSlot(key, index)}
                          aria-label={t('provider.availabilityEditor.removeSlot')}
                          className="touch-target flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => addTimeSlot(key)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        {t('provider.availabilityEditor.addSlot')}
                      </Button>

                      <button
                        onClick={() => copyToAllDays(key)}
                        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                        {t('provider.availabilityEditor.copyToAll')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Date Overrides */}
      {activeTab === 'overrides' && (
        <div className="p-6 space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-2">{t('provider.availabilityEditor.override.addLabel')}</label>
              <input
                type="date"
                value={newOverrideDate}
                onChange={(e) => setNewOverrideDate(e.target.value)}
                className="w-full bg-surface-input border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-section-primary"
              />
            </div>
            <Button onClick={addDateOverride} disabled={!newOverrideDate}>
              <Plus className="w-4 h-4 mr-1" />
              {t('provider.availabilityEditor.override.add')}
            </Button>
          </div>

          {localSettings.dateOverrides.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">{t('provider.availabilityEditor.override.empty')}</p>
              <p className="text-sm text-gray-500 mt-1">
                {t('provider.availabilityEditor.override.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {localSettings.dateOverrides.map((override) => (
                <div
                  key={override.id}
                  className="bg-surface-input rounded-lg border border-white/5 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-white">
                        {/* Noon, not midnight: a bare YYYY-MM-DD parses as UTC and can show the day before. */}
                        {new Date(`${override.date}T12:00:00`).toLocaleDateString(toLocaleTag(locale), {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                      
                      <div className="flex items-center gap-4 mt-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={!override.isAvailable}
                            onChange={() => updateDateOverride(override.id, { isAvailable: false })}
                            className="w-4 h-4 text-section-primary focus:ring-section-primary"
                          />
                          <span className="text-sm text-gray-400">{t('provider.availabilityEditor.override.unavailable')}</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={override.isAvailable}
                            onChange={() => updateDateOverride(override.id, {
                              isAvailable: true,
                              slots: override.slots.length > 0 ? override.slots : [{ start: '09:00', end: '17:00' }],
                            })}
                            className="w-4 h-4 text-section-primary focus:ring-section-primary"
                          />
                          <span className="text-sm text-gray-400">{t('provider.availabilityEditor.override.customHours')}</span>
                        </label>
                      </div>

                      {override.isAvailable && (
                        <div className="mt-3 space-y-2">
                          {override.slots.map((slot, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <select
                                value={slot.start}
                                onChange={(e) => updateOverrideSlots(override.id, (slots) =>
                                  slots.map((s, i) => (i === index ? { ...s, start: e.target.value } : s)))}
                                aria-label={t('provider.availabilityEditor.startTime')}
                                className="min-h-[44px] bg-surface-elevated rounded px-2 py-1 text-sm text-white outline-none"
                              >
                                {TIME_OPTIONS.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <span className="text-gray-500">{t('provider.availabilityEditor.slotTo')}</span>
                              <select
                                value={slot.end}
                                onChange={(e) => updateOverrideSlots(override.id, (slots) =>
                                  slots.map((s, i) => (i === index ? { ...s, end: e.target.value } : s)))}
                                aria-label={t('provider.availabilityEditor.endTime')}
                                className="min-h-[44px] bg-surface-elevated rounded px-2 py-1 text-sm text-white outline-none"
                              >
                                {TIME_OPTIONS.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => updateOverrideSlots(override.id, (slots) => slots.filter((_, i) => i !== index))}
                                aria-label={t('provider.availabilityEditor.removeSlot')}
                                className="touch-target flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => updateOverrideSlots(override.id, (slots) => [...slots, { start: '09:00', end: '17:00' }])}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            {t('provider.availabilityEditor.addSlot')}
                          </Button>
                        </div>
                      )}

                      <input
                        type="text"
                        placeholder={t('provider.availabilityEditor.override.reason')}
                        value={override.reason || ''}
                        onChange={(e) => updateDateOverride(override.id, { reason: e.target.value })}
                        className="mt-3 w-full bg-surface-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-section-primary"
                      />
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => removeDateOverride(override.id)}
                      aria-label={t('provider.availabilityEditor.override.remove')}
                      className="touch-target flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings */}
      <div className="border-t border-white/5 p-6">
        <h4 className="font-medium text-white mb-4">{t('provider.availabilityEditor.settings.title')}</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t('provider.availabilityEditor.settings.bufferTime')}</label>
            <select
              value={localSettings.bufferMinutes}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, bufferMinutes: parseInt(e.target.value) }))}
              className="w-full bg-surface-input border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-section-primary"
            >
              <option value={0}>{t('provider.availabilityEditor.settings.bufferNone')}</option>
              <option value={5}>{t('provider.availabilityEditor.settings.buffer5')}</option>
              <option value={10}>{t('provider.availabilityEditor.settings.buffer10')}</option>
              <option value={15}>{t('provider.availabilityEditor.settings.buffer15')}</option>
              <option value={30}>{t('provider.availabilityEditor.settings.buffer30')}</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t('provider.availabilityEditor.settings.advanceNotice')}</label>
            <select
              value={localSettings.minAdvanceNoticeHours}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, minAdvanceNoticeHours: parseInt(e.target.value) }))}
              className="w-full bg-surface-input border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-section-primary"
            >
              <option value={0}>{t('provider.availabilityEditor.settings.sameDay')}</option>
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t('provider.availabilityEditor.settings.maxBookings')}</label>
            <input
              type="number"
              min={MIN_BOOKINGS_PER_DAY}
              max={MAX_BOOKINGS_PER_DAY}
              value={localSettings.maxBookingsPerDay}
              onChange={(e) => {
                // The min/max attributes are only a spinner hint — typing "999" is not
                // blocked by the browser, and the server refuses it outright.
                const parsed = parseInt(e.target.value, 10) || MIN_BOOKINGS_PER_DAY;
                const clamped = Math.min(MAX_BOOKINGS_PER_DAY, Math.max(MIN_BOOKINGS_PER_DAY, parsed));
                setLocalSettings(prev => ({ ...prev, maxBookingsPerDay: clamped }));
              }}
              className="w-full bg-surface-input border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-section-primary"
            />
          </div>
          
          <div>
            <p className="block text-sm text-gray-400 mb-2">{t('provider.availabilityEditor.settings.timezone')}</p>
            {/* Every provider is in Italy; the server computes all slots in Europe/Rome. */}
            <p className="py-2.5 text-sm text-white">{t('provider.availabilityEditor.settings.timezoneNote')}</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="border-t border-white/5 p-6">
        {badDays.size > 0 && (
          <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-error">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {t('provider.availabilityEditor.fixBeforeSaving')}
          </p>
        )}
        <Button
          onClick={handleSave}
          isLoading={loading}
          disabled={badDays.size > 0}
          fullWidth
        >
          {t('provider.availabilityEditor.save')}
        </Button>
      </div>
    </div>
  );
}

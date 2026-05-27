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
    const newSlot: TimeRange = { start: '09:00', end: '17:00' };
    updateDayAvailability(day, {
      slots: [...currentSlots, newSlot],
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
    if (!newOverrideDate) return;
    
    const newOverride: DateOverride = {
      id: `override-${Date.now()}`,
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

  const handleSave = () => {
    onSave(localSettings);
  };

  return (
    <div className="bg-[#2A2D3A] rounded-xl border border-white/5 overflow-hidden">
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

            return (
              <div
                key={key}
                className={cn(
                  'bg-[#1A1D29] rounded-lg border transition-all',
                  isExpanded ? 'border-section-primary/50' : 'border-white/5'
                )}
              >
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => setExpandedDay(isExpanded ? null : key)}
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={daySchedule.isAvailable}
                      onChange={(e) => {
                        e.stopPropagation();
                        updateDayAvailability(key, { isAvailable: e.target.checked });
                      }}
                      className="w-5 h-5 rounded border-white/20 bg-transparent text-section-primary focus:ring-section-primary"
                    />
                    <span className={cn(
                      'font-medium',
                      daySchedule.isAvailable ? 'text-white' : 'text-gray-500'
                    )}>
                      {label}
                    </span>
                  </div>
                  
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
                </div>

                {isExpanded && daySchedule.isAvailable && (
                  <div className="px-4 pb-4 space-y-3">
                    {daySchedule.slots.map((slot, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-[#2A2D3A] rounded-lg px-3 py-2">
                          <select
                            value={slot.start}
                            onChange={(e) => updateTimeSlot(key, index, 'start', e.target.value)}
                            className="bg-transparent text-white text-sm outline-none"
                          >
                            {TIME_OPTIONS.map(time => (
                              <option key={time} value={time}>{time}</option>
                            ))}
                          </select>
                        </div>
                        
                        <span className="text-gray-500">{t('provider.availabilityEditor.slotTo')}</span>

                        <div className="flex items-center gap-2 bg-[#2A2D3A] rounded-lg px-3 py-2">
                          <select
                            value={slot.end}
                            onChange={(e) => updateTimeSlot(key, index, 'end', e.target.value)}
                            className="bg-transparent text-white text-sm outline-none"
                          >
                            {TIME_OPTIONS.map(time => (
                              <option key={time} value={time}>{time}</option>
                            ))}
                          </select>
                        </div>
                        
                        <button
                          onClick={() => removeTimeSlot(key, index)}
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
                className="w-full bg-[#1A1D29] border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-section-primary"
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
                  className="bg-[#1A1D29] rounded-lg border border-white/5 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-white">
                        {new Date(override.date).toLocaleDateString(toLocaleTag(locale), {
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
                            onChange={() => updateDateOverride(override.id, { isAvailable: true })}
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
                                className="bg-[#2A2D3A] rounded px-2 py-1 text-sm text-white outline-none"
                              >
                                {TIME_OPTIONS.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <span className="text-gray-500">{t('provider.availabilityEditor.slotTo')}</span>
                              <select
                                value={slot.end}
                                className="bg-[#2A2D3A] rounded px-2 py-1 text-sm text-white outline-none"
                              >
                                {TIME_OPTIONS.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                          <Button variant="secondary" size="sm">
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
                        className="mt-3 w-full bg-[#2A2D3A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-section-primary"
                      />
                    </div>
                    
                    <button
                      onClick={() => removeDateOverride(override.id)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
              className="w-full bg-[#1A1D29] border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-section-primary"
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
              className="w-full bg-[#1A1D29] border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-section-primary"
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
              min={1}
              max={50}
              value={localSettings.maxBookingsPerDay}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, maxBookingsPerDay: parseInt(e.target.value) || 1 }))}
              className="w-full bg-[#1A1D29] border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-section-primary"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t('provider.availabilityEditor.settings.timezone')}</label>
            <select
              value={localSettings.timezone}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, timezone: e.target.value }))}
              className="w-full bg-[#1A1D29] border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-section-primary"
            >
              <option value="Europe/Rome">Europe/Rome (CET/CEST)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="America/New_York">America/New_York (ET)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="border-t border-white/5 p-6">
        <Button
          onClick={handleSave}
          isLoading={loading}
          fullWidth
        >
          {t('provider.availabilityEditor.save')}
        </Button>
      </div>
    </div>
  );
}

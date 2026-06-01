'use client';

import { useEffect } from 'react';
import { AvailabilityEditor } from '@/components/provider/AvailabilityEditor';
import { useProviderStore } from '@/stores/providerStore';
import { useI18n } from '@/hooks/useI18n';
import { AvailabilitySettings } from '@/types/provider';

const DEFAULT_AVAILABILITY: AvailabilitySettings = {
  weeklySchedule: {
    monday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
    tuesday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
    wednesday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
    thursday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
    friday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
    saturday: { isAvailable: false, slots: [] },
    sunday: { isAvailable: false, slots: [] },
  },
  dateOverrides: [],
  bufferMinutes: 15,
  minAdvanceNoticeHours: 24,
  maxBookingsPerDay: 8,
  timezone: 'Europe/Rome',
};

export default function ProviderAvailabilityPage() {
  const { t } = useI18n();
  const { availability, isLoading, fetchAvailability, updateAvailability } = useProviderStore();

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  const handleSave = async (settings: AvailabilitySettings) => {
    await updateAvailability(settings);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-content">{t('provider.availability.title')}</h1>
        <p className="text-gray-400 mt-1">
          {t('provider.availability.subtitle')}
        </p>
      </div>

      {/* Availability Editor */}
      <AvailabilityEditor
        settings={availability || DEFAULT_AVAILABILITY}
        onSave={handleSave}
        loading={isLoading}
      />
    </div>
  );
}

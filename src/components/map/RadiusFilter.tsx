'use client';
import { MapPin, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/lib/geo';
import type { RadiusKm } from '@/hooks/useNearMe';
import { useI18n } from '@/hooks/useI18n';

interface RadiusFilterProps {
  userLocation: LatLng | null;
  radiusKm: RadiusKm;
  isLocating: boolean;
  error: string | null;
  onRequestLocation: () => void;
  onClearLocation: () => void;
  onRadiusChange: (r: RadiusKm) => void;
  className?: string;
}

const RADIUS_OPTIONS: RadiusKm[] = [5, 10, 25, 50, null];

export function RadiusFilter({
  userLocation,
  radiusKm,
  isLocating,
  error,
  onRequestLocation,
  onClearLocation,
  onRadiusChange,
  className,
}: RadiusFilterProps) {
  const { t } = useI18n();
  if (!userLocation) {
    return (
      <div className={cn('space-y-1', className)}>
        <button
          type="button"
          onClick={onRequestLocation}
          disabled={isLocating}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-text-tertiary hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
          {t('booking.nearMe')}
        </button>
        {error && <p className="text-[11px] text-text-tertiary">{t('booking.locationUnavailable')}</p>}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {RADIUS_OPTIONS.map((r) => (
        <button
          key={r ?? 'all'}
          type="button"
          onClick={() => onRadiusChange(r)}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
            radiusKm === r
              ? 'bg-section-primary text-background-dark'
              : 'border border-white/10 bg-white/5 text-text-tertiary hover:bg-white/10'
          )}
        >
          {r === null ? t('booking.category.all') : `${r} km`}
        </button>
      ))}
      <button
        type="button"
        onClick={onClearLocation}
        className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-text-tertiary hover:text-white"
        aria-label={t('booking.disableLocation')}
      >
        <X className="h-3.5 w-3.5" /> {t('booking.disableLocation')}
      </button>
    </div>
  );
}

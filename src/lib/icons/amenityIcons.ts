// src/lib/icons/amenityIcons.ts
import {
  Dumbbell,
  Wifi,
  Car,
  Droplet,
  Lock,
  Coffee,
  Bath,
  Waves,
  Flame,
  Square,
  Sparkles,
  Activity,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AmenityKind } from '@/types/venue';

export const AMENITY_ICONS: Record<AmenityKind, LucideIcon> = {
  weights: Dumbbell,
  wifi: Wifi,
  parking: Car,
  showers: Droplet,
  lockers: Lock,
  bar: Coffee,
  sauna: Bath,
  pool: Waves,
  crossfit: Flame,
  boxing: Activity,
  yoga: Sparkles,
  pilates: Sparkles,
  spa: Sparkles,
  tennis: Square,
  cardio: Activity,
};

export function amenityIcon(kind: AmenityKind): LucideIcon {
  const icon = AMENITY_ICONS[kind];
  if (!icon) {
    console.warn(`[amenityIcon] No icon registered for kind "${kind}"`);
    return HelpCircle;
  }
  return icon;
}

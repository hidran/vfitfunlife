// src/types/venue.ts
import type { Timestamp } from 'firebase/firestore';

export type VenueType = 'gym' | 'wellness_center' | 'spa' | 'beauty_salon';

export type AmenityKind =
  | 'sala_pesi'
  | 'wifi'
  | 'parcheggio'
  | 'docce'
  | 'sauna'
  | 'pool'
  | 'crossfit'
  | 'boxing'
  | 'yoga'
  | 'pilates'
  | 'spa'
  | 'tennis'
  | 'weights'
  | 'cardio';

export interface AmenityRef {
  kind: AmenityKind;
  labelKey?: string;
}

export interface VenueHours {
  day: string;
  time: string;
}

export interface Venue {
  id: string;
  name: string;
  slug: string;
  type: VenueType;
  city: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  isPartner: boolean;
  isActive: boolean;
  description: string;
  heroGradients: string[];
  amenities: AmenityRef[];
  hours: VenueHours[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VenueService {
  id: string;
  name: string;
  price: number;
  durationMinutes?: number;
  description?: string;
  isActive: boolean;
}

export interface VenueCourse {
  id: string;
  name: string;
  time: string;
  coach: string;
  spots: number;
  dayOfWeek?: number;
}

export interface VenueListOptions {
  type?: VenueType;
  city?: string;
  limit?: number;
}

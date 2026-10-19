// src/types/venue.ts
import type { Timestamp } from 'firebase/firestore';

export type VenueType =
  | 'gym'
  | 'wellness_center'
  | 'spa'
  | 'beauty_salon'
  | 'school'
  | 'studio'
  | 'outdoor_space'
  | 'event_space';

/**
 * Venue types that host group courses (a business's own timetable lives on these). The one
 * list behind hostsCourses, the /fit/gyms query and the business venue-type choices; the
 * `activePartnerGym` rule in firestore.rules repeats it and a test pins the two together.
 * Mirrored in functions/src/types.ts.
 */
export const COURSE_VENUE_TYPES = ['gym', 'school', 'studio'] as const satisfies readonly VenueType[];

export function hostsCourses(type: VenueType): boolean {
  return (COURSE_VENUE_TYPES as readonly VenueType[]).includes(type);
}

export type AmenityKind =
  | 'weights'
  | 'wifi'
  | 'parking'
  | 'showers'
  | 'lockers'
  | 'bar'
  | 'sauna'
  | 'pool'
  | 'crossfit'
  | 'boxing'
  | 'yoga'
  | 'pilates'
  | 'spa'
  | 'tennis'
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
  /** geofire-common geohash (precision 10) of lat/lng, kept in sync by syncVenueGeohash. */
  geohash?: string;
  rating: number;
  reviewCount: number;
  isPartner: boolean;
  partnerStatus?: 'pending' | 'active' | 'suspended';
  memberDiscountPercent?: number;
  partnerInstructorExtraPercent?: number;
  ownerId?: string;
  isActive: boolean;
  description: string;
  heroGradients: string[];
  amenities: AmenityRef[];
  hours: VenueHours[];
  photoUrls?: string[]; // max 10. photoUrls[0] is the cover.
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
  /**
   * Several types at once (`type in [...]`). Wins over `type` when both are given, and an
   * empty list matches nothing (it is not "no filter").
   */
  types?: readonly VenueType[];
  city?: string;
  limit?: number;
  /** Highest-rated first: the bounded list shown when the user's location is unknown. */
  orderByRating?: boolean;
  /** Prevent fetching when the current screen does not show venues. */
  enabled?: boolean;
}

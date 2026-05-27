// src/types/instructor.ts
import type { Timestamp } from 'firebase/firestore';
import type { ProviderApplicationStatus } from '@/types/firebase';

export type ActivityKind = 'event' | 'vr' | 'party';

export interface Provider {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  // VFun bookable-activity fields (absent ⇒ a real trainer)
  activityKind?: ActivityKind;
  eventDate?: string;      // events, e.g. "16 Feb"
  eventTime?: string;      // events, e.g. "18:30"
  location?: string;       // events, display location
  attendees?: number;      // events
  tag?: 'hot' | 'vip' | 'new'; // events
  durationMinutes?: number; // vr session length
  partyType?: string;      // party packages, e.g. "private"
  applicationStatus?: ProviderApplicationStatus;
  isActive: boolean;
  specialties: string[];
  yearsOfExperience: number;
  languages: string[];
  photoUrls?: string[]; // max 10. photoUrls[0] is the cover.
  bioKey?: string;
  city?: string;
  lat?: number;
  lng?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface InstructorService {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
}

export interface ProviderListOptions {
  limit?: number;
  specialty?: string;
  onlyVerified?: boolean;
}

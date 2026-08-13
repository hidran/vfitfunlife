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
  lowestPrice?: number;    // denormalized cheapest service price (for cards)
  /**
   * Derived from the categories of this provider's ACTIVE services, expanded to include
   * ancestors, by the onProviderServiceWrite trigger. Replaces `specialties` as the
   * search key — the old one matched on Italian display names, so renaming a category
   * orphaned every provider carrying the old string.
   */
  categoryIds?: string[];
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
  /**
   * Leaf category from the service taxonomy. Optional through phases 1-2 while the
   * backfill runs; required from the cutover on.
   * Spec: docs/superpowers/specs/2026-08-13-service-taxonomy-design.md
   */
  categoryId?: string;
  /** The category and its ancestors, denormalized so one array-contains filters at any depth. */
  categoryIds?: string[];
}

export interface ProviderListOptions {
  limit?: number;
  /** @deprecated matched Italian display names; use categoryId. */
  specialty?: string;
  /** Taxonomy id — a group matches its whole subtree via denormalized ancestry. */
  categoryId?: string;
  onlyVerified?: boolean;
}

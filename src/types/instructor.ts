// src/types/instructor.ts
import type { Timestamp } from 'firebase/firestore';
import type { ProviderApplicationStatus } from '@/types/firebase';

export interface Provider {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
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

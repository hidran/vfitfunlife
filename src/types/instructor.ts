// src/types/instructor.ts
import type { Timestamp } from 'firebase/firestore';

export interface Provider {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  isActive: boolean;
  specialties: string[];
  yearsOfExperience: number;
  languages: string[];
  bioKey?: string;
  city?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ProviderService {
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

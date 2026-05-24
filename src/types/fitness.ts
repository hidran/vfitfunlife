import type { Timestamp } from 'firebase/firestore';

export type ClassCategory = 'yoga' | 'hiit' | 'pilates' | 'functional' | 'cardio' | 'strength';

export interface FitnessClass {
  id: string;
  title: string;
  category: ClassCategory;
  trainer: string;
  time: string;          // 'HH:mm', for display
  scheduledAt?: Timestamp; // optional, for filtering by day
  durationMinutes: number;
  spotsLeft: number;
  rating: number;
  venueId?: string;
  isActive: boolean;
}

export interface HomeTrainingService {
  id: string;
  title: string;
  coach: string;
  eta: string;           // 'Disponibile oggi 18:00' free-form
  rating: number;
  fromPrice: string;     // 'Da EUR 55' free-form
  isActive: boolean;
}

export type VirtualLevel = 'Tutti' | 'Principiante' | 'Intermedio' | 'Avanzato';

export interface VirtualProgram {
  id: string;
  title: string;
  level: VirtualLevel;
  durationMinutes: number;
  rating: number;
  live: boolean;
  scheduledAt?: Timestamp;
  isActive: boolean;
}

import type { Timestamp } from 'firebase/firestore';

export interface Testimonial {
  id: string;
  userName: string;
  avatarUrl: string | null;
  rating: number;
  text: string;
  serviceLabel: string;
  date: string;            // Italian-formatted free-form for display
  createdAt?: Timestamp;
}

export interface Review {
  id: string;
  userName: string;
  avatarUrl: string | null;
  rating: number;
  text: string;
  createdAt?: Timestamp;
}

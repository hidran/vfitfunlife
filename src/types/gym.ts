import type { Timestamp } from 'firebase/firestore';

export interface GymLocation {
  id: string; name: string; address: string; city: string; timezone: string; isActive: boolean;
}
export interface GymRoom { id: string; name: string; isActive: boolean }
export interface GymInstructorLink { id: string; name: string; photoUrl?: string; isActive: boolean }

export interface GymSession {
  id: string; venueId: string; locationId: string; roomId: string; instructorId: string;
  venueName: string; locationName: string; roomName: string;
  instructorName: string; instructorPhotoUrl: string;
  title: string; description: string; timezone: string; startsAt: Timestamp; endsAt: Timestamp;
  capacity: number; booked: number; regularPriceCents: number; currency: 'EUR';
  cancellationHours: number; status: 'draft' | 'published' | 'cancelled'; seriesId: string; revision?: number;
}

export interface GymQuote {
  sessionId: string; regularPriceCents: number; discountCents: number; finalPriceCents: number;
  gymPercent: number; instructorPercent: number; currency: 'EUR';
  availablePlaces: number; capacity: number; cancellationHours: number;
  revision: number; title: string; roomName: string; instructorName: string;
  timezone: string; startsAtMillis: number; endsAtMillis: number;
}

export interface GymBooking extends Omit<GymQuote, 'availablePlaces' | 'capacity' | 'revision' |
  'startsAtMillis' | 'endsAtMillis' | 'timezone' | 'title' | 'roomName' | 'instructorName'> {
  id: string; userId: string; customerName: string; venueId: string; title: string;
  venueName: string; locationName: string; roomName: string; instructorName: string;
  startsAt: Timestamp; endsAt: Timestamp; timezone: string;
  state: 'confirmed' | 'cancelled'; paymentMode: 'direct'; paymentStatus: 'pending' | 'paid';
  refundDueCents?: number; createdAt: Timestamp;
}

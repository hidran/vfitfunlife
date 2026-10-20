import type { Timestamp } from 'firebase/firestore';

import type { VenueInstructorLink, VenueLocation, VenueRoom } from './venueSpaces';

// Shared with the course screens (./venueSpaces); aliases keep the gym flow compiling until it is removed.
export type GymLocation = VenueLocation;
export type GymRoom = VenueRoom;
export type GymInstructorLink = VenueInstructorLink;

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

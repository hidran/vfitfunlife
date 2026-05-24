import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as limitQuery,
} from 'firebase/firestore';
import { db } from './config';
import type {
  Venue,
  VenueListOptions,
  VenueService,
  VenueCourse,
} from '@/types/venue';

export async function fetchVenue(id: string): Promise<Venue | null> {
  try {
    const snap = await getDoc(doc(db, 'venues', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Venue, 'id'>) };
  } catch (error) {
    console.error('[fetchVenue]', id, error);
    return null;
  }
}

export async function fetchVenues(opts: VenueListOptions = {}): Promise<Venue[]> {
  try {
    const constraints = [];
    if (opts.type) constraints.push(where('type', '==', opts.type));
    if (opts.city) constraints.push(where('city', '==', opts.city));
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q = constraints.length
      ? query(collection(db, 'venues'), ...constraints)
      : collection(db, 'venues');
    const snap = await getDocs(q as never);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Venue, 'id'>) }));
  } catch (error) {
    console.error('[fetchVenues]', opts, error);
    return [];
  }
}

export async function fetchVenueServices(venueId: string): Promise<VenueService[]> {
  try {
    const snap = await getDocs(collection(db, 'venues', venueId, 'services'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VenueService, 'id'>) }));
  } catch (error) {
    console.error('[fetchVenueServices]', venueId, error);
    return [];
  }
}

export async function fetchVenueCourses(venueId: string): Promise<VenueCourse[]> {
  try {
    const snap = await getDocs(collection(db, 'venues', venueId, 'courses'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VenueCourse, 'id'>) }));
  } catch (error) {
    console.error('[fetchVenueCourses]', venueId, error);
    return [];
  }
}

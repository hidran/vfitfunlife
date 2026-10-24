import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db } from './config';
import { getFunctionsInstance } from './app';
import type { VenueInstructorLink, VenueLocation, VenueRoom } from '@/types/venueSpaces';

/** Callable helper for the venue callables (saveGymSpace, configureGymInstructor). */
export async function venueCall<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const result = await httpsCallable<Record<string, unknown>, T>(await getFunctionsInstance(), name)(data);
  return result.data;
}

export async function fetchVenueLocations(venueId: string): Promise<VenueLocation[]> {
  const snap = await getDocs(collection(db, 'venues', venueId, 'locations'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as VenueLocation);
}

export async function fetchVenueRooms(venueId: string, locationId: string): Promise<VenueRoom[]> {
  const snap = await getDocs(collection(db, 'venues', venueId, 'locations', locationId, 'rooms'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as VenueRoom);
}

const PARTNER_STATUSES = ['pending', 'active', 'suspended'] as const;

/**
 * The venue's instructor links, each with the instructor's `partnerStatus` read from instructors/{id} (the link doc
 * only holds isActive/name/photoUrl). A missing or unreadable instructor doc leaves the status undefined.
 */
export async function fetchVenueInstructorLinks(venueId: string): Promise<VenueInstructorLink[]> {
  const snap = await getDocs(collection(db, 'venues', venueId, 'instructors'));
  return Promise.all(snap.docs.map(async d => {
    const link = { id: d.id, ...d.data() } as VenueInstructorLink;
    try {
      const status = (await getDoc(doc(db, 'instructors', d.id))).data()?.partnerStatus;
      if ((PARTNER_STATUSES as readonly string[]).includes(status)) link.partnerStatus = status;
    } catch {
      // The status is informative; the link itself is still listed.
    }
    return link;
  }));
}

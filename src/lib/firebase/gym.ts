import { collection, doc, getDoc, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db } from './config';
import { getFunctionsInstance } from './app';
import type { GymBooking, GymInstructorLink, GymLocation, GymRoom, GymSession } from '@/types/gym';

export async function gymCall<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const result = await httpsCallable<Record<string, unknown>, T>(await getFunctionsInstance(), name)(data);
  return result.data;
}

export async function fetchGymLocations(venueId: string): Promise<GymLocation[]> {
  const snap = await getDocs(collection(db, 'venues', venueId, 'locations'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as GymLocation);
}

export async function fetchGymRooms(venueId: string, locationId: string): Promise<GymRoom[]> {
  const snap = await getDocs(collection(db, 'venues', venueId, 'locations', locationId, 'rooms'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as GymRoom);
}

export async function fetchGymInstructors(venueId: string): Promise<GymInstructorLink[]> {
  const snap = await getDocs(collection(db, 'venues', venueId, 'instructors'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as GymInstructorLink);
}

export async function fetchGymSessions(venueId: string, weekStart: string, staff = false): Promise<GymSession[]> {
  const start = new Date(`${weekStart}T00:00:00Z`);
  // UTC padding includes every local day even for timezones at the ends of the IANA range.
  const lower = Timestamp.fromMillis(start.getTime() - 86400000);
  const upper = Timestamp.fromMillis(start.getTime() + 8 * 86400000);
  const constraints = staff ? [where('venueId', '==', venueId), where('startsAt', '>=', lower),
    where('startsAt', '<', upper)] : [where('venueId', '==', venueId), where('status', '==', 'published'),
    where('startsAt', '>=', lower), where('startsAt', '<', upper)];
  const snap = await getDocs(query(collection(db, 'gymSessions'), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as GymSession);
}

export async function fetchGymSession(id: string): Promise<GymSession | null> {
  const snap = await getDoc(doc(db, 'gymSessions', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as GymSession : null;
}

export async function fetchGymBookings(uid: string, staffVenueId?: string): Promise<GymBooking[]> {
  const snap = await getDocs(query(collection(db, 'gymBookings'),
    where(staffVenueId ? 'venueId' : 'userId', '==', staffVenueId ?? uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as GymBooking)
    .sort((a, b) => b.startsAt.toMillis() - a.startsAt.toMillis());
}

import { collection, doc, getDoc, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { db } from './config';
import type { GymBooking, GymSession } from '@/types/gym';

// Moved to ./venueSpaces (shared with the course screens); re-exported so the gym flow compiles until it is removed.
export {
  venueCall as gymCall, fetchVenueLocations as fetchGymLocations, fetchVenueRooms as fetchGymRooms,
  fetchVenueInstructorLinks as fetchGymInstructors,
} from './venueSpaces';

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

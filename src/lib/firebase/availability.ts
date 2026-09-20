import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import {
  overrideFromDoc,
  scheduleFromDoc,
  type AvailabilityUpdate,
  type BookingRules,
  type OverrideDoc,
  type StoredAvailability,
  type WeeklyWindow,
} from '@/lib/availability/adapter';
import { addDaysToKey, romeDateKey } from '@/lib/availability/dates';

/**
 * Provider availability: reads the provider's own instructor doc and date exceptions, writes
 * through updateMyAvailability, and asks getProviderSlots what a client can book. Reads throw
 * (a silent empty result would present a provider's real hours as "none set").
 */

/** The weekly hours alone — null when the provider has no instructor profile. */
export async function fetchMyWeeklySchedule(uid: string): Promise<WeeklyWindow[] | null> {
  const snap = await getDoc(doc(db, 'instructors', uid));
  if (!snap.exists()) return null;
  return scheduleFromDoc(snap.data()) ?? [];
}

export interface AvailabilityStatus {
  schedule: WeeklyWindow[] | null;
  /** Whether the provider has ever saved on /provider/availability (availabilityUpdatedAt). */
  reviewed: boolean;
}

/** What the dashboard banner needs — null when the provider has no instructor profile. */
export async function fetchMyAvailabilityStatus(uid: string): Promise<AvailabilityStatus | null> {
  const snap = await getDoc(doc(db, 'instructors', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { schedule: scheduleFromDoc(data) ?? [], reviewed: Boolean(data?.availabilityUpdatedAt) };
}

/** Everything the availability page edits: weekly hours, rules, and the next 12 months of exceptions. */
export async function fetchMyAvailability(uid: string): Promise<StoredAvailability> {
  const today = romeDateKey(new Date());
  const [instructor, overrides] = await Promise.all([
    getDoc(doc(db, 'instructors', uid)),
    getDocs(
      query(
        collection(db, 'instructors', uid, 'availability'),
        where(documentId(), '>=', today),
        where(documentId(), '<=', addDaysToKey(today, 365)),
      ),
    ),
  ]);
  const data = instructor.data();
  return {
    schedule: scheduleFromDoc(data),
    bookingRules: (data?.bookingRules as Partial<BookingRules> | undefined) ?? null,
    overrides: overrides.docs
      .map((d) => overrideFromDoc(d.id, d.data()))
      .filter((o): o is OverrideDoc => o !== null),
  };
}

export async function saveMyAvailability(update: AvailabilityUpdate): Promise<void> {
  const fn = httpsCallable<AvailabilityUpdate, unknown>(functions, 'updateMyAvailability');
  await fn(update);
}

export interface ProviderSlot {
  time: string; // "HH:mm", Europe/Rome
  startsAt: string; // ISO instant — what createBooking's scheduledAt must be
}

export async function fetchProviderSlots(input: {
  instructorId: string;
  serviceId: string;
  date: string;
  /**
   * The booking being rescheduled. The server lets it stop blocking its own slot, so the time
   * the client is currently holding still shows up as free on the reschedule picker.
   */
  excludeBookingId?: string;
}): Promise<ProviderSlot[]> {
  const fn = httpsCallable<typeof input, { slots: ProviderSlot[] }>(functions, 'getProviderSlots');
  return (await fn(input)).data.slots;
}

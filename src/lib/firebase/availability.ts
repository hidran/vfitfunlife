import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

export interface ProviderSlot {
  time: string; // "HH:mm", Europe/Rome
  startsAt: string; // ISO instant — what createBooking's scheduledAt must be
}

export async function fetchProviderSlots(input: {
  instructorId: string;
  serviceId: string;
  date: string;
}): Promise<ProviderSlot[]> {
  const fn = httpsCallable<typeof input, { slots: ProviderSlot[] }>(functions, 'getProviderSlots');
  return (await fn(input)).data.slots;
}

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  limit as limitQuery,
  type Query,
  type CollectionReference,
} from 'firebase/firestore';
import { db } from './config';
import type {
  Provider,
  InstructorService,
  ProviderListOptions,
  ActivityKind,
} from '@/types/instructor';
import type { ProviderApplicationStatus } from '@/types/firebase';

/**
 * Normalizes the various shapes /instructors documents take in this app's data —
 * some fields live at the root, some inside providerProfile, with home/page.tsx's
 * reader (line 184) as the canonical fallback ordering. The defaults match that
 * reader so legacy documents (no `isActive` field) continue to appear in lists.
 */
function flattenProvider(id: string, data: Record<string, unknown>): Provider {
  const profile = (data.providerProfile ?? {}) as Record<string, unknown>;
  return {
    id,
    fullName: (data.fullName as string) ?? (data.name as string) ?? 'Provider',
    avatarUrl: (data.avatarUrl as string | null) ?? null,
    rating: (data.ratingAvg as number) ?? (profile.rating as number) ?? 0,
    reviewCount: (data.reviewCount as number) ?? (profile.reviewCount as number) ?? 0,
    isVerified: (profile.isVerified as boolean) ?? false,
    applicationStatus: data.applicationStatus as ProviderApplicationStatus | undefined,
    isActive: (data.isActive as boolean) ?? (profile.isActive as boolean) ?? true, // matches home/page.tsx legacy reader
    specialties: (data.specialties as string[]) ?? (profile.specialties as string[]) ?? [],
    yearsOfExperience:
      (data.experienceYears as number) ?? (profile.yearsOfExperience as number) ?? 0,
    languages: (data.languages as string[]) ?? (profile.languages as string[]) ?? [],
    bioKey: (data.bioKey as string) ?? undefined,
    city: (data.city as string) ?? undefined,
    lat: typeof data.lat === 'number' ? (data.lat as number) : undefined,
    lng: typeof data.lng === 'number' ? (data.lng as number) : undefined,
    photoUrls: (data.photoUrls as string[]) ?? undefined,
    activityKind: (data.activityKind as ActivityKind) ?? undefined,
    eventDate: (data.eventDate as string) ?? undefined,
    eventTime: (data.eventTime as string) ?? undefined,
    location: (data.location as string) ?? (data.city as string) ?? undefined,
    attendees: typeof data.attendees === 'number' ? (data.attendees as number) : undefined,
    tag: (data.tag as 'hot' | 'vip' | 'new') ?? undefined,
    durationMinutes: typeof data.durationMinutes === 'number' ? (data.durationMinutes as number) : undefined,
    partyType: (data.partyType as string) ?? undefined,
    lowestPrice: typeof data.lowestPrice === 'number' ? (data.lowestPrice as number) : undefined,
    categoryIds: (data.categoryIds as string[]) ?? undefined,
  };
}

export async function fetchProvider(id: string): Promise<Provider | null> {
  try {
    const snap = await getDoc(doc(db, 'instructors', id));
    if (!snap.exists()) return null;
    return flattenProvider(snap.id, snap.data() as Record<string, unknown>);
  } catch (error) {
    console.error('[fetchProvider]', id, error);
    return null;
  }
}

export async function fetchProviders(opts: ProviderListOptions = {}): Promise<Provider[]> {
  try {
    const constraints = [];
    if (opts.onlyVerified) {
      constraints.push(where('providerProfile.isVerified', '==', true));
    }
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q: Query | CollectionReference = constraints.length
      ? query(collection(db, 'instructors'), ...constraints)
      : collection(db, 'instructors');
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => flattenProvider(d.id, d.data() as Record<string, unknown>))
      .filter((p) => !p.activityKind && p.isActive && (!opts.onlyVerified || p.isVerified))
      // Category ids, not display names: `categoryIds` carries the leaf and its
      // ancestors, so a group filter matches its whole subtree. `specialty` remains as a
      // fallback for the window before the backfill has run everywhere.
      .filter((p) => {
        if (opts.categoryId) return (p.categoryIds ?? []).includes(opts.categoryId);
        if (opts.specialty) return p.specialties.includes(opts.specialty);
        return true;
      });
  } catch (error) {
    console.error('[fetchProviders]', opts, error);
    return [];
  }
}

export async function fetchFunActivities(kind: ActivityKind): Promise<Provider[]> {
  try {
    // The isVerified constraint is required so the query satisfies the /instructors
    // read rule (which only permits reading verified docs publicly); activities are
    // all seeded verified. Two equality filters need no composite index.
    const q = query(
      collection(db, 'instructors'),
      where('providerProfile.isVerified', '==', true),
      where('activityKind', '==', kind)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => flattenProvider(d.id, d.data() as Record<string, unknown>))
      .filter((p) => p.isActive);
  } catch (error) {
    console.error('[fetchFunActivities]', kind, error);
    return [];
  }
}

export async function fetchProviderServices(providerId: string): Promise<InstructorService[]> {
  try {
    const snap = await getDocs(collection(db, 'instructors', providerId, 'services'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InstructorService, 'id'>) }));
  } catch (error) {
    console.error('[fetchProviderServices]', providerId, error);
    return [];
  }
}

export type ProviderServiceInput = Omit<InstructorService, 'id'>;

/**
 * Firestore rejects `undefined` field values outright, and `description` is optional —
 * an empty edit form would otherwise fail the whole write.
 */
function stripUndefined<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * Service CRUD writes `instructors/{providerId}/services`, the collection the client
 * booking flow reads. The document carries no providerId — the path is the relationship.
 *
 * Unlike the fetchers above, these deliberately let errors propagate: a silent failure
 * here is what made the old page look like it was saving when it was not.
 *
 * `lowestPrice` on the instructor document is maintained by the onProviderServiceWrite
 * trigger, not from here — see functions/src/providers/onServiceWrite.ts.
 */
export async function createProviderService(
  providerId: string,
  data: ProviderServiceInput
): Promise<string> {
  const ref = await addDoc(
    collection(db, 'instructors', providerId, 'services'),
    stripUndefined({ ...data })
  );
  return ref.id;
}

export async function updateProviderService(
  providerId: string,
  serviceId: string,
  data: Partial<ProviderServiceInput>
): Promise<void> {
  await updateDoc(
    doc(db, 'instructors', providerId, 'services', serviceId),
    stripUndefined({ ...data })
  );
}

export async function deleteProviderService(
  providerId: string,
  serviceId: string
): Promise<void> {
  await deleteDoc(doc(db, 'instructors', providerId, 'services', serviceId));
}

export async function fetchProviderApplications(): Promise<Provider[]> {
  try {
    const q = query(collection(db, 'instructors'), where('applicationStatus', '==', 'pending'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => flattenProvider(d.id, d.data() as Record<string, unknown>));
  } catch (error) {
    console.error('[fetchProviderApplications]', error);
    return [];
  }
}

export async function updateProviderPhotos(providerId: string, photoUrls: string[]): Promise<void> {
  await updateDoc(doc(db, 'instructors', providerId), { photoUrls });
}

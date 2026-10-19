'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getPortfolioImages } from '@/lib/firebase/storage';
import type { ProviderProfile } from '@/types/firebase';
import { queryKeys } from '@/lib/queryKeys';
import { readBusinessDetails, toPublicBusiness, type PublicBusiness } from '@/lib/publicBusiness';

export interface ProviderPublicProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  providerProfile: ProviderProfile | null;
  socialLinks: {
    instagram?: string;
    linkedin?: string;
    website?: string;
    facebook?: string;
    twitter?: string;
  } | null;
  isProvider: true;
  portfolioImages: string[];
  /** Present iff the doc has a valid `business` map: company badge, logo, description, website. */
  business?: PublicBusiness;
}

/** Thrown by the query fn so the caller can tell "not a provider" apart from a real failure. */
export class ProviderNotFoundError extends Error {
  constructor() {
    super('Provider not found');
    this.name = 'ProviderNotFoundError';
  }
}

type Data = Record<string, unknown>;
type PublicService = ProviderProfile['servicePricing'][number];
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const arr = <T>(v: unknown): T[] | undefined => (Array.isArray(v) ? (v as T[]) : undefined);

/**
 * Builds the public profile from `instructors/{id}` — the provider catalog, publicly
 * readable for verified providers (firestore.rules). `users/{id}` is owner/admin-only, so
 * reading it here made the page fail for every visitor. Root fields win over the nested
 * `providerProfile` ones, same precedence as flattenProvider in lib/firebase/providers.ts.
 */
export function toProviderPublicProfile(
  id: string,
  data: Data,
  portfolioImages: string[],
): ProviderPublicProfile {
  const p = (data.providerProfile ?? {}) as Data;
  const bio = str(data.bio) ?? str(p.professionalBio) ?? str(p.bio) ?? null;
  const providerProfile: ProviderProfile = {
    professionalBio: str(p.professionalBio) ?? str(p.bio) ?? str(data.bio) ?? '',
    specialties: arr<string>(data.specialties) ?? arr<string>(p.specialties) ?? [],
    certifications: arr(p.certifications) ?? arr(data.certifications) ?? [],
    yearsOfExperience: num(data.experienceYears) ?? num(p.yearsOfExperience) ?? 0,
    languages: arr<string>(data.languages) ?? arr<string>(p.languages) ?? [],
    education: arr(p.education) ?? arr(data.education) ?? [],
    licenseNumber: str(p.licenseNumber) ?? null,
    cancellationPolicy: str(p.cancellationPolicy) ?? null,
    isVerified: p.isVerified === true,
    isActive: (data.isActive as boolean | undefined) ?? (p.isActive as boolean | undefined) ?? true,
    rating: num(data.ratingAvg) ?? num(p.rating) ?? 0,
    reviewCount: num(data.reviewCount) ?? num(p.reviewCount) ?? 0,
    portfolioImages,
    servicePricing: arr<PublicService>(p.servicePricing) ?? [],
    availabilitySchedule: null,
  };
  const business = toPublicBusiness(readBusinessDetails(data.business));
  return {
    id,
    fullName: str(data.fullName) ?? str(data.name) ?? 'Provider',
    avatarUrl: str(data.avatarUrl) ?? null,
    bio,
    providerProfile,
    socialLinks: (data.socialLinks as ProviderPublicProfile['socialLinks']) ?? null,
    isProvider: true,
    portfolioImages,
    ...(business ? { business } : {}),
  };
}

async function fetchProviderPublicProfile(providerId: string): Promise<ProviderPublicProfile> {
  const [snap, portfolioImages] = await Promise.all([
    getDoc(doc(db, 'instructors', providerId)).catch((error: unknown) => {
      // Unverified/unknown providers are unreadable by the rules: same as "not found".
      if ((error as { code?: string })?.code === 'permission-denied') return null;
      throw error;
    }),
    getPortfolioImages(providerId),
  ]);
  if (!snap || !snap.exists()) throw new ProviderNotFoundError();
  const data = snap.data() as Data;
  // Venue-hosted activities (events, parties…) share the collection but are not people.
  if (data.activityKind) throw new ProviderNotFoundError();

  const services = await getDocs(collection(db, 'instructors', providerId, 'services'));
  const subcollectionServices: PublicService[] = services.docs.map((service) => {
    const serviceData = service.data() as Data;
    return {
      id: service.id,
      ...(serviceData.kind === "group" ? { kind: "group" as const, courseId: str(serviceData.courseId) } : {}),
      serviceName: str(serviceData.name) ?? str(serviceData.serviceName) ?? '',
      description: str(serviceData.description) ?? '',
      price: num(serviceData.price) ?? 0,
      durationMinutes: num(serviceData.durationMinutes) ?? 0,
      isActive: serviceData.isActive !== false,
    };
  });
  const profileData = {
    ...data,
    providerProfile: {
      ...((data.providerProfile ?? {}) as Data),
      // The services subcollection is the booking flow's source of truth. Keep inline pricing
      // only as a fallback for older provider profiles that have not migrated their services.
      servicePricing: subcollectionServices.length
        ? subcollectionServices
        : ((data.providerProfile as Data | undefined)?.servicePricing ?? []),
    },
  };
  return toProviderPublicProfile(snap.id, profileData, portfolioImages);
}

export function useProviderPublicProfile(providerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.providerPublicProfile(providerId ?? ''),
    queryFn: () => fetchProviderPublicProfile(providerId as string),
    enabled: !!providerId,
    retry: (count, error) => !(error instanceof ProviderNotFoundError) && count < 2,
  });
}

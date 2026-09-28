'use client';

import { useQuery } from '@tanstack/react-query';
import { getProviderProfile, getUserData, isProvider } from '@/lib/firebase/auth';
import { getPortfolioImages } from '@/lib/firebase/storage';
import type { ProviderProfile } from '@/types/firebase';
import { queryKeys } from '@/lib/queryKeys';

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
}

/** Thrown by the query fn so the caller can tell "not a provider" apart from a real failure. */
export class ProviderNotFoundError extends Error {
  constructor() {
    super('Provider not found');
    this.name = 'ProviderNotFoundError';
  }
}

async function fetchProviderPublicProfile(providerId: string): Promise<ProviderPublicProfile> {
  // These 4 reads are independent of each other (no waterfall needed).
  const [isProv, userData, providerProfile, portfolioImages] = await Promise.all([
    isProvider(providerId),
    getUserData(providerId),
    getProviderProfile(providerId),
    getPortfolioImages(providerId),
  ]);

  if (!isProv || !userData) {
    throw new ProviderNotFoundError();
  }

  return {
    id: providerId,
    fullName: userData.fullName || 'Unknown Provider',
    avatarUrl: userData.avatarUrl || null,
    bio: userData.bio || null,
    providerProfile,
    socialLinks: userData.socialLinks || null,
    isProvider: true,
    portfolioImages,
  };
}

export function useProviderPublicProfile(providerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.providerPublicProfile(providerId ?? ''),
    queryFn: () => fetchProviderPublicProfile(providerId as string),
    enabled: !!providerId,
  });
}

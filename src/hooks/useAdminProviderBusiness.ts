'use client';

import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { queryKeys } from '@/lib/queryKeys';
import { readAdminBusiness, type AdminBusiness } from '@/lib/admin/providerBusiness';

/**
 * The company details of a provider for the admin screens: `instructors/{id}.business`, or null
 * for an individual (no map) or a provider with no catalogue entry yet. Admins can read every
 * instructors doc (firestore.rules), pending ones included.
 *
 * Whatever this returns is what the approval sends as `expectedReview` — so a company's Approve
 * waits for it, and a `stale_review` refusal invalidates `queryKeys.adminProvider(id)` (a prefix
 * of this key) to show the new details.
 */
export function useAdminProviderBusiness(providerId: string, enabled = true) {
  return useQuery<AdminBusiness | null>({
    queryKey: queryKeys.adminProviderBusiness(providerId),
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'instructors', providerId));
      return snap.exists() ? readAdminBusiness(snap.data()?.business) : null;
    },
    enabled: enabled && Boolean(providerId),
  });
}

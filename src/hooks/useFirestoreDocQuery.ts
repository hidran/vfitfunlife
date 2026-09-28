'use client';

import { useQuery, type QueryKey } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

/**
 * Fetches a single Firestore document via TanStack Query.
 *
 * Extracted from the ~identical `useEffect` + `useState` fetch that every admin
 * `*DetailView.tsx` used to hand-roll (get-doc-by-id, `cancelled` flag, `loading` state).
 * Callers keep full control over the returned shape via `map`, so entity-specific quirks
 * (e.g. `ProviderDetailView` also stamping `uid: snap.id`) stay at the call site.
 */
export function useFirestoreDocQuery<T>(
  queryKey: QueryKey,
  collectionPath: string,
  docId: string,
  map: (id: string, data: Record<string, unknown>) => T,
) {
  return useQuery({
    queryKey,
    queryFn: async (): Promise<T | null> => {
      const snap = await getDoc(doc(db, collectionPath, docId));
      return snap.exists() ? map(snap.id, snap.data()) : null;
    },
  });
}

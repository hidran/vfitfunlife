import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './config';
import type { ServiceCategory } from '@/lib/serviceCategories';

/**
 * Fetch the admin-managed catalog of active service categories, sorted by
 * `order`. Sorting is done client-side so no composite (isActive + order)
 * Firestore index is required.
 */
export async function fetchActiveServiceCategories(): Promise<ServiceCategory[]> {
  const snap = await getDocs(
    query(collection(db, 'serviceCategories'), where('isActive', '==', true))
  );
  return snap.docs
    .map((d) => {
      const data = d.data() as { name?: string; icon?: string; order?: number };
      return {
        id: d.id,
        name: data.name ?? d.id,
        icon: data.icon ?? '',
        order: typeof data.order === 'number' ? data.order : 0,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ id, name, icon }) => ({ id, name, icon }));
}

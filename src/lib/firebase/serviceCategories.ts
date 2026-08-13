import { collection, getDocs } from 'firebase/firestore';
import { db } from './config';
import { SERVICE_CATEGORY_TREE } from '@/lib/serviceCategories';
import { localizedName, type ServiceCategory, type ServiceCategoryDoc } from '@/types/serviceCategory';
import type { AppLocale } from '@/types/locale';
import type { Section } from '@/contexts/SectionContext';

function toResolved(
  id: string,
  data: Partial<ServiceCategoryDoc> & { name?: string },
  locale: AppLocale
): ServiceCategory {
  return {
    id,
    parentId: data.parentId ?? null,
    // `data.name` is the pre-taxonomy flat string. Reading it keeps the catalogue
    // rendering during the window between deploying this and seeding the tree.
    name: data.names ? localizedName(id, data.names, locale) : (data.name ?? id),
    icon: data.icon ?? '',
    sections: (data.sections as Section[]) ?? ['fit'],
    order: typeof data.order === 'number' ? data.order : 0,
    isActive: data.isActive !== false,
  };
}

/** The bundled tree, resolved — used whenever Firestore has nothing usable. */
export function fallbackCategories(locale: AppLocale): ServiceCategory[] {
  return Object.entries(SERVICE_CATEGORY_TREE)
    .map(([id, doc]) => toResolved(id, doc, locale))
    .sort((a, b) => a.order - b.order);
}

/**
 * The full catalogue, active entries only, sorted by `order`.
 *
 * Sorting client-side avoids a composite (isActive + order) index, and the whole catalogue
 * is small enough to read in one go — it is cached by TanStack Query for five minutes.
 */
export async function fetchActiveServiceCategories(
  locale: AppLocale
): Promise<ServiceCategory[]> {
  const snap = await getDocs(collection(db, 'serviceCategories'));
  return snap.docs
    .map((d) => toResolved(d.id, d.data() as Partial<ServiceCategoryDoc>, locale))
    .filter((c) => c.isActive)
    .sort((a, b) => a.order - b.order);
}

/** Every category including inactive ones — for the admin catalogue screen. */
export async function fetchAllServiceCategories(
  locale: AppLocale
): Promise<ServiceCategory[]> {
  const snap = await getDocs(collection(db, 'serviceCategories'));
  return snap.docs
    .map((d) => toResolved(d.id, d.data() as Partial<ServiceCategoryDoc>, locale))
    .sort((a, b) => a.order - b.order);
}

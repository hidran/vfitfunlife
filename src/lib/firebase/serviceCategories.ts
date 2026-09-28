import { collection, getDocs } from 'firebase/firestore';
import { db } from './config';
import { SERVICE_CATEGORY_TREE } from '@/lib/serviceCategories';
import { localizedName, type ServiceCategory, type ServiceCategoryDoc } from '@/types/serviceCategory';
import type { AppLocale } from '@/types/locale';
import type { Section } from '@/contexts/SectionContext';

/**
 * A category's label in `locale`. `names` is the source of truth; `name` is the
 * pre-taxonomy flat string, which only the six documents older than the tree still carry.
 */
export function resolveCategoryName(
  id: string,
  data: { names?: Partial<Record<AppLocale, string>>; name?: string },
  locale: AppLocale
): string {
  return data.names ? localizedName(id, data.names, locale) : (data.name ?? id);
}

function toResolved(
  id: string,
  data: Partial<ServiceCategoryDoc> & { name?: string },
  locale: AppLocale
): ServiceCategory {
  return {
    id,
    parentId: data.parentId ?? null,
    name: resolveCategoryName(id, data, locale),
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
 * The whole catalogue (active and inactive), sorted by `order`.
 *
 * Sorting client-side avoids a composite (isActive + order) index, and the whole catalogue
 * is small enough to read in one go. This is the *only* place that reads the
 * `serviceCategories` collection — `useServiceCategories` (src/hooks/useServiceCategories.ts)
 * caches the result behind a single long-staleTime `useQuery` and derives the "active only"
 * view from it in memory, rather than issuing a second, near-identical Firestore read.
 */
export async function fetchAllServiceCategories(
  locale: AppLocale
): Promise<ServiceCategory[]> {
  const snap = await getDocs(collection(db, 'serviceCategories'));
  return snap.docs
    .map((d) => toResolved(d.id, d.data() as Partial<ServiceCategoryDoc>, locale))
    .sort((a, b) => a.order - b.order);
}

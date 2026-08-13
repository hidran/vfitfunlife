import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  fallbackCategories,
  fetchActiveServiceCategories,
  fetchAllServiceCategories,
} from '@/lib/firebase/serviceCategories';
import { useI18n } from '@/hooks/useI18n';
import type { ServiceCategory, ServiceCategoryGroup } from '@/types/serviceCategory';

/**
 * Active service categories from the admin-managed catalog, labels resolved for the
 * current locale. Falls back to the bundled tree while loading, on error, or when the
 * catalog is empty, so consumers always have something to render.
 */
export function useServiceCategories(): ServiceCategory[] {
  const { locale } = useI18n();
  const { data } = useQuery({
    queryKey: ['serviceCategories', 'active', locale],
    queryFn: () => fetchActiveServiceCategories(locale),
    staleTime: 5 * 60 * 1000,
  });
  return data && data.length > 0 ? data : fallbackCategories(locale);
}

/** Only the leaves — the categories a service may actually be tagged with. */
export function useServiceCategoryLeaves(): ServiceCategory[] {
  const all = useServiceCategories();
  return useMemo(() => all.filter((c) => c.parentId !== null), [all]);
}

/**
 * Leaves grouped under their parent, for pickers and browse UI.
 *
 * A group with no active leaves is dropped: offering a heading that expands to nothing is
 * worse than not showing it. Orphans (a leaf whose parent is inactive or missing) are
 * likewise dropped rather than floated to the top level, so deactivating a group really
 * does hide its subtree.
 */
export function useServiceCategoryGroups(): ServiceCategoryGroup[] {
  const all = useServiceCategories();
  return useMemo(() => {
    const groups = all.filter((c) => c.parentId === null);
    return groups
      .map((group) => ({
        group,
        leaves: all.filter((c) => c.parentId === group.id),
      }))
      .filter((g) => g.leaves.length > 0);
  }, [all]);
}

/** Lookup by id, for rendering a stored categoryId as a label. */
export function useServiceCategoryMap(): Map<string, ServiceCategory> {
  const all = useServiceCategories();
  return useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
}

/**
 * The whole catalogue including inactive entries, for the admin screens.
 *
 * The client-facing hooks above filter to active on purpose; an admin needs to see and
 * re-activate what they have hidden, and needs inactive groups to remain selectable as a
 * parent.
 */
export function useAllServiceCategories() {
  const { locale } = useI18n();
  return useQuery({
    queryKey: ['serviceCategories', 'all', locale],
    queryFn: () => fetchAllServiceCategories(locale),
    staleTime: 60 * 1000,
  });
}

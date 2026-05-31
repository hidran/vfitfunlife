import { useQuery } from '@tanstack/react-query';
import { fetchActiveServiceCategories } from '@/lib/firebase/serviceCategories';
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/serviceCategories';

/**
 * Active service categories from the admin-managed catalog. Falls back to the
 * bundled defaults while loading, on error, or when the catalog is empty, so
 * consumers always have something to render.
 */
export function useServiceCategories(): ServiceCategory[] {
  const { data } = useQuery({
    queryKey: ['serviceCategories', 'active'],
    queryFn: fetchActiveServiceCategories,
    staleTime: 5 * 60 * 1000,
  });
  return data && data.length > 0 ? data : SERVICE_CATEGORIES;
}

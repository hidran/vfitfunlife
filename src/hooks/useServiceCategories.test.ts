import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeQueryClientWrapper } from '@/test-utils/queryClientWrapper';

// tests/setup.ts globally mocks this module (a fixture other suites rely on) — this file
// tests the real implementation, so it needs to opt back out of that mock.
vi.unmock('@/hooks/useServiceCategories');
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ locale: 'it' }) }));
vi.mock('@/lib/firebase/serviceCategories', () => ({
  fetchAllServiceCategories: vi.fn(),
  fallbackCategories: vi.fn(() => []),
}));

import { fetchAllServiceCategories } from '@/lib/firebase/serviceCategories';
import {
  useAllServiceCategories,
  useServiceCategories,
  useServiceCategoryGroups,
} from './useServiceCategories';
import type { ServiceCategory } from '@/types/serviceCategory';

const CATEGORIES: ServiceCategory[] = [
  { id: 'fitness', parentId: null, name: 'Fitness', icon: '', sections: ['fit'], order: 0, isActive: true },
  { id: 'yoga', parentId: 'fitness', name: 'Yoga', icon: '', sections: ['fit'], order: 0, isActive: true },
  { id: 'archived', parentId: 'fitness', name: 'Old', icon: '', sections: ['fit'], order: 1, isActive: false },
];

describe('useServiceCategories (P2-8 dedup)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAllServiceCategories).mockResolvedValue(CATEGORIES);
  });

  it('filters to active categories client-side instead of a second Firestore read', async () => {
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useServiceCategories(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((c) => c.id)).toEqual(['fitness', 'yoga']);
    expect(fetchAllServiceCategories).toHaveBeenCalledTimes(1);
  });

  it('shares the same cached fetch between the active view and the admin "all" view', async () => {
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(
      () => ({
        active: useServiceCategories(),
        groups: useServiceCategoryGroups(),
        all: useAllServiceCategories(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.all.data).toHaveLength(3));
    expect(result.current.active).toHaveLength(2);
    expect(result.current.groups).toHaveLength(1);
    // The whole point of P2-8: one Firestore read backs every consumer above.
    expect(fetchAllServiceCategories).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The provider layout mounts its children (and their effects) before auth restores on a hard
// reload or deep link, so fetchAvailability can run with no signed-in user yet.
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: undefined }) },
}));
vi.mock('@/lib/firebase/availability', () => ({
  fetchMyAvailability: vi.fn(),
  saveMyAvailability: vi.fn(),
}));

import { fetchMyAvailability } from '@/lib/firebase/availability';
import { useProviderStore } from './providerStore';

beforeEach(() => {
  vi.clearAllMocks();
  useProviderStore.setState({ availability: null, availabilityLoadError: null, loadedOverrides: [] });
});

describe('providerStore.fetchAvailability with no signed-in user yet', () => {
  it('reports an error instead of silently doing nothing (which left the page spinning forever)', async () => {
    await useProviderStore.getState().fetchAvailability();

    expect(fetchMyAvailability).not.toHaveBeenCalled();
    const s = useProviderStore.getState();
    expect(s.availability).toBeNull();
    expect(s.isLoading).toBe(false);
    expect(s.availabilityLoadError).toBeTruthy();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1', role: 'provider' } }) },
}));
vi.mock('@/lib/firebase/availability', () => ({
  fetchMyAvailability: vi.fn(),
  saveMyAvailability: vi.fn(),
}));

import { fetchMyAvailability, saveMyAvailability } from '@/lib/firebase/availability';
import { useProviderStore } from './providerStore';

const XMAS = { date: '2026-12-25', isAvailable: false, windows: [], reason: 'Natale' };
const MON_9_17 = [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true }];

beforeEach(() => {
  vi.clearAllMocks();
  useProviderStore.setState({ availability: null, loadedOverrides: [] });
});

describe('providerStore availability', () => {
  it('loads a provider with no saved hours as every day off — the page shows exactly what is saved', async () => {
    vi.mocked(fetchMyAvailability).mockResolvedValue({ schedule: null, bookingRules: null, overrides: [] });
    await useProviderStore.getState().fetchAvailability();

    const s = useProviderStore.getState();
    expect(fetchMyAvailability).toHaveBeenCalledWith('u1');
    expect(s.availability?.weeklySchedule.monday).toEqual({ isAvailable: false, slots: [] });
    expect(s.availability?.weeklySchedule.friday).toEqual({ isAvailable: false, slots: [] });
  });

  it('saves only what changed', async () => {
    vi.mocked(fetchMyAvailability).mockResolvedValue({ schedule: MON_9_17, bookingRules: null, overrides: [XMAS] });
    vi.mocked(saveMyAvailability).mockResolvedValue(undefined);
    await useProviderStore.getState().fetchAvailability();

    const settings = useProviderStore.getState().availability!;
    await useProviderStore.getState().updateAvailability(settings);

    const update = vi.mocked(saveMyAvailability).mock.calls[0][0];
    expect(update.schedule).toEqual(MON_9_17);
    expect(update.overrides).toEqual({ upsert: [], delete: [] }); // Christmas unchanged
    expect(useProviderStore.getState().availability).toEqual(settings);
  });

  it('rethrows a failed save', async () => {
    vi.mocked(fetchMyAvailability).mockResolvedValue({ schedule: null, bookingRules: null, overrides: [] });
    vi.mocked(saveMyAvailability).mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/invalid-argument' }));
    await useProviderStore.getState().fetchAvailability();

    await expect(useProviderStore.getState().updateAvailability(useProviderStore.getState().availability!))
      .rejects.toThrow('x');
  });

  it('reports a failed load instead of showing an empty week', async () => {
    vi.mocked(fetchMyAvailability).mockRejectedValue(new Error('permission-denied'));
    await useProviderStore.getState().fetchAvailability();

    expect(useProviderStore.getState().availability).toBeNull();
    expect(useProviderStore.getState().availabilityLoadError).toBe('permission-denied');
  });
});

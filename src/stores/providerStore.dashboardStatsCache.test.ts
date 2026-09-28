import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// providerStore pulls in the rest of these from '@/lib/firebase/provider' at module load;
// only getProviderDashboardStats matters here, the others just need to exist as no-ops.
vi.mock('@/lib/firebase/provider', () => ({
  getProviderDashboardStats: vi.fn(),
  getProviderBookings: vi.fn(),
  getProviderSchedule: vi.fn(),
  confirmBooking: vi.fn(),
  declineBooking: vi.fn(),
  completeBooking: vi.fn(),
  markBookingNoShow: vi.fn(),
  cancelBooking: vi.fn(),
  confirmBookingPayment: vi.fn(),
  getProviderEarnings: vi.fn(),
  getProviderClients: vi.fn(),
  getClientDetails: vi.fn(),
  addClientNote: vi.fn(),
  requestWithdrawal: vi.fn(),
  getProviderNotifications: vi.fn(),
  markNotificationAsRead: vi.fn(),
}));
vi.mock('@/lib/firebase/availability', () => ({
  fetchMyAvailability: vi.fn(),
  saveMyAvailability: vi.fn(),
}));

import { getProviderDashboardStats } from '@/lib/firebase/provider';
import { useProviderStore } from './providerStore';

const STATS = {
  todayAppointments: 1,
  weekBookings: 2,
  monthEarnings: 300,
  newClients: 1,
  completionRate: 100,
  averageRating: 5,
  chartData: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  useProviderStore.setState({ dashboardStats: null, dashboardStatsFetchedAt: null, error: null });
  vi.mocked(getProviderDashboardStats).mockResolvedValue(STATS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('providerStore.fetchDashboardStats caching', () => {
  it('fetches on the first call', async () => {
    await useProviderStore.getState().fetchDashboardStats();

    expect(getProviderDashboardStats).toHaveBeenCalledTimes(1);
    expect(useProviderStore.getState().dashboardStats).toEqual(STATS);
  });

  it('skips the network call on a second mount within 60s', async () => {
    await useProviderStore.getState().fetchDashboardStats();
    vi.advanceTimersByTime(59_000);
    await useProviderStore.getState().fetchDashboardStats();

    expect(getProviderDashboardStats).toHaveBeenCalledTimes(1);
  });

  it('refetches once the 60s window has passed', async () => {
    await useProviderStore.getState().fetchDashboardStats();
    vi.advanceTimersByTime(60_001);
    await useProviderStore.getState().fetchDashboardStats();

    expect(getProviderDashboardStats).toHaveBeenCalledTimes(2);
  });

  it('force=true bypasses the cache', async () => {
    await useProviderStore.getState().fetchDashboardStats();
    await useProviderStore.getState().fetchDashboardStats(true);

    expect(getProviderDashboardStats).toHaveBeenCalledTimes(2);
  });

  it('retries immediately after a failed fetch rather than getting stuck behind the cache window', async () => {
    vi.mocked(getProviderDashboardStats).mockRejectedValueOnce(new Error('offline'));
    await useProviderStore.getState().fetchDashboardStats();
    expect(useProviderStore.getState().dashboardStats).toBeNull();

    await useProviderStore.getState().fetchDashboardStats();

    expect(getProviderDashboardStats).toHaveBeenCalledTimes(2);
    expect(useProviderStore.getState().dashboardStats).toEqual(STATS);
  });
});

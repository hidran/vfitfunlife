import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserGamification, SEASON0_CLIENT_REWARDS } from './useUserGamification';
import { getUserStats, seedDefaultSeason0Progress } from '@/lib/firebase/functions';
import type { User } from '@/types/firebase';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function HookWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return HookWrapper;
}

// Mock the auth store at the module level. The factory captures mockUseAuthStore
// by closure; vitest calls the factory after module init so the const is initialized.
interface MockAuthState {
  user: User | null;
  firebaseUser: null;
  isLoading: boolean;
  logout: () => void;
  refreshUserProfile: () => Promise<void> | void;
}
const mockUseAuthStore = vi.fn((): MockAuthState => ({
  user: null,
  firebaseUser: null,
  isLoading: true,
  logout: vi.fn(),
  refreshUserProfile: vi.fn(),
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mockUseAuthStore() }));

// Mock the functions module. We don't assert on these calls in this file —
// the hook's rendering logic is the focus. The callable integration is covered
// by the Cloud Functions tests in functions/src/users/.
vi.mock('@/lib/firebase/functions', () => ({
  getUserStats: vi.fn().mockResolvedValue({
    completedBookings: 0,
    totalPointsEarned: 0,
    reviewsWritten: 0,
    activeChallenges: 0,
    referralCount: 0,
  }),
  seedDefaultSeason0Progress: vi.fn().mockResolvedValue({
    seeded: false,
    xp: 0,
    level: 1,
    xpToNextLevel: 400,
    dayStreak: 0,
  }),
}));

describe('useUserGamification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue({
      user: null,
      firebaseUser: null,
      isLoading: true,
      logout: vi.fn(),
      refreshUserProfile: vi.fn(),
    });
  });

  function userWith(fields: Record<string, unknown>) {
    return {
      id: 'user-1',
      uid: 'user-1',
      xp: 0,
      level: 1,
      xpToNextLevel: 400,
      dayStreak: 0,
      hasClaimedProfileComplete: false,
      hasClaimedInterests: false,
      hasClaimedZone: false,
      hasClaimedFamily: false,
      referralCount: 0,
      ...fields,
    } as User;
  }

  it('returns defaults while auth is loading', () => {
    const { result } = renderHook(() => useUserGamification(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.xp).toBe(0);
    expect(result.current.level).toBe(1);
    expect(result.current.xpToNextLevel).toBe(400);
    expect(result.current.progress).toBe(0);
    expect(result.current.dayStreak).toBe(0);
    expect(result.current.hasClaimedProfileComplete).toBe(false);
  });

  it('returns defaults when user is null after auth loads', () => {
    mockUseAuthStore.mockReturnValue({
      user: null,
      firebaseUser: null,
      isLoading: false,
      logout: vi.fn(),
      refreshUserProfile: vi.fn(),
    });

    const { result } = renderHook(() => useUserGamification(), { wrapper: makeWrapper() });

    expect(result.current.xp).toBe(0);
    expect(result.current.level).toBe(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.dayStreak).toBe(0);
  });

  it('derives level and xpToNextLevel from user doc fields', () => {
    mockUseAuthStore.mockReturnValue({
      user: userWith({
        xp: 500,
        level: 2,
        xpToNextLevel: 400,
        dayStreak: 7,
        hasClaimedProfileComplete: true,
        hasClaimedInterests: false,
        hasClaimedZone: false,
        hasClaimedFamily: false,
        referralCount: 3,
      }),
      firebaseUser: null,
      isLoading: false,
      logout: vi.fn(),
      refreshUserProfile: vi.fn(),
    });

    const { result } = renderHook(() => useUserGamification(), { wrapper: makeWrapper() });

    expect(result.current.xp).toBe(500);
    expect(result.current.level).toBe(2);
    expect(result.current.xpToNextLevel).toBe(400);
    expect(result.current.dayStreak).toBe(7);
    expect(result.current.hasClaimedProfileComplete).toBe(true);
    expect(result.current.hasClaimedInterests).toBe(false);
    expect(result.current.referralCount).toBe(3);
  });

  it('computes progress toward next level', () => {
    mockUseAuthStore.mockReturnValue({
      user: userWith({ xp: 200, xpToNextLevel: 200 }),
      firebaseUser: null,
      isLoading: false,
      logout: vi.fn(),
      refreshUserProfile: vi.fn(),
    });

    const { result } = renderHook(() => useUserGamification(), { wrapper: makeWrapper() });

    // 200 XP in level 1 (0-399 range): 200/400 = 50%
    expect(result.current.progress).toBe(50);
  });

  it('shows 0 progress when XP is 0', () => {
    mockUseAuthStore.mockReturnValue({
      user: userWith({ xp: 0 }),
      firebaseUser: null,
      isLoading: false,
      logout: vi.fn(),
      refreshUserProfile: vi.fn(),
    });

    const { result } = renderHook(() => useUserGamification(), { wrapper: makeWrapper() });

    expect(result.current.progress).toBe(0);
  });

  it('shows 100 progress just below a level threshold', () => {
    mockUseAuthStore.mockReturnValue({
      user: userWith({ xp: 399, xpToNextLevel: 1 }),
      firebaseUser: null,
      isLoading: false,
      logout: vi.fn(),
      refreshUserProfile: vi.fn(),
    });

    const { result } = renderHook(() => useUserGamification(), { wrapper: makeWrapper() });

    // 399 XP, level 1, next threshold 400: (399-0)/(400-0) = 99.75% → rounds to 100
    expect(result.current.progress).toBe(100);
  });

  it('shows 0 progress at the start of a new level', () => {
    mockUseAuthStore.mockReturnValue({
      user: userWith({ xp: 400, level: 2, xpToNextLevel: 500 }),
      firebaseUser: null,
      isLoading: false,
      logout: vi.fn(),
      refreshUserProfile: vi.fn(),
    });

    const { result } = renderHook(() => useUserGamification(), { wrapper: makeWrapper() });

    // 400 XP = level 2 start; next threshold is 900; progress = 0
    expect(result.current.level).toBe(2);
    expect(result.current.progress).toBe(0);
  });

  it('shares one seed + stats round-trip between cards and exposes the stats', async () => {
    mockUseAuthStore.mockReturnValue({
      user: userWith({}),
      firebaseUser: null,
      isLoading: false,
      logout: vi.fn(),
      refreshUserProfile: vi.fn(),
    });
    vi.mocked(getUserStats).mockResolvedValueOnce({
      completedBookings: 4,
      totalPointsEarned: 250,
      reviewsWritten: 1,
      activeChallenges: 2,
      referralCount: 0,
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => [useUserGamification(), useUserGamification()],
      { wrapper },
    );

    await waitFor(() => expect(result.current[0].isLoaded).toBe(true));
    expect(seedDefaultSeason0Progress).toHaveBeenCalledTimes(1);
    expect(getUserStats).toHaveBeenCalledTimes(1);
    expect(result.current[0].completedBookings).toBe(4);
    expect(result.current[1].totalPointsEarned).toBe(250);
  });

  it('reload re-reads the user doc so XP and streak refresh', async () => {
    const refreshUserProfile = vi.fn().mockResolvedValue(undefined);
    mockUseAuthStore.mockReturnValue({
      user: userWith({}),
      firebaseUser: null,
      isLoading: false,
      logout: vi.fn(),
      refreshUserProfile,
    });

    const { result } = renderHook(() => useUserGamification(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(() => result.current.reload());

    expect(refreshUserProfile).toHaveBeenCalledTimes(1);
    expect(getUserStats).toHaveBeenCalledTimes(2);
  });

  it('converts lastCheckInAt from a Firestore Timestamp', () => {
    const when = new Date(2026, 8, 18, 9, 30);
    mockUseAuthStore.mockReturnValue({
      user: userWith({ lastCheckInAt: { toDate: () => when }, pointsBalance: 120 }),
      firebaseUser: null,
      isLoading: false,
      logout: vi.fn(),
      refreshUserProfile: vi.fn(),
    });

    const { result } = renderHook(() => useUserGamification(), { wrapper: makeWrapper() });

    expect(result.current.lastCheckInAt).toEqual(when);
    expect(result.current.pointsBalance).toBe(120);
  });

  it('SEASON0_CLIENT_REWARDS matches the vision doc §4 table', () => {
    expect(SEASON0_CLIENT_REWARDS.profileComplete).toEqual({ xp: 150, points: 150 });
    expect(SEASON0_CLIENT_REWARDS.interests).toEqual({ xp: 100, points: 100 });
    expect(SEASON0_CLIENT_REWARDS.zone).toEqual({ xp: 50, points: 50 });
    expect(SEASON0_CLIENT_REWARDS.family).toEqual({ xp: 300, points: 300 });
    expect(SEASON0_CLIENT_REWARDS.inviteFriend).toEqual({ xp: 200, points: 200 });
    expect(SEASON0_CLIENT_REWARDS.friendActive).toEqual({ xp: 300, points: 300 });
  });
});

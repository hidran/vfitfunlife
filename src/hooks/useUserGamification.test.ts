import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUserGamification, SEASON0_CLIENT_REWARDS } from './useUserGamification';
import type { User } from '@/types/firebase';

// Mock the auth store at the module level. The factory captures mockUseAuthStore
// by closure; vitest calls the factory after module init so the const is initialized.
const mockUseAuthStore = vi.fn(() => ({
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
    const { result } = renderHook(() => useUserGamification());

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

    const { result } = renderHook(() => useUserGamification());

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

    const { result } = renderHook(() => useUserGamification());

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

    const { result } = renderHook(() => useUserGamification());

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

    const { result } = renderHook(() => useUserGamification());

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

    const { result } = renderHook(() => useUserGamification());

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

    const { result } = renderHook(() => useUserGamification());

    // 400 XP = level 2 start; next threshold is 900; progress = 0
    expect(result.current.level).toBe(2);
    expect(result.current.progress).toBe(0);
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

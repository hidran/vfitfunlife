import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import {
  getUserStats,
  seedDefaultSeason0Progress,
} from '@/lib/firebase/functions';
import {
  computeLevel,
  xpToNextLevel as xpToNextLevelFn,
  progressToNextLevel,
  SEASON0_REWARDS,
} from '@/lib/gamification';

export interface UserGamification {
  /** Total XP earned (0 = not started). */
  xp: number;
  /** Current level (1-based). */
  level: number;
  /** XP needed to reach the next level. */
  xpToNextLevel: number;
  /** Percentage progress (0–100) toward the next level. */
  progress: number;
  /** Consecutive daily check-in streak. 0 = never checked in. */
  dayStreak: number;
  /** When the user last checked in, or null if never. */
  lastCheckInAt: Date | null;
  /** Current reward-currency balance (points / VToken). */
  pointsBalance: number;
  /** Whether the user has claimed the profile-complete reward. */
  hasClaimedProfileComplete: boolean;
  /** Whether the user has claimed the interests reward. */
  hasClaimedInterests: boolean;
  /** Whether the user has claimed the zone/city reward. */
  hasClaimedZone: boolean;
  /** Whether the user has claimed the family reward. */
  hasClaimedFamily: boolean;
  /** Total points earned across all transactions (from getUserStats). */
  totalPointsEarned: number;
  /** Active challenges count (from getUserStats). */
  activeChallenges: number;
  /** Referral count (from getUserStats). */
  referralCount: number;
  /** Completed bookings count (from getUserStats). */
  completedBookings: number;
  /** Whether the server stats have loaded at least once. */
  isLoaded: boolean;
  /** Whether we are currently loading/seeding. */
  isLoading: boolean;
  /** Error message if loading failed. */
  error: string | null;
  /** Re-read the user doc and server stats after a user action (check-in, claim, family). */
  reload: () => Promise<void>;
}

/** Firestore Timestamp, a Date, or an ISO string → Date. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

const gamificationKey = (userId: string | undefined) => ['userGamification', userId] as const;

/**
 * The current user's gamification state: XP/level/streak straight from the user
 * doc, plus aggregate stats from the getUserStats callable.
 *
 * Several profile cards call this at once; the query key makes them share a
 * single seed + stats round-trip instead of one each.
 */
export function useUserGamification(): UserGamification {
  const { user, isLoading: authLoading, refreshUserProfile } = useAuthStore();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const statsQuery = useQuery({
    queryKey: gamificationKey(userId),
    queryFn: async () => {
      // Backfill gamification fields on user docs created before Season 0.
      // Best-effort: the cards already default missing fields, so a failed
      // backfill must not also hide the stats.
      await seedDefaultSeason0Progress().catch((err: unknown) => {
        console.warn('[gamification] seedDefaultSeason0Progress failed', err);
      });
      return getUserStats();
    },
    enabled: !authLoading && !!userId,
    staleTime: 60 * 1000,
    retry: 1,
  });
  const stats = statsQuery.data;

  const xp = user?.xp ?? 0;
  const progress = computeLevel(xp) === 1 && xp === 0 ? 0 : progressToNextLevel(xp);

  const reload = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      refreshUserProfile(),
      queryClient.invalidateQueries({ queryKey: gamificationKey(userId) }),
    ]);
  }, [userId, refreshUserProfile, queryClient]);

  const error = statsQuery.error
    ? statsQuery.error instanceof Error
      ? statsQuery.error.message
      : String(statsQuery.error)
    : null;

  return {
    xp,
    level: user?.level ?? 1,
    xpToNextLevel: user?.xpToNextLevel ?? xpToNextLevelFn(xp),
    progress,
    dayStreak: user?.dayStreak ?? 0,
    lastCheckInAt: toDate(user?.lastCheckInAt),
    pointsBalance: user?.pointsBalance ?? 0,
    hasClaimedProfileComplete: user?.hasClaimedProfileComplete ?? false,
    hasClaimedInterests: user?.hasClaimedInterests ?? false,
    hasClaimedZone: user?.hasClaimedZone ?? false,
    hasClaimedFamily: user?.hasClaimedFamily ?? false,
    totalPointsEarned: stats?.totalPointsEarned ?? 0,
    activeChallenges: stats?.activeChallenges ?? 0,
    referralCount: user?.referralCount ?? stats?.referralCount ?? 0,
    completedBookings: stats?.completedBookings ?? 0,
    isLoaded: statsQuery.isSuccess,
    isLoading: authLoading || statsQuery.isLoading,
    error,
    reload,
  };
}

/**
 * Reward amounts for the Season 0 onboarding claims, derived from the
 * vision doc §4 table. Kept locally here so the UI can show the reward
 * before the server call completes.
 */
export const SEASON0_CLIENT_REWARDS = {
  profileComplete: SEASON0_REWARDS.profileComplete,
  interests: SEASON0_REWARDS.interests,
  zone: SEASON0_REWARDS.zone,
  family: SEASON0_REWARDS.family,
  inviteFriend: SEASON0_REWARDS.inviteFriend,
  friendActive: SEASON0_REWARDS.friendActive,
} as const;

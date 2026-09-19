import { useState, useEffect, useCallback } from 'react';
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
import type { AppLocale } from '@/types/locale';

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
  /** Whether gamification fields have been seeded on the server. */
  isSeeded: boolean;
  /** Whether we are currently loading/seeding. */
  isLoading: boolean;
  /** Error message if a claim failed. */
  error: string | null;
  /** Load the current gamification state from the server. */
  load: () => Promise<Awaited<ReturnType<typeof getUserStats>> | null | undefined>;
  /** Reload the current gamification state after a user action. */
  reload: () => Promise<void>;
}

/**
 * Hook that loads the current user's gamification state from the auth store
 * and the getUserStats callable, and seeds missing fields if needed.
 *
 * Call once on the profile page (or anywhere gamification is displayed).
 */
export function useUserGamification(): UserGamification {
  const { user, isLoading: authLoading } = useAuthStore();
  const [isSeeded, setIsSeeded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getUserStats>> | null>(null);

  // Derived from user doc fields (when present).
  const xp = user?.xp ?? 0;
  const level = user?.level ?? 1;
  const xpToNext = user?.xpToNextLevel ?? xpToNextLevelFn(xp);
  const dayStreak = user?.dayStreak ?? 0;
  const hasClaimedProfileComplete = user?.hasClaimedProfileComplete ?? false;
  const hasClaimedInterests = user?.hasClaimedInterests ?? false;
  const hasClaimedZone = user?.hasClaimedZone ?? false;
  const hasClaimedFamily = user?.hasClaimedFamily ?? false;

  const progress = computeLevel(xp) === 1 && xp === 0 ? 0 : progressToNextLevel(xp);

  // Load stats from the server (getUserStats callable) and seed if needed.
  const load = useCallback(async () => {
    if (authLoading || !user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // First ensure gamification fields exist on the server doc.
      const seedResult = await seedDefaultSeason0Progress();
      setIsSeeded(seedResult.seeded === true);

      // Then load stats. If the seed just ran, the user doc now has the fields
      // but getUserStats reads from subcollections — still safe to call.
      const stats = await getUserStats();
      setStats(stats);
      return stats;
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message)
        : 'Impossibile caricare i dati di gioco';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, authLoading]);

  // Expose a re-load trigger for consumers.
  // Manual reload always attempts the server call regardless of auth loading state
  // (clients call it after known state changes, e.g. completing onboarding).
  const reload = useCallback(async () => {
    setError(null);
    if (authLoading || !user?.id) {
      // Can't load yet — but don't silently swallow; leave error for the caller.
      return;
    }
    await load();
  }, [authLoading, user?.id, load]);

  return {
    xp,
    level,
    xpToNextLevel: xpToNext,
    progress,
    dayStreak,
    hasClaimedProfileComplete,
    hasClaimedInterests,
    hasClaimedZone,
    hasClaimedFamily,
    totalPointsEarned: stats?.totalPointsEarned ?? 0,
    activeChallenges: stats?.activeChallenges ?? 0,
    referralCount: user?.referralCount ?? stats?.referralCount ?? 0,
    completedBookings: stats?.completedBookings ?? 0,
    isSeeded,
    isLoading: isLoading || authLoading,
    error,
    // Expose load/reload for manual triggering (e.g., after a claim).
    load,
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

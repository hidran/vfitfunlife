'use client';

import { useState, useCallback } from 'react';
import { Flame, RefreshCw, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useUserGamification } from '@/hooks/useUserGamification';
import { useI18n } from '@/hooks/useI18n';
import { checkIn } from '@/lib/firebase/functions';
import { checkInStatus, STREAK_MILESTONES, type CheckInStatus } from '@/lib/gamification';
import { cn } from '@/lib/utils';
import type { MessageKey } from '@/i18n/messages';
import { Button } from '@/components/ui/button';

const STATUS_LABEL: Record<CheckInStatus, MessageKey> = {
  never: 'profile.streak.never',
  today: 'profile.streak.lastCheckInToday',
  yesterday: 'profile.streak.lastCheckInYesterday',
  interrupted: 'profile.streak.interrupted',
};

export function StreakCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const gamification = useUserGamification();
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [reward, setReward] = useState<{ xp: number; points: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const status = checkInStatus(gamification.lastCheckInAt, new Date());
  const checkedInToday = status === 'today';
  // An interrupted streak restarts at the next check-in, so it no longer counts.
  const activeStreak = status === 'today' || status === 'yesterday' ? gamification.dayStreak : 0;
  const nextMilestone = STREAK_MILESTONES.find((day) => day > activeStreak);

  const handleCheckIn = useCallback(async () => {
    setIsCheckingIn(true);
    setErrorMsg(null);
    try {
      const result = await checkIn();
      if (result.checkedIn) {
        setReward({ xp: result.xpAwarded ?? 0, points: result.pointsAwarded ?? 0 });
      }
      await gamification.reload();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCheckingIn(false);
    }
  }, [gamification]);

  return (
    <section
      aria-labelledby="streak-card-title"
      className={cn(
        'rounded-2xl border border-hairline bg-surface bg-gradient-to-br from-orange-500/10 to-transparent p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/15" aria-hidden>
          <Flame
            size={20}
            className={cn('text-orange-400 light:text-orange-600', activeStreak === 0 && 'opacity-40')}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="streak-card-title" className="text-sm font-semibold text-text-inverse">
            {t('profile.streak.title')}
          </h2>
          <p className="text-xs text-text-tertiary">{t('profile.streak.subtitle')}</p>
        </div>
        {activeStreak > 0 && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-orange-500/15 px-2.5 py-1 text-sm font-bold tabular-nums text-orange-400 light:text-orange-700">
            {activeStreak}{' '}
            <span className="text-xs font-semibold">
              {activeStreak === 1 ? t('profile.streak.daySingular') : t('profile.streak.dayPlural')}
            </span>
          </span>
        )}
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
        <CalendarDays size={14} className="shrink-0" aria-hidden />
        {t(STATUS_LABEL[status])}
      </p>

      <Button
        size="md"
        variant={checkedInToday ? 'ghost' : 'primary'}
        disabled={checkedInToday || isCheckingIn || gamification.isLoading}
        onClick={handleCheckIn}
        className={cn(
          'mt-3 w-full justify-center gap-2 px-4 text-sm',
          checkedInToday && 'bg-success-DEFAULT/15 text-success-DEFAULT disabled:opacity-100',
        )}
      >
        {isCheckingIn ? (
          <RefreshCw size={16} className="animate-spin" aria-label={t('common.loading')} />
        ) : checkedInToday ? (
          <>
            <CheckCircle2 size={16} aria-hidden />
            {t('profile.streak.alreadyCheckedIn')}
          </>
        ) : (
          t('profile.streak.checkInButton')
        )}
      </Button>

      {reward && (
        <p role="status" className="mt-2 text-center text-xs font-semibold text-success-DEFAULT">
          {t('profile.streak.rewardEarned', { xp: reward.xp, points: reward.points })}
        </p>
      )}
      {errorMsg && (
        <p role="alert" className="mt-2 text-xs text-error-DEFAULT">
          {errorMsg}
        </p>
      )}

      <div className="mt-4 border-t border-hairline pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          {t('profile.streak.milestonePrefix')}
        </p>
        <ol className="relative mt-2 grid grid-cols-5">
          {/* Track behind the dots, from the first dot's centre to the last one's. */}
          <span className="absolute left-[10%] right-[10%] top-[7px] h-0.5 rounded-full bg-hairline" aria-hidden />
          {STREAK_MILESTONES.map((day) => {
            const reached = activeStreak >= day;
            const isNext = day === nextMilestone;
            return (
              <li
                key={day}
                className="relative flex flex-col items-center gap-1"
                aria-label={`${t('profile.streak.milestoneDays', { days: day })}: ${
                  reached ? t('profile.streak.milestoneEarned') : t('profile.streak.milestoneNotEarned')
                }`}
              >
                <span
                  className={cn(
                    'h-4 w-4 rounded-full border-2',
                    reached
                      ? 'border-orange-400 bg-gradient-to-br from-orange-400 to-amber-500 shadow-[0_0_8px_rgba(251,146,60,0.6)]'
                      : isNext
                        ? 'border-orange-400 bg-surface'
                        : 'border-text-tertiary/40 bg-surface',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'text-[11px] tabular-nums',
                    reached || isNext
                      ? 'font-semibold text-orange-400 light:text-orange-700'
                      : 'text-text-tertiary',
                  )}
                >
                  {t('profile.streak.milestoneDays', { days: day })}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

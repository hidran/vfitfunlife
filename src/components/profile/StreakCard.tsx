'use client';

import { useState, useCallback } from 'react';
import { Flame, RefreshCw, CalendarDays, Trophy } from 'lucide-react';
import { useUserGamification } from '@/hooks/useUserGamification';
import { useI18n } from '@/hooks/useI18n';
import { checkIn } from '@/lib/firebase/functions';
import { cn } from '@/lib/utils';
import type { MessageKey } from '@/i18n/messages';
import { Button } from '@/components/ui/button';

const MILESTONES = [7, 14, 30, 60, 90] as const;

function MilestoneDot({
  day,
  reached,
  label,
  className,
}: {
  day: number;
  reached: boolean;
  label: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-0.5 min-w-0',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-2 w-2 rounded-full',
          reached
            ? 'bg-gradient-to-r from-orange-400 to-amber-500 shadow-[0_0_8px_rgba(251,146,60,0.6)]'
            : 'bg-surface-3',
        )}
      />
      <span className="text-[9px] text-text-tertiary">{label}</span>
    </div>
  );
}

export function StreakCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const gamification = useUserGamification();
  const [checkInState, setCheckInState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dayStreak = gamification.dayStreak;

  // Derive "last check-in" qualitative state from dayStreak.
  // The hook doesn't yet expose lastCheckInAt; once it does, derive
  // today/yesterday/interrupted from that timestamp instead of this heuristic.
  const lastCheckInLabel: string = dayStreak === 0
    ? t('profile.streak.never')
    : dayStreak === 1
      ? t('profile.streak.lastCheckInToday')
      : t('profile.streak.lastCheckInYesterday');

  const canCheckIn = dayStreak === 0 || checkInState !== 'loading';

  const handleCheckIn = useCallback(async () => {
    setCheckInState('loading');
    setErrorMsg(null);
    try {
      const result = await checkIn();
      setCheckInState(result.checkedIn ? 'done' : 'idle');
      // Reload gamification to reflect new streak + XP.
      await gamification.reload();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'Check-in non riuscito';
      setErrorMsg(message);
      setCheckInState('error');
    }
  }, [gamification]);

  return (
    <div
      className={cn(
        'rounded-2xl border border-hairline bg-gradient-to-br from-[#2a1f1a] to-[#1a1410] p-4',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-gradient-to-br from-orange-500/30 to-amber-600/20 p-2">
            <Flame
              size={20}
              className={cn(
                'text-orange-400',
                dayStreak === 0 && 'opacity-40',
              )}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-inverse">
              {t('profile.streak.title')}
            </p>
            <p className="text-[10px] text-text-tertiary">
              {t('profile.streak.subtitle')}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-orange-300',
            dayStreak === 0 && 'text-text-tertiary bg-surface-2',
          )}
        >
          {dayStreak > 0 ? `${dayStreak} ${dayStreak === 1 ? t('profile.streak.daySingular') : t('profile.streak.dayPlural')}` : t('profile.streak.never')}
        </span>
      </div>

      {/* Last check-in line */}
      <div className="flex items-center gap-2 text-xs text-text-tertiary mb-3">
        <CalendarDays size={12} />
        <span>
          {dayStreak === 0
            ? t('profile.streak.never')
            : dayStreak === 1
              ? t('profile.streak.lastCheckInToday')
              : t('profile.streak.lastCheckInYesterday')}
        </span>
      </div>

      {/* Check-in button */}
      <Button
        size="sm"
        variant="primary"
        disabled={!canCheckIn || gamification.isLoading}
        onClick={handleCheckIn}
        className={cn(
          'w-full justify-center gap-2 text-sm font-medium',
          checkInState === 'done' && 'bg-success-DEFAULT/20 text-success-DEFAULT border-success-DEFAULT/30',
          checkInState === 'error' && 'bg-error-DEFAULT/20 text-error-DEFAULT border-error-DEFAULT/30',
        )}
      >
        {checkInState === 'loading' ? (
          <RefreshCw size={14} className="animate-spin" />
        ) : checkInState === 'done' ? (
          <>
            <Trophy size={14} />
            {t('profile.streak.checkInButton')} ✓
          </>
        ) : checkInState === 'error' ? (
          errorMsg
        ) : dayStreak > 0 ? (
          t('profile.streak.alreadyCheckedIn')
        ) : (
          t('profile.streak.checkInButton')
        )}
      </Button>

      {/* Milestones strip */}
      <div className="mt-4 pt-3 border-t border-hairline">
        <p className="text-[9px] uppercase tracking-[0.14em] text-text-tertiary mb-2">
          {t('profile.streak.milestonePrefix')}
        </p>
        <div className="flex items-center justify-between gap-1">
          {MILESTONES.map((day) => {
            const reached = dayStreak >= day;
            return (
              <MilestoneDot
                key={day}
                day={day}
                reached={reached}
                label={`${day}${reached ? '' : 'd'}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

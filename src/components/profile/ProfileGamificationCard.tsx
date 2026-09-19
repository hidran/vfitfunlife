'use client';

import { Award, Flame, Gift, Loader2 } from 'lucide-react';
import { useUserGamification } from '@/hooks/useUserGamification';
import { useI18n } from '@/hooks/useI18n';
import { checkInStatus } from '@/lib/gamification';
import { cn } from '@/lib/utils';

function LevelBadge({ level }: { level: number }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-vip-gold/15 px-2.5 py-1 text-xs font-bold text-vip-gold light:bg-amber-100 light:text-amber-700">
      <Award size={12} aria-hidden />
      {t('profile.gamification.levelLabel', { level })}
    </span>
  );
}

function StreakChip({ streak }: { streak: number }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-orange-500/30 bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-400 light:text-orange-700">
      <Flame size={12} aria-hidden />
      {streak} {streak === 1 ? t('profile.streak.daySingular') : t('profile.streak.dayPlural')}
    </span>
  );
}

/**
 * Season 0 status hero: level, XP toward the next level and the points
 * (reward currency) balance. Mobile-first: a single column that never needs
 * more than ~280px.
 */
export function ProfileGamificationCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const gamification = useUserGamification();
  const progress = Math.min(100, Math.max(0, gamification.progress));
  // A streak whose last check-in is older than yesterday is already broken.
  const status = checkInStatus(gamification.lastCheckInAt, new Date());
  const activeStreak = status === 'today' || status === 'yesterday' ? gamification.dayStreak : 0;

  return (
    <section
      aria-label={t('profile.gamification.levelLabel', { level: gamification.level })}
      className={cn(
        'rounded-2xl border border-hairline bg-surface bg-gradient-to-br from-vfit-primary/15 via-transparent to-vfun-primary/10 p-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <LevelBadge level={gamification.level} />
        {activeStreak > 0 && <StreakChip streak={activeStreak} />}
        <span className="ml-auto whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          {gamification.isLoading ? (
            <Loader2 size={14} className="animate-spin" aria-label={t('common.loading')} />
          ) : (
            t('profile.gamification.season0')
          )}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="min-w-0 text-3xl font-bold leading-none tabular-nums text-text-inverse">
          {gamification.xp.toLocaleString()}
          <span className="ml-1 text-sm font-semibold text-text-tertiary">XP</span>
        </p>
        <div className="shrink-0 text-right">
          <p className="flex items-center justify-end gap-1 text-[11px] font-medium text-text-tertiary">
            <Gift size={12} className="text-vlife-primary light:text-emerald-600" aria-hidden />
            {t('profile.stats.points')}
          </p>
          <p className="text-lg font-bold leading-tight tabular-nums text-text-inverse">
            {gamification.pointsBalance.toLocaleString()}
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label={t('profile.gamification.toNextLevel', { needed: gamification.xpToNextLevel })}
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-vfit-primary to-vlife-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-text-secondary">
        {t('profile.gamification.toNextLevel', { needed: gamification.xpToNextLevel })}
      </p>
      {progress >= 90 && progress < 100 && (
        <p className="mt-1 text-xs font-medium text-orange-400 light:text-orange-700">
          {t('profile.gamification.progressHint')}
        </p>
      )}
    </section>
  );
}

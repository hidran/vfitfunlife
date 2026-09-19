'use client';

import { BookOpen, Trophy, Users, Gift } from 'lucide-react';
import { useUserGamification } from '@/hooks/useUserGamification';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { MessageKey } from '@/i18n/messages';

interface StatTileProps {
  icon: typeof BookOpen;
  labelKey: MessageKey;
  value: number;
  /** Icon colour + tinted background, e.g. 'text-info-DEFAULT bg-info-DEFAULT/15'. */
  accentClass: string;
  isLoading: boolean;
}

function StatTile({ icon: Icon, labelKey, value, accentClass, isLoading }: StatTileProps) {
  const { t } = useI18n();
  return (
    // Icon above the text on the narrowest phones, beside it from 360px.
    <div className="flex min-w-0 flex-col items-start gap-2 rounded-xl bg-surface-2 p-3 min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-2.5">
      <span
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', accentClass)}
        aria-hidden
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            'text-lg font-bold leading-tight tabular-nums text-text-inverse',
            isLoading && 'animate-pulse text-text-tertiary',
          )}
        >
          {isLoading ? '–' : value.toLocaleString()}
        </p>
        <p className="text-[11px] leading-tight text-text-tertiary">{t(labelKey)}</p>
      </div>
    </div>
  );
}

/**
 * Season 0 activity counters. XP and level live in ProfileGamificationCard,
 * so they are not repeated here. Two columns on phones, four from `sm`.
 */
export function ProfileStatsCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const gamification = useUserGamification();
  const isLoading = !gamification.isLoaded && gamification.isLoading;

  return (
    <section
      aria-labelledby="profile-stats-title"
      className={cn('rounded-2xl border border-hairline bg-surface p-4', className)}
    >
      <h2 id="profile-stats-title" className="text-sm font-semibold text-text-inverse">
        {t('profile.gamification.statsTitle')}
      </h2>
      <p className="text-xs text-text-tertiary">{t('profile.gamification.statsSubtitle')}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          icon={BookOpen}
          labelKey="profile.gamification.stats.bookings"
          value={gamification.completedBookings}
          accentClass="bg-warning-DEFAULT/15 text-warning-DEFAULT"
          isLoading={isLoading}
        />
        <StatTile
          icon={Trophy}
          labelKey="profile.gamification.stats.challenges"
          value={gamification.activeChallenges}
          accentClass="bg-info-DEFAULT/15 text-info-DEFAULT"
          isLoading={isLoading}
        />
        <StatTile
          icon={Users}
          labelKey="profile.gamification.stats.referralsCount"
          value={gamification.referralCount}
          accentClass="bg-vfun-primary/15 text-vfun-primary"
          isLoading={isLoading}
        />
        <StatTile
          icon={Gift}
          labelKey="profile.gamification.stats.pointsEarned"
          value={gamification.totalPointsEarned}
          accentClass="bg-vlife-primary/15 text-vlife-primary light:text-emerald-600"
          isLoading={isLoading}
        />
      </div>
    </section>
  );
}

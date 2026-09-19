'use client';

import { Award, Target, BookOpen, Trophy, Users, Star } from 'lucide-react';
import { useUserGamification } from '@/hooks/useUserGamification';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { MessageKey } from '@/i18n/messages';

interface StatTileProps {
  icon: typeof Award;
  labelKey: MessageKey;
  value: string | number;
  accentClass?: string;
  iconClass?: string;
  subtitleKey?: MessageKey;
}

function StatTile({
  icon: Icon,
  labelKey,
  value,
  accentClass = 'text-vfit-primary',
  iconClass,
  subtitleKey,
}: StatTileProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
        <Icon size={12} className={iconClass ?? accentClass} />
        {t(labelKey)}
      </div>
      <div className="text-xl font-bold text-text-inverse">{value}</div>
      {subtitleKey && (
        <div className="text-[9px] text-text-tertiary">{t(subtitleKey)}</div>
      )}
    </div>
  );
}

interface ProfileStatsCardProps {
  className?: string;
}

export function ProfileStatsCard({ className }: ProfileStatsCardProps) {
  const { t } = useI18n();
  const gamification = useUserGamification();

  return (
    <div
      className={cn(
        'rounded-2xl border border-hairline bg-gradient-to-br from-[#1a1a2e] to-[#16213e] p-4',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-text-inverse">
            {t('profile.gamification.statsTitle')}
          </p>
          <p className="text-[10px] text-text-tertiary">
            {t('profile.gamification.statsSubtitle')}
          </p>
        </div>
        {gamification.isLoading ? (
          <span className="text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
            {t('common.loading')}
          </span>
        ) : (
          <span className="text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
            {t('profile.gamification.season0')}
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-5 gap-2">
        <StatTile
          icon={Target}
          labelKey="profile.gamification.stats.xp"
          value={gamification.xp}
          accentClass="text-vlife-primary"
          iconClass="text-vlife-primary"
        />
        <StatTile
          icon={Award}
          labelKey="profile.gamification.stats.level"
          value={gamification.level}
          accentClass="text-vip-gold"
          iconClass="text-vip-gold"
        />
        <StatTile
          icon={BookOpen}
          labelKey="profile.gamification.stats.bookings"
          value={gamification.completedBookings}
          accentClass="text-warning-DEFAULT"
          iconClass="text-warning-DEFAULT"
        />
        <StatTile
          icon={Trophy}
          labelKey="profile.gamification.stats.challenges"
          value={gamification.activeChallenges}
          accentClass="text-info-DEFAULT"
          iconClass="text-info-DEFAULT"
        />
        <StatTile
          icon={Users}
          labelKey="profile.gamification.stats.referralsCount"
          value={gamification.referralCount}
          accentClass="text-section-primary"
          iconClass="text-section-primary"
        />
      </div>

      {/* Progress hint */}
      {gamification.progress >= 80 && gamification.progress < 100 && (
        <p className="mt-3 text-center text-[10px] text-orange-400/80">
          {t('profile.gamification.progressHint')}
        </p>
      )}
    </div>
  );
}

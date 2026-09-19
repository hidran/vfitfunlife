'use client';

import { Award, Flame, Target, Star, Gift, CheckCircle, Loader2 } from 'lucide-react';
import { useUserGamification } from '@/hooks/useUserGamification';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { MessageKey } from '@/i18n/messages';

interface ProgressBarProps {
  progress: number; // 0–100
  className?: string;
}

function ProgressBar({ progress, className }: ProgressBarProps) {
  return (
    <div
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-surface-3',
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-vfit-primary to-vlife-primary transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

interface LevelBadgeProps {
  level: number;
  className?: string;
}

function LevelBadge({ level, className }: LevelBadgeProps) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-vip-gold/20 to-vip-gold/5 px-2.5 py-0.5 text-xs font-bold text-vip-gold',
        className,
      )}
    >
      <Award size={12} />
      {t('profile.gamification.levelLabel', { level })}
    </span>
  );
}

interface StreakChipProps {
  streak: number;
  className?: string;
}

function StreakChip({ streak, className }: StreakChipProps) {
  const { t } = useI18n();
  if (streak === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2.5 py-0.5 text-xs text-text-tertiary',
          className,
        )}
      >
        <Flame size={12} className="opacity-40" />
        {t('profile.gamification.notStarted')}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500/20 to-orange-400/10 border border-orange-500/30 px-2.5 py-0.5 text-xs font-semibold text-orange-400',
        className,
      )}
    >
      <Flame size={12} />
      {streak} {t('profile.gamification.dayStreak')}
    </span>
  );
}

interface GamificationStatProps {
  icon: typeof Award;
  labelKey: MessageKey;
  value: string | number;
  accentClass?: string;
  subtitleKey?: MessageKey;
}

function GamificationStat({
  icon: Icon,
  labelKey,
  value,
  accentClass = 'text-vfit-primary',
  subtitleKey,
}: GamificationStatProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
        <Icon size={12} className={accentClass} />
        {t(labelKey)}
      </div>
      <div className="text-xl font-bold text-text-inverse">{value}</div>
      {subtitleKey && (
        <div className="text-[9px] text-text-tertiary">{t(subtitleKey)}</div>
      )}
    </div>
  );
}

interface ProfileGamificationCardProps {
  className?: string;
}

export function ProfileGamificationCard({
  className,
}: ProfileGamificationCardProps) {
  const { t } = useI18n();
  const gamification = useUserGamification();

  return (
    <div
      className={cn(
        'rounded-2xl border border-hairline bg-gradient-to-br from-[#1a1a2e] to-[#16213e] p-4',
        className,
      )}
    >
      {/* Header: Level + Streak */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LevelBadge level={gamification.level} />
          <StreakChip streak={gamification.dayStreak} />
        </div>
        {gamification.isLoading ? (
          <Loader2 size={16} className="text-text-tertiary animate-spin" />
        ) : (
          <span className="text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
            {t('profile.gamification.season0')}
          </span>
        )}
      </div>

      {/* XP Bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-text-tertiary">
            {t('profile.gamification.xpLabel', { xp: gamification.xp })}
          </span>
          <span className="text-text-secondary font-medium">
            {t('profile.gamification.toNextLevel', {
              needed: gamification.xpToNextLevel,
            })}
          </span>
        </div>
        <ProgressBar progress={gamification.progress} />
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-hairline">
        <GamificationStat
          icon={Target}
          labelKey="profile.gamification.xp"
          value={gamification.xp}
          accentClass="text-vlife-primary"
        />
        <GamificationStat
          icon={Star}
          labelKey="profile.gamification.level"
          value={gamification.level}
          accentClass="text-vip-gold"
        />
        <GamificationStat
          icon={Gift}
          labelKey="profile.gamification.points"
          value={gamification.totalPointsEarned}
          accentClass="text-warning-DEFAULT"
          subtitleKey="profile.gamification.totalPointsSubtitle"
        />
        <GamificationStat
          icon={CheckCircle}
          labelKey="profile.gamification.referrals"
          value={gamification.referralCount}
          accentClass="text-info-DEFAULT"
        />
      </div>
    </div>
  );
}

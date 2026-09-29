'use client';

import { useSection } from '@/contexts/SectionContext';
import { Bell, Briefcase, Dumbbell, Home, Menu, PartyPopper, Sparkles, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { canAccessProviderArea } from '@/lib/providerStatus';
import { PROVIDER_HOME } from '@/lib/auth/postAuthRoute';
import { useAssistantStore } from '@/stores/assistantStore';

const sectionBranding = {
  fit: {
    label: 'VFit',
    icon: Dumbbell,
    gradient: 'from-vfit-primary via-vfit-secondary to-vfit-accent',
    headerBg: 'bg-surface/95 border-hairline',
    iconBg: 'hover:bg-content/5',
    iconColor: 'text-content/80',
    ringOffset: 'focus-visible:ring-offset-background-dark',
  },
  fun: {
    label: 'VFun',
    icon: PartyPopper,
    gradient: 'from-vfun-primary via-vfun-secondary to-vfun-accent',
    headerBg: 'bg-surface/95 border-hairline',
    iconBg: 'hover:bg-content/5',
    iconColor: 'text-content/80',
    ringOffset: 'focus-visible:ring-offset-background-dark',
  },
  life: {
    label: 'VLife',
    icon: Sparkles,
    gradient: 'from-vlife-primary via-vlife-secondary to-vlife-accent',
    headerBg: 'bg-surface/95 border-hairline',
    iconBg: 'hover:bg-content/5',
    iconColor: 'text-content/80',
    ringOffset: 'focus-visible:ring-offset-background-dark',
  },
} as const;

interface HeaderProps {
  onMenuClick: () => void;
  notificationCount?: number;
  userAvatarUrl?: string | null;
}

export function Header({ onMenuClick, notificationCount = 0, userAvatarUrl }: HeaderProps) {
  const { section } = useSection();
  const { t } = useI18n();
  const brand = sectionBranding[section];
  const showHomeShortcut = section === 'fun';
  // One tap to the provider dashboard from anywhere; the drawer entry is two taps deep.
  const providerStatus = useAuthStore((state) => state.user?.providerStatus);
  const showProviderShortcut = canAccessProviderArea(providerStatus);
  const signedIn = useAuthStore((state) => !!state.user);
  const openAssistant = useAssistantStore((state) => state.open);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md',
        brand.headerBg
      )}
    >
      <div className="pt-safe">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMenuClick}
              className={cn(
                'touch-target rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2',
                brand.iconBg,
                brand.iconColor,
                brand.ringOffset
              )}
              aria-label={t('header.appSections')}
            >
              <Menu className="h-5 w-5" />
            </button>

            {showHomeShortcut && (
              <Link
                href="/home"
                className={cn(
                  'touch-target flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2',
                  brand.iconBg,
                  brand.iconColor,
                  brand.ringOffset
                )}
                aria-label={t('common.home')}
              >
                <Home className="h-4 w-4" />
              </Link>
            )}

            {showProviderShortcut && (
              <Link
                href={PROVIDER_HOME}
                className={cn(
                  'touch-target flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2',
                  brand.iconBg,
                  brand.iconColor,
                  brand.ringOffset
                )}
                aria-label={t('header.providerDashboard')}
              >
                <Briefcase className="h-5 w-5" />
              </Link>
            )}
          </div>

          <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center">
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-lg font-display font-semibold italic tracking-tight text-transparent',
                brand.gradient
              )}
            >
              {brand.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {signedIn && (
              // Hidden below 360px: with the provider shortcut the bar has no room left there;
              // the side drawer has the same entry.
              <button
                type="button"
                onClick={openAssistant}
                className={cn(
                  'touch-target hidden min-[360px]:flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2',
                  brand.iconBg,
                  brand.ringOffset
                )}
                aria-label={t('assistant.title')}
                data-testid="header-assistant"
              >
                <Sparkles size={20} className="text-[#00C9FF] light:text-vfit-secondary" />
              </button>
            )}
            <Link
              href="/notifications"
              className={cn(
                'touch-target relative flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2',
                brand.iconBg,
                brand.ringOffset
              )}
              aria-label={
                notificationCount > 0
                  ? t('header.notificationsUnread', { count: notificationCount })
                  : t('header.notifications')
              }
            >
              <Bell size={20} className="text-content/80" />

              {notificationCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-error text-white text-xs font-bold rounded-full"
                  aria-hidden="true"
                >
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </Link>

            <Link
              href="/profile"
              className={cn(
                'touch-target flex items-center justify-center rounded-full overflow-hidden transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2',
                brand.iconBg,
                brand.ringOffset
              )}
              aria-label={t('header.goToProfile')}
            >
              {userAvatarUrl ? (
                <Image
                  src={userAvatarUrl}
                  alt={t('header.profileAvatarAlt')}
                  width={32}
                  height={32}
                  unoptimized
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-content/5 border border-hairline flex items-center justify-center">
                  <User size={16} className="text-content-muted" />
                </div>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

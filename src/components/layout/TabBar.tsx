'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Dumbbell, PartyPopper, Plus, Sparkles, User } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useSection, type Section } from '@/contexts/SectionContext';
import { cn } from '@/lib/utils';

interface SectionTab {
  section: Section;
  label: string;
  icon: typeof Dumbbell;
}

interface RouteTab {
  labelKey: 'tab.profile';
  href: string;
  icon: typeof User;
}

const sectionTabs: SectionTab[] = [
  { section: 'fit', label: 'VFit', icon: Dumbbell },
  { section: 'fun', label: 'VFun', icon: PartyPopper },
  { section: 'life', label: 'VLife', icon: Sparkles },
];

const profileTab: RouteTab = {
  labelKey: 'tab.profile',
  href: '/profile',
  icon: User,
};

function matchesSectionRoute(pathname: string | null, section: Section): boolean {
  if (!pathname) return false;

  if (pathname.startsWith('/home')) {
    return true;
  }

  if (section === 'fit') {
    return pathname.startsWith('/fit');
  }

  if (section === 'fun') {
    return pathname.startsWith('/fun');
  }

  return pathname.startsWith('/life');
}

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { section, setSection } = useSection();
  const ProfileIcon = profileTab.icon;

  const handleRoutePush = (href: string) => {
    router.push(href);
  };

  const handleSectionSelect = (nextSection: Section) => {
    setSection(nextSection);
    router.push('/home');
  };

  const isBookingActive = pathname?.startsWith('/booking');
  const isProfileActive = pathname?.startsWith('/profile');

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/80 bg-white/95 backdrop-blur-md"
      role="navigation"
      aria-label={t('tab.mainNavigation')}
    >
      <div className="pb-safe">
        <div className="relative grid h-16 grid-cols-5 items-center px-2">
          {sectionTabs.slice(0, 2).map((tab) => {
            const Icon = tab.icon;
            const isActive = section === tab.section && matchesSectionRoute(pathname, tab.section);

            return (
              <button
                key={tab.section}
                type="button"
                onClick={() => handleSectionSelect(tab.section)}
                aria-label={tab.label}
                className={cn(
                  'relative flex flex-col items-center justify-center touch-target min-w-[64px] py-1.5',
                  'transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2',
                  'focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white'
                )}
              >
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-section-primary"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={cn('transition-colors duration-200', isActive ? 'text-section-primary' : 'text-slate-400')}
                  aria-hidden="true"
                />
                <span className={cn('mt-1 text-[10px] font-medium transition-colors duration-200', isActive ? 'text-section-primary' : 'text-slate-500')}>
                  {tab.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => handleRoutePush('/booking')}
            aria-label={t('common.bookNow')}
            className="flex items-center justify-center"
          >
            <span
              className={cn(
                'relative -top-4 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white shadow-xl transition-transform',
                isBookingActive
                  ? 'bg-section-gradient text-white scale-105 shadow-[0_10px_24px_rgba(0,0,0,0.2)]'
                  : 'bg-section-gradient text-white hover:scale-105 shadow-[0_10px_24px_rgba(0,0,0,0.15)]'
              )}
            >
              <Plus className="h-7 w-7" />
              {isBookingActive && (
                <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
              )}
            </span>
          </button>

          {sectionTabs.slice(2).map((tab) => {
            const Icon = tab.icon;
            const isActive = section === tab.section && matchesSectionRoute(pathname, tab.section);

            return (
              <button
                key={tab.section}
                type="button"
                onClick={() => handleSectionSelect(tab.section)}
                aria-label={tab.label}
                className={cn(
                  'relative flex flex-col items-center justify-center touch-target min-w-[64px] py-1.5',
                  'transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2',
                  'focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white'
                )}
              >
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-section-primary"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={cn('transition-colors duration-200', isActive ? 'text-section-primary' : 'text-slate-400')}
                  aria-hidden="true"
                />
                <span className={cn('mt-1 text-[10px] font-medium transition-colors duration-200', isActive ? 'text-section-primary' : 'text-slate-500')}>
                  {tab.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => handleRoutePush(profileTab.href)}
            aria-label={t(profileTab.labelKey)}
            className={cn(
              'relative flex flex-col items-center justify-center touch-target min-w-[64px] py-1.5',
              'transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2',
              'focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white'
            )}
          >
            {isProfileActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-section-primary"
                aria-hidden="true"
              />
            )}
            <ProfileIcon
              size={22}
              strokeWidth={isProfileActive ? 2.5 : 2}
              className={cn(
                'transition-colors duration-200',
                isProfileActive ? 'text-section-primary' : 'text-slate-400'
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'mt-1 text-[10px] font-medium transition-colors duration-200',
                isProfileActive ? 'text-section-primary' : 'text-slate-500'
              )}
            >
              {t(profileTab.labelKey)}
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
}

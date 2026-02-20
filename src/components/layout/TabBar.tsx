'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, Search, Calendar, User } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';

interface TabItem {
  labelKey: 'tab.home' | 'tab.search' | 'tab.bookings' | 'tab.profile';
  href: string;
  icon: typeof Home;
}

const tabs: TabItem[] = [
  { labelKey: 'tab.home', href: '/home', icon: Home },
  { labelKey: 'tab.search', href: '/search', icon: Search },
  { labelKey: 'tab.bookings', href: '/bookings', icon: Calendar },
  { labelKey: 'tab.profile', href: '/profile', icon: User },
];

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const activeTab = useMemo(() => {
    return tabs.find((tab) => pathname?.startsWith(tab.href))?.href || '/home';
  }, [pathname]);

  const handleTabPress = (href: string) => {
    router.push(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/10"
      role="tablist"
      aria-label={t('tab.mainNavigation')}
    >
      {/* Safe area padding at bottom */}
      <div className="pb-safe">
        <div className="flex items-center justify-around px-2 h-16">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.href;
            const Icon = tab.icon;

            return (
              <button
                key={tab.href}
                onClick={() => handleTabPress(tab.href)}
                role="tab"
                aria-selected={isActive}
                aria-label={t(tab.labelKey)}
                className={`
                  relative flex flex-col items-center justify-center
                  touch-target min-w-[64px] py-2 px-3
                  transition-all duration-200 ease-out
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
                  focus-visible:ring-offset-background-dark
                  ${isActive ? 'focus-visible:ring-[var(--section-primary)]' : 'focus-visible:ring-white/50'}
                `}
              >
                {/* Active indicator */}
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-section-primary"
                    aria-hidden="true"
                  />
                )}

                {/* Icon */}
                <Icon
                  size={24}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={`
                    transition-colors duration-200
                    ${isActive ? 'text-section-primary' : 'text-text-tertiary'}
                  `}
                  aria-hidden="true"
                />

                {/* Label */}
                <span
                  className={`
                    text-xs mt-1 font-medium transition-colors duration-200
                    ${isActive ? 'text-section-primary' : 'text-text-tertiary'}
                  `}
                >
                  {t(tab.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

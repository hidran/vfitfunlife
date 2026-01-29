'use client';

import { useSection, type Section } from '@/contexts/SectionContext';
import { Bell, User } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';

interface SectionOption {
  value: Section;
  label: string;
}

const sections: SectionOption[] = [
  { value: 'fit', label: 'FIT' },
  { value: 'fun', label: 'FUN' },
  { value: 'life', label: 'LIFE' },
];

interface HeaderProps {
  notificationCount?: number;
  userAvatarUrl?: string | null;
}

export function Header({ notificationCount = 0, userAvatarUrl }: HeaderProps) {
  const { section, setSection } = useSection();

  const handleSectionChange = useCallback(
    (newSection: Section) => {
      setSection(newSection);
    },
    [setSection]
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
      {/* Safe area padding at top */}
      <div className="pt-safe">
        <div className="flex items-center justify-between px-4 h-14">
          {/* User Avatar */}
          <Link
            href="/profile"
            className="touch-target flex items-center justify-center rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background-dark"
            aria-label="Go to profile"
          >
            {userAvatarUrl ? (
              <img
                src={userAvatarUrl}
                alt="Profile"
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-background-tertiary flex items-center justify-center">
                <User size={20} className="text-text-secondary" />
              </div>
            )}
          </Link>

          {/* Section Switcher - Segmented Control */}
          <div
            className="flex items-center bg-white/10 rounded-full p-1"
            role="tablist"
            aria-label="App sections"
          >
            {sections.map((sectionOption) => {
              const isActive = section === sectionOption.value;

              return (
                <button
                  key={sectionOption.value}
                  onClick={() => handleSectionChange(sectionOption.value)}
                  role="tab"
                  aria-selected={isActive}
                  className={`
                    relative px-4 py-2 text-sm font-semibold rounded-full
                    transition-all duration-200 ease-out
                    touch-target min-h-[36px]
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50
                    ${
                      isActive
                        ? 'text-background-dark'
                        : 'text-text-inverse/70 hover:text-text-inverse'
                    }
                  `}
                >
                  {/* Active background */}
                  {isActive && (
                    <span
                      className="absolute inset-0 bg-section-gradient rounded-full"
                      style={{ zIndex: -1 }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">{sectionOption.label}</span>
                </button>
              );
            })}
          </div>

          {/* Notification Bell */}
          <Link
            href="/notifications"
            className="touch-target flex items-center justify-center relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--section-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background-dark rounded-full"
            aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ''}`}
          >
            <Bell size={24} className="text-text-inverse" />

            {/* Notification Badge */}
            {notificationCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-error text-white text-xs font-bold rounded-full"
                aria-hidden="true"
              >
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

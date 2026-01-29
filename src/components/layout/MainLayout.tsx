'use client';

import { useSection } from '@/contexts/SectionContext';
import { Header } from './Header';
import { TabBar } from './TabBar';
import type { ReactNode } from 'react';

interface MainLayoutProps {
  children: ReactNode;
  notificationCount?: number;
  userAvatarUrl?: string | null;
}

export function MainLayout({
  children,
  notificationCount = 0,
  userAvatarUrl,
}: MainLayoutProps) {
  const { section } = useSection();

  return (
    <div
      data-section={section}
      className="min-h-screen bg-background-dark flex flex-col"
    >
      {/* Header */}
      <Header
        notificationCount={notificationCount}
        userAvatarUrl={userAvatarUrl}
      />

      {/* Main Content Area */}
      <main
        className="flex-1 pt-safe pb-safe"
        style={{
          // Account for fixed header (56px + safe area) and tab bar (64px + safe area)
          paddingTop: 'calc(var(--safe-area-inset-top) + 56px)',
          paddingBottom: 'calc(var(--safe-area-inset-bottom) + 80px)',
        }}
      >
        {children}
      </main>

      {/* Tab Bar */}
      <TabBar />
    </div>
  );
}

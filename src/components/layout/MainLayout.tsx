'use client';

import { useSection } from '@/contexts/SectionContext';
import { Header } from './Header';
import { SideDrawer } from './SideDrawer';
import { TabBar } from './TabBar';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';

interface MainLayoutProps {
  children: ReactNode;
  notificationCount?: number;
  userAvatarUrl?: string | null;
  userName?: string;
  userEmail?: string;
  pointsBalance?: number;
  walletBalance?: number;
  isProfessionalMode?: boolean;
}

export function MainLayout({
  children,
  notificationCount = 0,
  userAvatarUrl,
  userName,
  userEmail,
  pointsBalance = 0,
  walletBalance = 0,
  isProfessionalMode = false,
}: MainLayoutProps) {
  const { section } = useSection();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  return (
    <div
      data-section={section}
      className="min-h-screen bg-background-dark flex flex-col"
    >
      {/* Header */}
      <Header
        onMenuClick={openDrawer}
        notificationCount={notificationCount}
        userAvatarUrl={userAvatarUrl}
      />

      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        userName={userName}
        userEmail={userEmail}
        userAvatarUrl={userAvatarUrl}
        pointsBalance={pointsBalance}
        walletBalance={walletBalance}
        isProfessionalMode={isProfessionalMode}
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

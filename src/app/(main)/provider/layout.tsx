'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  ChefHat,
  Users,
  Wallet,
  Settings,
  Briefcase,
  Menu,
  MessageCircle,
  X,
  Clock,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useManagedVenues } from '@/hooks/useManagedVenues';
import { useAuthStore } from '@/stores/authStore';
import { isProviderAreaUser } from '@/lib/providerStatus';
import type { MessageKey } from '@/i18n/messages';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { AssistantMenuButton } from '@/components/assistant/AssistantMenuButton';
import { DashboardModeSwitch } from '@/components/layout/DashboardModeSwitch';
import { Spinner } from '@/components/ui/Spinner';

interface ProviderLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS: { icon: LucideIcon; labelKey: MessageKey; href: string }[] = [
  { icon: LayoutDashboard, labelKey: 'provider.layout.nav.dashboard', href: '/provider/dashboard' },
  { icon: CalendarDays, labelKey: 'provider.layout.nav.schedule', href: '/provider/schedule' },
  { icon: Calendar, labelKey: 'provider.layout.nav.bookings', href: '/provider/bookings' },
  { icon: Users, labelKey: 'provider.layout.nav.clients', href: '/provider/clients' },
  // The inbox lives outside /provider (clients and trainers share it); the sidebar links to it.
  { icon: MessageCircle, labelKey: 'provider.layout.nav.messages', href: '/chat' },
  // Next to `clients`: the library exists to be shared with them (spec §9).
  { icon: ChefHat, labelKey: 'provider.layout.nav.recipes', href: '/provider/recipes' },
  { icon: Wallet, labelKey: 'provider.layout.nav.earnings', href: '/provider/earnings' },
  { icon: Briefcase, labelKey: 'provider.layout.nav.services', href: '/provider/services' },
  { icon: Users, labelKey: 'courses.manage', href: '/provider/courses' },
  { icon: Settings, labelKey: 'provider.layout.nav.availability', href: '/provider/availability' },
  { icon: MapPin, labelKey: 'provider.layout.nav.location', href: '/provider/location' },
];

export default function ProviderLayout({ children }: ProviderLayoutProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const status = user?.providerStatus ?? 'none';
  const { venues, isLoading: venuesLoading } = useManagedVenues();
  const isProvider = isProviderAreaUser(user);
  // Someone who only owns or staffs a venue manages its courses and nothing else here.
  const venueOnly = !isProvider && venues.length > 0;
  const coursesHref = venues.length > 0 ? `/provider/courses?venue=${encodeURIComponent(venues[0].id)}` : '/provider/courses';
  const navItems = venueOnly
    ? [{ icon: Users, labelKey: 'courses.manage' as MessageKey, href: coursesHref }]
    : NAV_ITEMS;
  const outsideCourses = venueOnly && !pathname.startsWith('/provider/courses');
  // Never redirect while the venue lookup runs: a manager would be bounced before it answers.
  const canAccess = isProvider || venueOnly;
  const blocked = isInitialized && !!user && !canAccess && !venuesLoading;

  useEffect(() => {
    if (blocked) router.replace('/profile');
    else if (isInitialized && user && outsideCourses) router.replace(coursesHref);
  }, [blocked, isInitialized, user, outsideCourses, coursesHref, router]);

  if (blocked) {
    return null; // redirecting
  }
  // A plain customer must not see provider pages while the lookup decides whether they manage a venue.
  if (isInitialized && !!user && !isProvider && venuesLoading) {
    return <div className="flex min-h-[calc(100vh-64px)] items-center justify-center"><Spinner size="md" /></div>;
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 bg-background-dark border-r border-hairline">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-content">{t('provider.layout.title')}</h2>
          <p className="text-sm text-content-muted">{t('provider.layout.subtitle')}</p>
          <DashboardModeSwitch mode="professional" className="mt-4" />
        </div>

        <nav className="px-3 pb-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const base = item.href.split('?')[0];
            const isActive = pathname === base || pathname.startsWith(`${base}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1',
                  isActive
                    ? 'bg-section-gradient text-white'
                    : 'text-content-muted hover:bg-surface-2 hover:text-content'
                )}
                >
                  <Icon className="w-5 h-5" />
                {t(item.labelKey)}
              </Link>
            );
          })}
          <AssistantMenuButton className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1 text-content-muted hover:bg-surface-2 hover:text-content" />
        </nav>

        <div
          className="mx-3 mb-6 flex flex-wrap items-center gap-2 border-t border-hairline px-1 pt-4"
          data-testid="provider-nav-preferences"
        >
          <LanguageSwitcher variant="menu" />
          <ThemeToggle compact />
        </div>
      </aside>

      {/* Mobile Header. Sticky, not fixed: a fixed bar at top-16 sat on top of whatever the
          app layout renders above this page (the email-verification banner), hiding it. */}
      <div className="lg:hidden sticky top-16 z-30 bg-background-dark border-b border-hairline">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold text-content">{t('provider.layout.title')}</h2>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-surface-2"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-content" />
            ) : (
              <Menu className="w-6 h-6 text-content" />
            )}
          </button>
        </div>
        <DashboardModeSwitch mode="professional" className="mx-4 mb-3" />

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <nav className="px-3 pb-4 border-t border-hairline">
            {navItems.map((item) => {
              const Icon = item.icon;
              const base = item.href.split('?')[0];
              const isActive = pathname === base || pathname.startsWith(`${base}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1',
                    isActive
                      ? 'bg-section-gradient text-white'
                      : 'text-content-muted hover:bg-surface-2 hover:text-content'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
            <AssistantMenuButton
              onOpen={() => setMobileMenuOpen(false)}
              className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1 text-content-muted hover:bg-surface-2 hover:text-content"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-hairline px-1 pt-3">
              <LanguageSwitcher variant="menu" />
              <ThemeToggle compact />
            </div>
          </nav>
        )}
      </div>

      {/* Main Content — a div: MainLayout already provides the page's one <main> landmark */}
      <div className="min-w-0 flex-1 lg:ml-0">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {status === 'pending' && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4">
              <Clock className="w-5 h-5 shrink-0 text-[#F59E0B] light:text-amber-700" />
              <p className="min-w-0 text-sm text-content/80 break-words">
                {/* A company waits for its tax id to be checked (it is never auto-approved). */}
                {t(user?.providerType === 'business' ? 'provider.banner.pendingBusiness' : 'provider.banner.pending')}
              </p>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

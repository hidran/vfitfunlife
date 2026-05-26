'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  Users,
  Wallet,
  Settings,
  Briefcase,
  Menu,
  X,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import { canAccessProviderArea } from '@/lib/providerStatus';
import type { MessageKey } from '@/i18n/messages';

interface ProviderLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS: { icon: LucideIcon; labelKey: MessageKey; href: string }[] = [
  { icon: LayoutDashboard, labelKey: 'provider.layout.nav.dashboard', href: '/provider/dashboard' },
  { icon: CalendarDays, labelKey: 'provider.layout.nav.schedule', href: '/provider/schedule' },
  { icon: Calendar, labelKey: 'provider.layout.nav.bookings', href: '/provider/bookings' },
  { icon: Users, labelKey: 'provider.layout.nav.clients', href: '/provider/clients' },
  { icon: Wallet, labelKey: 'provider.layout.nav.earnings', href: '/provider/earnings' },
  { icon: Briefcase, labelKey: 'provider.layout.nav.services', href: '/provider/services' },
  { icon: Settings, labelKey: 'provider.layout.nav.availability', href: '/provider/availability' },
];

export default function ProviderLayout({ children }: ProviderLayoutProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const status = user?.providerStatus ?? 'none';

  useEffect(() => {
    if (isInitialized && user && !canAccessProviderArea(status)) {
      router.replace('/profile');
    }
  }, [isInitialized, user, status, router]);

  if (isInitialized && user && !canAccessProviderArea(status)) {
    return null; // redirecting
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 bg-[#1A1D29] border-r border-white/5">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-white">{t('provider.layout.title')}</h2>
          <p className="text-sm text-gray-400">{t('provider.layout.subtitle')}</p>
        </div>

        <nav className="px-3 pb-6">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1',
                  isActive
                    ? 'bg-section-gradient text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                )}
                >
                  <Icon className="w-5 h-5" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-16 left-0 right-0 z-30 bg-[#1A1D29] border-b border-white/5">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold text-white">{t('provider.layout.title')}</h2>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-white/10"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-white" />
            ) : (
              <Menu className="w-6 h-6 text-white" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <nav className="px-3 pb-4 border-t border-white/5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1',
                    isActive
                      ? 'bg-section-gradient text-white'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {status === 'pending' && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4">
              <Clock className="w-5 h-5 text-[#F59E0B]" />
              <p className="text-sm text-white/80">
                Profilo in revisione — sarai visibile dopo l'approvazione.
              </p>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

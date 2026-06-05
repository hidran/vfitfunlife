'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Calendar,
  CircleDollarSign,
  Dumbbell,
  Facebook,
  Gift,
  HelpCircle,
  Home,
  Instagram,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Tv,
  User,
  X,
  Youtube,
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useSection, type Section } from '@/contexts/SectionContext';
import { cn, formatPrice } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/authStore';
import { useShallow } from 'zustand/react/shallow';
import type { MessageKey } from '@/i18n/messages';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  userEmail?: string;
  userAvatarUrl?: string | null;
  pointsBalance?: number;
  walletBalance?: number;
  isProfessionalMode?: boolean;
}

interface DrawerLinkItem {
  href: string;
  icon: typeof Home;
  labelKey: MessageKey;
}

interface DrawerAccountItem extends DrawerLinkItem {
  value?: string;
  section?: Section;
}

const drawerLinks: DrawerLinkItem[] = [
  { href: '/home', icon: Home, labelKey: 'common.home' },
  { href: '/search', icon: Search, labelKey: 'common.search' },
  { href: '/bookings', icon: Calendar, labelKey: 'common.bookings' },
  { href: '/notifications', icon: Bell, labelKey: 'common.notifications' },
  { href: '/profile', icon: User, labelKey: 'common.profile' },
  { href: '/help', icon: HelpCircle, labelKey: 'common.helpCenter' },
];

const sectionPills: Array<{ section: Section; label: string; icon: typeof Dumbbell }> = [
  { section: 'fit', label: 'VFit', icon: Dumbbell },
  { section: 'fun', label: 'VFun', icon: Sparkles },
  { section: 'life', label: 'VLife', icon: Tv },
];

const categoryLinks: Array<{ href: string; labelKey: MessageKey; section?: Section }> = [
  { href: '/fit/gyms', labelKey: 'drawer.category.gyms', section: 'fit' },
  { href: '/fit/home-training', labelKey: 'drawer.category.home', section: 'fit' },
  { href: '/fit/classes', labelKey: 'drawer.category.outdoor', section: 'fit' },
  { href: '/fit/virtual', labelKey: 'drawer.category.virtual', section: 'fit' },
];

function isSectionRoute(pathname: string | null, section: Section): boolean {
  if (!pathname) return false;

  if (section === 'fit') {
    return pathname.startsWith('/fit');
  }

  if (section === 'fun') {
    return pathname.startsWith('/fun');
  }

  return pathname.startsWith('/life');
}

export function SideDrawer({
  isOpen,
  onClose,
  userName,
  userEmail,
  userAvatarUrl,
  pointsBalance = 0,
  walletBalance = 0,
  isProfessionalMode = false,
}: SideDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { section, setSection } = useSection();
  const { t } = useI18n();
  const logout = useAuthStore((state) => state.logout);
  const isLoading = useAuthStore((state) => state.isLoading);
  const role = useAuthStore((state) => state.user?.role);
  const isStaff = role === 'admin' || role === 'superadmin';

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const accountItems = useMemo<DrawerAccountItem[]>(
    () => [
      {
        href: '/profile/payment',
        icon: CircleDollarSign,
        labelKey: 'profile.stats.balance',
        value: formatPrice(walletBalance),
      },
      {
        href: '/vip',
        icon: Star,
        labelKey: 'profile.stats.points',
        value: pointsBalance.toLocaleString(),
      },
      {
        href: '/referral',
        icon: Gift,
        labelKey: 'drawer.item.promo',
      },
      {
        href: '/home',
        icon: Trophy,
        labelKey: 'drawer.item.challenges',
        section: 'fit',
      },
      {
        href: '/feedback',
        icon: User,
        labelKey: 'profile.social.title',
      },
    ],
    [pointsBalance, walletBalance]
  );

  const handleNavigate = (href: string, nextSection?: Section) => {
    if (nextSection) {
      setSection(nextSection);
    }
    onClose();
    router.push(href);
  };

  const handleSectionChange = (nextSection: Section) => {
    setSection(nextSection);
    onClose();
    if (!pathname?.startsWith('/home')) {
      router.push('/home');
    }
  };

  const handleLogout = async () => {
    await logout();
    onClose();
    router.push('/auth/login');
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-[70] transition-all duration-300',
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        className={cn(
          'absolute inset-0 bg-black/40 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0'
        )}
        aria-label={t('auth.common.back')}
        onClick={onClose}
      />

      <aside
        className={cn(
          'absolute inset-y-0 left-0 w-[88%] max-w-sm bg-[#f4f5f8] shadow-2xl',
          'transform transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex h-full flex-col text-slate-800">
          <div className="border-b border-slate-200 p-5 pt-safe">
            <div className="flex items-start justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative">
                  <div className="rounded-full bg-gradient-to-r from-[#8A4FFF] to-[#FFA96B] p-[2px]">
                    <Avatar
                      name={userName || t('profile.defaultUser')}
                      src={userAvatarUrl || undefined}
                      size="lg"
                      className="border-2 border-white"
                    />
                  </div>
                  <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white bg-vlife-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold text-slate-900">
                    {userName || t('profile.defaultUser')}
                  </p>
                  <p className="truncate text-sm text-slate-500">{userEmail || ''}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="touch-target rounded-full text-slate-400 transition-colors hover:text-slate-600"
                aria-label={t('auth.common.back')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1">
              <div
                className={cn(
                  'rounded-lg py-2 text-center text-sm font-semibold transition-colors',
                  isProfessionalMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                )}
              >
                {t('profile.mode.professional')}
              </div>
              <div
                className={cn(
                  'rounded-lg py-2 text-center text-sm font-semibold transition-colors',
                  !isProfessionalMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                )}
              >
                {t('profile.mode.private')}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {isStaff && (
              <button
                type="button"
                onClick={() => handleNavigate('/admin')}
                className="mb-4 flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-[#8A4FFF] to-[#FFA96B] px-3 py-3 text-left shadow-sm transition-opacity hover:opacity-90"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <ShieldCheck className="h-4 w-4 text-white" />
                </div>
                <span className="flex-1 text-sm font-semibold text-white">{t('drawer.item.admin')}</span>
              </button>
            )}

            <div className="space-y-2">
              {accountItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.labelKey}
                    type="button"
                    onClick={() => handleNavigate(item.href, item.section)}
                    className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left shadow-sm transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                      <Icon className="h-4 w-4 text-slate-600" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-slate-700">{t(item.labelKey)}</span>
                    {item.value ? <span className="text-sm font-semibold text-[#8A4FFF]">{item.value}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                {t('drawer.section.categories')}
              </p>
              <h3 className="mt-2 text-lg font-bold text-slate-900">{t('drawer.category.vfit')}</h3>

              <div className="mt-3 grid grid-cols-2 gap-y-2">
                {categoryLinks.map((category) => (
                  <button
                    key={category.href}
                    type="button"
                    onClick={() => handleNavigate(category.href, category.section)}
                    className="flex items-center gap-2 text-left text-sm text-slate-600 transition-colors hover:text-slate-900"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8A4FFF]" />
                    {t(category.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="grid grid-cols-3 gap-2">
                {sectionPills.map((pill) => {
                  const Icon = pill.icon;
                  const isActive = section === pill.section || isSectionRoute(pathname, pill.section);

                  return (
                    <button
                      key={pill.section}
                      type="button"
                      onClick={() => handleSectionChange(pill.section)}
                      className={cn(
                        'rounded-xl px-2 py-2 text-xs font-semibold transition-all',
                        'flex flex-col items-center justify-center gap-1',
                        isActive
                          ? 'bg-section-gradient text-background-dark shadow-sm'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{pill.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <nav className="mt-4 space-y-2">
              {drawerLinks.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href || (item.href !== '/home' && pathname?.startsWith(`${item.href}/`));

                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => handleNavigate(item.href)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                      'flex items-center gap-3',
                      isActive
                        ? 'border-section-primary/40 bg-section-primary/10 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', isActive ? 'text-section-primary' : 'text-slate-500')} />
                    <span className="text-sm font-medium">{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white py-3 text-sm font-semibold text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              <span>{t('profile.logout.action')}</span>
            </button>

            <div className="mt-4 flex items-center justify-center gap-3 pb-2">
              <a
                href="https://www.facebook.com"
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-700"
                aria-label="Facebook"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="https://www.instagram.com"
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-700"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="https://www.youtube.com"
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-700"
                aria-label="YouTube"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  User,
  MapPin,
  CreditCard,
  Bell,
  HelpCircle,
  Settings,
  LogOut,
  ChevronRight,
  Star,
  Gift,
  Crown,
  Shield,
  Phone,
  Mail,
  Edit3,
  Briefcase,
  ExternalLink,
  Calendar,
  DollarSign,
  Clock,
  Award,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { 
  ProfilePhotoUploader, 
  SocialLinksEditor, 
  NotificationSettings,
  CertificationUpload,
  EducationHistory,
  PortfolioGallery,
  LanguagesSelector,
  CancellationPolicyEditor,
  BecomeProviderCard,
  ProfileGamificationCard,
  ProfileStatsCard,
  StreakCard,
  FamilyCard,
} from '@/components/profile';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { isProvider } from '@/lib/firebase/auth';
import { formatPrice } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

interface ProfileMenuItem {
  icon: typeof User;
  labelKey: MessageKey;
  subtitleKey?: MessageKey;
  accentClass?: string;
  href?: string;
  // When set, clicking scrolls to the element with this id on the current page
  // instead of navigating (used for the in-page "Become a provider" card).
  scrollTargetId?: string;
}

interface ProfileMenuSection {
  sectionKey: MessageKey;
  items: ProfileMenuItem[];
}

const menuItems: ProfileMenuSection[] = [
  {
    sectionKey: 'profile.menu.account',
    items: [
      {
        icon: User,
        labelKey: 'profile.menu.personalData',
        subtitleKey: 'profile.menu.subtitle.personalData',
        accentClass: 'text-success-DEFAULT',
        href: '/profile/edit',
      },
      {
        icon: Calendar,
        labelKey: 'profile.menu.myBookings',
        subtitleKey: 'profile.menu.subtitle.myBookings',
        accentClass: 'text-warning-DEFAULT',
        href: '/booking',
      },
      {
        icon: CreditCard,
        labelKey: 'profile.menu.paymentMethods',
        subtitleKey: 'profile.menu.subtitle.paymentMethods',
        accentClass: 'text-vfun-primary',
        href: '/profile/payment',
      },
      {
        icon: Settings,
        labelKey: 'profile.menu.settings',
        subtitleKey: 'profile.menu.subtitle.settings',
        accentClass: 'text-text-inverse',
        href: '/profile/settings',
      },
    ],
  },
  {
    sectionKey: 'profile.menu.preferences',
    items: [
      {
        icon: Bell,
        labelKey: 'profile.menu.notifications',
        subtitleKey: 'profile.menu.subtitle.notifications',
        accentClass: 'text-vfit-primary',
        href: '/profile/notifications',
      },
      {
        icon: MapPin,
        labelKey: 'profile.menu.addresses',
        subtitleKey: 'profile.menu.subtitle.addresses',
        accentClass: 'text-section-primary',
        href: '/profile/addresses',
      },
    ],
  },
  {
    sectionKey: 'profile.menu.support',
    items: [
      {
        icon: HelpCircle,
        labelKey: 'profile.menu.helpCenter',
        subtitleKey: 'profile.menu.subtitle.helpCenter',
        accentClass: 'text-info-DEFAULT',
        href: '/help',
      },
      {
        icon: Star,
        labelKey: 'profile.menu.rateApp',
        subtitleKey: 'profile.menu.subtitle.rateApp',
        accentClass: 'text-vip-gold',
        href: '/feedback',
      },
    ],
  },
];

export default function ProfilePage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, firebaseUser, logout, isLoading, refreshUserProfile } = useAuthStore();

  const visibleSections = useMemo<ProfileMenuSection[]>(() => {
    const role = user?.role;
    if (role === 'admin' || role === 'superadmin') {
      const adminSection: ProfileMenuSection = {
        sectionKey: 'profile.menu.admin',
        items: [
          {
            icon: Shield,
            labelKey: 'profile.menu.adminDashboard',
            subtitleKey: 'profile.menu.subtitle.adminDashboard',
            accentClass: 'text-vip-gold',
            href: '/admin',
          },
        ],
      };
      return [adminSection, ...menuItems];
    }
    if (role === 'customer') {
      const becomeProviderSection: ProfileMenuSection = {
        sectionKey: 'profile.menu.becomeProvider',
        items: [
          {
            icon: Briefcase,
            labelKey: 'profile.menu.startAsProvider',
            subtitleKey: 'profile.menu.subtitle.startAsProvider',
            accentClass: 'text-vfit-primary',
            scrollTargetId: 'become-provider',
          },
        ],
      };
      return [becomeProviderSection, ...menuItems];
    }
    return menuItems;
  }, [user?.role]);

  const [isProviderUser, setIsProviderUser] = useState(false);
  const [isCheckingProvider, setIsCheckingProvider] = useState(true);
  const [stats] = useState({
    totalEarnings: 0,
  });

  // A pending applicant is the one user whose cached profile goes stale under them: the
  // decision is taken elsewhere, by someone else, and the store only reloads the user
  // document on an auth state change. Without this, an approved provider goes on being told
  // their application is under review until they sign out and back in.
  useEffect(() => {
    if (user?.providerStatus === 'pending') void refreshUserProfile();
  }, [user?.providerStatus, refreshUserProfile]);

  // Check if user is a provider
  useEffect(() => {
    const checkProvider = async () => {
      if (user?.id) {
        const provider = await isProvider(user.id);
        setIsProviderUser(provider);
      }
      setIsCheckingProvider(false);
    };
    checkProvider();
  }, [user?.id]);

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  const handlePhotoUpdated = useCallback(async () => {
    await refreshUserProfile();
  }, [refreshUserProfile]);

  // Get user display info
  const displayName = user?.fullName || firebaseUser?.displayName || t('profile.defaultUser');
  const contactInfo = user?.phone || user?.email || firebaseUser?.phoneNumber || firebaseUser?.email || '';
  const walletBalance = user?.walletBalance || 0;
  const isVip = user?.isVip || false;
  const emailVerified = firebaseUser?.emailVerified || user?.emailVerified || false;
  const phoneVerified = user?.phoneVerified || false;
  const bio = user?.bio;
  const role = user?.role || 'customer';
  const hasProfessionalStatus = user?.providerStatus === 'pending' || user?.providerStatus === 'verified';
  const isProfessionalMode = role === 'provider' || isProviderUser || hasProfessionalStatus;

  // Provider profile data
  const providerProfile = user?.providerProfile;

  if (isLoading || isCheckingProvider) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-dark pb-20">
      {/* Profile Header */}
      <div className="p-4 pt-6">
        <div className="rounded-[28px] border border-hairline bg-gradient-to-b from-white/10 to-white/[0.03] p-5 shadow-[0_14px_40px_rgba(0,0,0,0.28)]">
          <div className="flex flex-col items-center">
            <ProfilePhotoUploader
              userId={user?.id || ''}
              currentPhotoUrl={user?.avatarUrl || firebaseUser?.photoURL}
              displayName={displayName}
              onPhotoUpdated={handlePhotoUpdated}
              size="xl"
              className="mb-3"
            />

            <div className="text-center">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <h1 className="text-2xl font-display font-bold text-text-inverse">
                  {displayName}
                </h1>
                {isVip && (
                  <span className="rounded-full bg-vip-gold/20 px-2 py-0.5 text-xs font-medium text-vip-gold">
                    {t('profile.badge.vip')}
                  </span>
                )}
                {isProviderUser && (
                  <span className="rounded-full bg-section-gradient px-2 py-0.5 text-xs font-medium text-white">
                    {t('profile.badge.provider')}
                  </span>
                )}
                {user?.providerStatus === 'pending' && (
                  <span className="rounded-full bg-warning-DEFAULT/20 px-2 py-0.5 text-xs font-medium text-warning-DEFAULT">
                    {t('provider.card.pending.title')}
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-text-secondary">
                {contactInfo || (isVip ? t('profile.badge.vip') : t('profile.defaultUser'))}
              </p>

              {bio && (
                <p className="mx-auto mt-2 max-w-xs text-xs text-text-tertiary">
                  {bio}
                </p>
              )}
            </div>

            <div className="mt-4 w-full max-w-[240px] rounded-full bg-surface-2 p-1">
              <div className="grid grid-cols-2 gap-1">
                <div
                  className={cn(
                    'rounded-full px-3 py-2 text-center text-sm font-semibold transition-colors',
                    isProfessionalMode
                      ? 'bg-vlife-primary text-background-dark shadow-[0_0_16px_rgba(0,230,118,0.32)]'
                      : 'text-text-tertiary'
                  )}
                >
                  {t('profile.mode.professional')}
                </div>
                <div
                  className={cn(
                    'rounded-full px-3 py-2 text-center text-sm font-semibold transition-colors',
                    !isProfessionalMode
                      ? 'bg-white text-text-primary'
                      : 'text-text-tertiary'
                  )}
                >
                  {t('profile.mode.private')}
                </div>
              </div>
            </div>

            {/* Contact & Verification Status */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {user?.email && (
                <div className="flex items-center gap-1 text-xs text-text-tertiary">
                  <Mail size={12} />
                  <span>{user.email}</span>
                  {emailVerified ? (
                    <span className="text-success-DEFAULT" title={t('profile.verification.emailVerifiedTitle')}>
                      <Shield size={10} />
                    </span>
                  ) : (
                    <span className="text-warning-DEFAULT" title={t('profile.verification.emailUnverifiedTitle')}>
                      {t('profile.verification.unverifiedShort')}
                    </span>
                  )}
                </div>
              )}
              {user?.phone && (
                <div className="flex items-center gap-1 text-xs text-text-tertiary">
                  <Phone size={12} />
                  <span>{user.phone}</span>
                  {phoneVerified ? (
                    <span className="text-success-DEFAULT" title={t('profile.verification.phoneVerifiedTitle')}>
                      <Shield size={10} />
                    </span>
                  ) : (
                    <span className="text-warning-DEFAULT" title={t('profile.verification.phoneUnverifiedTitle')}>
                      {t('profile.verification.unverifiedShort')}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/profile/edit')}
              >
                <Edit3 size={14} className="mr-1" />
                {t('profile.action.editProfile')}
              </Button>
              {isProviderUser && (
                <Button
                  variant="ghost"
                  size="sm"
                  // /provider/{id} is not a route and cannot be one under output:'export'.
                  // /book?providerId= is the real client-facing page — so this doubles as a
                  // preview of what clients see, services included.
                  onClick={() => router.push(`/book?providerId=${user?.id}`)}
                >
                  <ExternalLink size={14} className="mr-1" />
                  {t('profile.action.publicProfile')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Balance cards. Points live in ProfileGamificationCard, next to XP. */}
        <div className="grid grid-cols-2 gap-3 mt-4 mb-6">
          <div className="relative min-w-0 overflow-hidden rounded-2xl border border-hairline bg-surface bg-gradient-to-br from-warning-DEFAULT/15 to-transparent p-4">
            <div className="mb-1 flex items-center gap-1 text-warning-DEFAULT">
              <CreditCard size={14} aria-hidden />
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                {t('profile.stats.balance')}
              </p>
            </div>
            <p className="truncate text-xl font-bold tabular-nums text-text-inverse">{formatPrice(walletBalance)}</p>
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-2xl border border-hairline bg-surface bg-gradient-to-br from-vfun-primary/15 to-transparent p-4">
            <div className="mb-1 flex items-center gap-1 text-vfun-primary">
              <Award size={14} aria-hidden />
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                {isProviderUser ? t('profile.stats.earnings') : t('profile.stats.reviews')}
              </p>
            </div>
            <p className="truncate text-xl font-bold tabular-nums text-text-inverse">
              {isProviderUser ? formatPrice(stats.totalEarnings) : providerProfile?.reviewCount || 0}
            </p>
          </div>
        </div>

        {/* Provider Quick Stats */}
        {isProviderUser && providerProfile && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-section-gradient/10 border border-section-primary/20 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <Star className="text-section-primary" size={16} />
                <span className="text-2xl font-bold text-text-inverse">
                  {providerProfile.rating?.toFixed(1) || '0.0'}
                </span>
              </div>
              <p className="text-xs text-text-tertiary mt-1">{t('profile.provider.averageRating')}</p>
            </div>
            <div className="bg-section-gradient/10 border border-section-primary/20 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <Award className="text-section-primary" size={16} />
                <span className="text-2xl font-bold text-text-inverse">
                  {providerProfile.yearsOfExperience || 0}
                </span>
              </div>
              <p className="text-xs text-text-tertiary mt-1">{t('profile.provider.yearsExperience')}</p>
            </div>
          </div>
        )}

        {/* VIP Banner */}
        <button
          onClick={() => router.push('/vip')}
          className="w-full bg-gradient-to-r from-vip-gold/20 to-vip-gold/5 border border-vip-gold/30 rounded-2xl p-4 flex items-center gap-4 mb-4"
        >
          <div className="w-12 h-12 rounded-full bg-vip-gold/20 flex items-center justify-center">
            <Crown className="w-6 h-6 text-vip-gold" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-semibold text-vip-gold">
              {isVip ? t('profile.vip.isVipTitle') : t('profile.vip.ctaTitle')}
            </h3>
            <p className="text-sm text-text-secondary">
              {isVip ? t('profile.vip.isVipSubtitle') : t('profile.vip.ctaSubtitle')}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-vip-gold" />
        </button>

        {/* Gamification (Season 0): stacked on phones, side by side from md */}
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <ProfileGamificationCard />
          <ProfileStatsCard />
        </div>

        {/* Streak card (E2) */}
        <StreakCard className="mb-4" />

        {/* Family card (E4) */}
        <FamilyCard className="mb-4" />

        {/* Referral Banner */}
        <button
          onClick={() => router.push('/referral')}
          className="w-full bg-gradient-to-r from-vfit-primary/20 to-vfun-primary/20 border border-vfit-primary/30 rounded-2xl p-4 flex items-center gap-4 mb-6"
        >
          <div className="w-12 h-12 rounded-full bg-vfit-primary/20 flex items-center justify-center">
            <Gift className="w-6 h-6 text-vfit-primary" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-semibold text-text-inverse">{t('profile.referral.title')}</h3>
            <p className="text-sm text-text-secondary">{t('profile.referral.subtitle')}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-text-tertiary" />
        </button>

        {/* Become a Provider CTA */}
        <div id="become-provider" className="mt-4 scroll-mt-24">
          <BecomeProviderCard />
        </div>

        {/* Appearance / theme quick toggle */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface-2 p-4">
          <p className="font-semibold text-text-inverse">{t('settings.appearance')}</p>
          <ThemeToggle />
        </div>
      </div>

      {/* Profile Settings */}
      <div className="px-4 space-y-6">
        {/* Social Links */}
        {user?.id && (
          <div className="bg-background-secondary/5 rounded-xl p-4">
            <SocialLinksEditor
              userId={user.id}
              socialLinks={user.socialLinks}
              onUpdate={refreshUserProfile}
            />
          </div>
        )}

        {/* Notification Settings */}
        {user?.id && user.notificationSettings && (
          <div className="bg-background-secondary/5 rounded-xl p-4">
            <NotificationSettings
              userId={user.id}
              settings={user.notificationSettings}
              onUpdate={refreshUserProfile}
            />
          </div>
        )}

        {/* Provider Profile Section */}
        {isProviderUser && user?.id && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Briefcase className="text-section-primary" size={20} />
              <h2 className="text-lg font-semibold text-text-inverse">{t('profile.provider.sectionTitle')}</h2>
            </div>

            {/* Professional Bio */}
            {providerProfile?.professionalBio && (
              <div className="bg-background-secondary/5 rounded-xl p-4">
                <h3 className="text-sm font-medium text-text-tertiary mb-2">{t('profile.provider.about')}</h3>
                <p className="text-sm text-text-secondary">{providerProfile.professionalBio}</p>
              </div>
            )}


            {/* Languages Selector */}
            <div className="bg-background-secondary/5 rounded-xl p-4">
              <LanguagesSelector
                userId={user.id}
                languages={providerProfile?.languages || []}
                onUpdate={refreshUserProfile}
              />
            </div>

            {/* Years of Experience */}
            {providerProfile?.yearsOfExperience !== undefined && providerProfile.yearsOfExperience > 0 && (
              <div className="bg-background-secondary/5 rounded-xl p-4">
                <h3 className="text-sm font-medium text-text-tertiary mb-2">{t('profile.provider.experience')}</h3>
                <div className="flex items-center gap-2">
                  <Clock className="text-section-primary" size={18} />
                  <p className="text-sm text-text-inverse">
                    {providerProfile.yearsOfExperience}{' '}
                    {providerProfile.yearsOfExperience === 1
                      ? t('profile.provider.yearSingular')
                      : t('profile.provider.yearPlural')}{' '}
                    {t('profile.provider.experienceSuffix')}
                  </p>
                </div>
              </div>
            )}

            {/* Education */}
            <div className="bg-background-secondary/5 rounded-xl p-4">
              <EducationHistory
                userId={user.id}
                education={providerProfile?.education || []}
                onUpdate={refreshUserProfile}
              />
            </div>

            {/* Certifications */}
            <div className="bg-background-secondary/5 rounded-xl p-4">
              <CertificationUpload
                userId={user.id}
                certifications={providerProfile?.certifications || []}
                onUpdate={refreshUserProfile}
              />
            </div>

            {/* Portfolio Gallery */}
            <div className="bg-background-secondary/5 rounded-xl p-4">
              <PortfolioGallery
                userId={user.id}
                images={providerProfile?.portfolioImages || []}
                onUpdate={refreshUserProfile}
              />
            </div>

            {/* Weekly hours. This used to be an editor writing providerProfile.availabilitySchedule
                on the user document, plus a 7-day preview of it. Booking never read that field,
                so hours set here did nothing. It now links to the page that writes the
                schedule booking enforces (instructors/{uid}.availabilitySchedule). */}
            <button
              type="button"
              onClick={() => router.push('/provider/availability')}
              className="w-full bg-background-secondary/5 rounded-xl p-4 text-left hover:bg-background-secondary/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Calendar className="text-section-primary" size={20} />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-text-tertiary">{t('profile.provider.availabilityLink')}</h3>
                  <p className="text-sm text-text-secondary mt-0.5">{t('profile.provider.availabilityHint')}</p>
                </div>
                <ChevronRight className="text-text-tertiary" size={18} />
              </div>
            </button>

            {/* Services & pricing.
                This used to be an inline editor writing providerProfile.servicePricing on
                the user document — a third service store, read by nothing. The booking
                flow reads instructors/{uid}/services, so anything saved here was invisible
                to clients. It now links to the one page that writes the real collection. */}
            <button
              type="button"
              onClick={() => router.push('/provider/services')}
              className="w-full bg-background-secondary/5 rounded-xl p-4 text-left hover:bg-background-secondary/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="text-section-primary" size={20} />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-text-tertiary">{t('profile.provider.servicesAndPricing')}</h3>
                  <p className="text-sm text-text-secondary mt-0.5">{t('profile.provider.manageServicesHint')}</p>
                </div>
                <ChevronRight className="text-text-tertiary" size={18} />
              </div>
            </button>

            {/* License Number */}
            {providerProfile?.licenseNumber && (
              <div className="bg-background-secondary/5 rounded-xl p-4">
                <h3 className="text-sm font-medium text-text-tertiary mb-2">{t('profile.provider.license')}</h3>
                <p className="text-sm text-text-inverse font-mono">{providerProfile.licenseNumber}</p>
                {providerProfile.isVerified && (
                  <span className="inline-flex items-center gap-1 text-xs text-success-DEFAULT mt-1">
                    <Shield size={12} />
                    {t('profile.provider.verified')}
                  </span>
                )}
              </div>
            )}

            {/* Cancellation Policy */}
            <div className="bg-background-secondary/5 rounded-xl p-4">
              <CancellationPolicyEditor
                userId={user.id}
                policy={providerProfile?.cancellationPolicy || null}
                onUpdate={refreshUserProfile}
              />
            </div>

            {/* Reviews Section (Read-only) */}
            {providerProfile && (
              <div className="bg-background-secondary/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="text-section-primary" size={20} />
                  <h3 className="text-sm font-medium text-text-tertiary">{t('profile.stats.reviews')}</h3>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-text-inverse">
                      {providerProfile.rating?.toFixed(1) || '0.0'}
                    </span>
                    <div className="flex items-center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={16}
                          className={cn(
                            star <= Math.round(providerProfile.rating || 0)
                              ? 'text-vip-gold fill-vip-gold'
                              : 'text-text-tertiary'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-sm text-text-tertiary">
                    {t('profile.reviews.count', { count: providerProfile.reviewCount || 0 })}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => router.push(`/provider/${user.id}/reviews`)}
                >
                  {t('profile.reviews.viewAll')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Menu Sections */}
        {visibleSections.map((section) => (
          <div key={section.sectionKey}>
            <h3 className="mb-2 px-1 text-sm font-semibold uppercase tracking-[0.12em] text-text-tertiary">
              {t(section.sectionKey)}
            </h3>
            <div className="space-y-2">
              {section.items.map((item, index) => (
                <button
                  key={`${item.labelKey}-${index}`}
                  onClick={() => {
                    if (item.scrollTargetId) {
                      document
                        .getElementById(item.scrollTargetId)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else if (item.href) {
                      router.push(item.href);
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-2xl border border-hairline bg-surface-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-surface-2'
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
                    <item.icon className={cn('h-5 w-5', item.accentClass ?? 'text-text-secondary')} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-text-inverse">{t(item.labelKey)}</p>
                    {item.subtitleKey && (
                      <p className="truncate text-xs text-text-tertiary">{t(item.subtitleKey)}</p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-text-tertiary" />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 rounded-2xl border border-error-DEFAULT/25 p-4 text-error transition-colors hover:bg-error/10 disabled:opacity-50"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">{isLoading ? t('profile.logout.loading') : t('profile.logout.action')}</span>
        </button>
      </div>

      {/* App Version */}
      <p className="text-center text-xs text-text-tertiary mt-8 pb-4">
        {t('profile.appVersion')}
      </p>
    </div>
  );
}

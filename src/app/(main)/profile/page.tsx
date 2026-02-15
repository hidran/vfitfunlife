'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
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
  ServicePricingCard,
  AvailabilityCalendar,
  EducationHistory,
  PortfolioGallery,
  SpecialtiesSelector,
  LanguagesSelector,
  CancellationPolicyEditor,
} from '@/components/profile';
import { isProvider, updateProviderProfile } from '@/lib/firebase/auth';
import { ServicePricing, AvailabilitySchedule, ProviderProfile } from '@/types/firebase';
import { formatPrice } from '@/lib/utils';

const menuItems = [
  {
    section: 'Account',
    items: [
      { icon: User, label: 'Dati personali', href: '/profile/edit' },
      { icon: MapPin, label: 'I miei indirizzi', href: '/profile/addresses' },
      { icon: CreditCard, label: 'Metodi di pagamento', href: '/profile/payment' },
    ],
  },
  {
    section: 'Preferenze',
    items: [
      { icon: Bell, label: 'Notifiche', href: '/profile/notifications' },
      { icon: Settings, label: 'Impostazioni', href: '/profile/settings' },
    ],
  },
  {
    section: 'Supporto',
    items: [
      { icon: HelpCircle, label: 'Centro assistenza', href: '/help' },
      { icon: Star, label: "Valuta l'app", href: '/feedback' },
    ],
  },
];

// Available specialties for providers
const AVAILABLE_SPECIALTIES = [
  'Personal Training',
  'Yoga',
  'Pilates',
  'CrossFit',
  'Nutrizione',
  'Fisioterapia',
  'Massaggio',
  'Mental Coaching',
  'Group Fitness',
  'HIIT',
  'Strength Training',
  'Cardio',
  'Danza',
  'Arti Marziali',
  'Nuoto',
  'Spinning',
  'Boxe',
  'Functional Training',
];

export default function ProfilePage() {
  const router = useRouter();
  const { user, firebaseUser, logout, isLoading, refreshUserProfile } = useAuthStore();
  const [isProviderUser, setIsProviderUser] = useState(false);
  const [isCheckingProvider, setIsCheckingProvider] = useState(true);
  const [stats, setStats] = useState({
    totalBookings: 0,
    totalEarnings: 0,
    upcomingAppointments: 0,
  });

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
  const displayName = user?.fullName || firebaseUser?.displayName || 'Utente';
  const contactInfo = user?.phone || user?.email || firebaseUser?.phoneNumber || firebaseUser?.email || '';
  const pointsBalance = user?.pointsBalance || 0;
  const isVip = user?.isVip || false;
  const emailVerified = firebaseUser?.emailVerified || user?.emailVerified || false;
  const phoneVerified = user?.phoneVerified || false;
  const bio = user?.bio;
  const role = user?.role || 'customer';

  // Provider profile data
  const providerProfile = user?.providerProfile;

  const handleUpdateProviderProfile = async (data: Partial<ProviderProfile>) => {
    if (!user?.id) return;
    try {
      await updateProviderProfile(user.id, data);
      await refreshUserProfile();
    } catch (error) {
      console.error('Error updating provider profile:', error);
    }
  };

  const handleUpdateServices = async (services: ServicePricing[]) => {
    await handleUpdateProviderProfile({ servicePricing: services });
  };

  const handleUpdateAvailability = async (schedule: AvailabilitySchedule) => {
    await handleUpdateProviderProfile({ availabilitySchedule: schedule });
  };

  // Generate next 7 days availability preview
  const getAvailabilityPreview = () => {
    if (!providerProfile?.availabilitySchedule) return [];
    
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = new Date();
    const preview = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dayName = days[date.getDay()] as keyof AvailabilitySchedule;
      const daySchedule = providerProfile.availabilitySchedule[dayName];
      
      preview.push({
        date,
        dayName: days[date.getDay()],
        isAvailable: daySchedule?.isAvailable || false,
        slots: daySchedule?.slots || [],
      });
    }
    
    return preview;
  };

  const availabilityPreview = getAvailabilityPreview();

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
        {/* Photo and Basic Info */}
        <div className="flex flex-col items-center mb-6">
          <ProfilePhotoUploader
            userId={user?.id || ''}
            currentPhotoUrl={user?.avatarUrl || firebaseUser?.photoURL}
            displayName={displayName}
            onPhotoUpdated={handlePhotoUpdated}
            size="xl"
            className="mb-4"
          />
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl font-display font-bold text-text-inverse">
                {displayName}
              </h1>
              {isVip && (
                <span className="px-2 py-0.5 bg-vip-gold/20 text-vip-gold text-xs font-medium rounded-full">
                  VIP
                </span>
              )}
              {isProviderUser && (
                <span className="px-2 py-0.5 bg-section-gradient text-white text-xs font-medium rounded-full">
                  Provider
                </span>
              )}
            </div>
            
            {bio && (
              <p className="text-sm text-text-secondary mt-1 max-w-xs mx-auto">
                {bio}
              </p>
            )}
            
            {/* Contact & Verification Status */}
            <div className="flex items-center justify-center gap-3 mt-2 flex-wrap">
              {user?.email && (
                <div className="flex items-center gap-1 text-xs text-text-tertiary">
                  <Mail size={12} />
                  <span>{user.email}</span>
                  {emailVerified ? (
                    <span className="text-success-DEFAULT" title="Verificata">
                      <Shield size={10} />
                    </span>
                  ) : (
                    <span className="text-warning-DEFAULT" title="Non verificata">
                      (Non verif.)
                    </span>
                  )}
                </div>
              )}
              {user?.phone && (
                <div className="flex items-center gap-1 text-xs text-text-tertiary">
                  <Phone size={12} />
                  <span>{user.phone}</span>
                  {phoneVerified ? (
                    <span className="text-success-DEFAULT" title="Verificato">
                      <Shield size={10} />
                    </span>
                  ) : (
                    <span className="text-warning-DEFAULT" title="Non verificato">
                      (Non verif.)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/profile/edit')}
              >
                <Edit3 size={14} className="mr-1" />
                Modifica Profilo
              </Button>
              {isProviderUser && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/provider/${user?.id}`)}
                >
                  <ExternalLink size={14} className="mr-1" />
                  Profilo Pubblico
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-background-secondary/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-text-inverse">
              {isProviderUser ? stats.totalBookings : 0}
            </p>
            <p className="text-xs text-text-tertiary">
              {isProviderUser ? 'Prenotazioni' : 'Prenotazioni'}
            </p>
          </div>
          <div className="bg-background-secondary/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-vip-gold">{pointsBalance}</p>
            <p className="text-xs text-text-tertiary">Punti</p>
          </div>
          <div className="bg-background-secondary/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-text-inverse">
              {isProviderUser ? formatPrice(stats.totalEarnings) : providerProfile?.reviewCount || 0}
            </p>
            <p className="text-xs text-text-tertiary">
              {isProviderUser ? 'Guadagni' : 'Recensioni'}
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
              <p className="text-xs text-text-tertiary mt-1">Valutazione media</p>
            </div>
            <div className="bg-section-gradient/10 border border-section-primary/20 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <Award className="text-section-primary" size={16} />
                <span className="text-2xl font-bold text-text-inverse">
                  {providerProfile.yearsOfExperience || 0}
                </span>
              </div>
              <p className="text-xs text-text-tertiary mt-1">Anni di esperienza</p>
            </div>
          </div>
        )}

        {/* VIP Banner */}
        <button 
          onClick={() => router.push('/vip')}
          className="w-full bg-gradient-to-r from-vip-gold/20 to-vip-gold/5 border border-vip-gold/30 rounded-xl p-4 flex items-center gap-4 mb-6"
        >
          <div className="w-12 h-12 rounded-full bg-vip-gold/20 flex items-center justify-center">
            <Crown className="w-6 h-6 text-vip-gold" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-semibold text-vip-gold">
              {isVip ? 'Sei VIP!' : 'Diventa VIP'}
            </h3>
            <p className="text-sm text-text-secondary">
              {isVip ? 'Goditi i vantaggi esclusivi' : 'Sconti esclusivi e vantaggi'}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-vip-gold" />
        </button>

        {/* Referral Banner */}
        <button 
          onClick={() => router.push('/referral')}
          className="w-full bg-gradient-to-r from-vfit-primary/20 to-vfun-primary/20 border border-vfit-primary/30 rounded-xl p-4 flex items-center gap-4 mb-6"
        >
          <div className="w-12 h-12 rounded-full bg-vfit-primary/20 flex items-center justify-center">
            <Gift className="w-6 h-6 text-vfit-primary" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-semibold text-text-inverse">Invita un amico</h3>
            <p className="text-sm text-text-secondary">Guadagna 50 punti per ogni invito</p>
          </div>
          <ChevronRight className="w-5 h-5 text-text-tertiary" />
        </button>
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
              <h2 className="text-lg font-semibold text-text-inverse">Profilo Professionale</h2>
            </div>

            {/* Professional Bio */}
            {providerProfile?.professionalBio && (
              <div className="bg-background-secondary/5 rounded-xl p-4">
                <h3 className="text-sm font-medium text-text-tertiary mb-2">Chi sono</h3>
                <p className="text-sm text-text-secondary">{providerProfile.professionalBio}</p>
              </div>
            )}

            {/* Specialties Selector */}
            <div className="bg-background-secondary/5 rounded-xl p-4">
              <SpecialtiesSelector
                userId={user.id}
                specialties={providerProfile?.specialties || []}
                availableSpecialties={AVAILABLE_SPECIALTIES}
                onUpdate={refreshUserProfile}
              />
            </div>

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
                <h3 className="text-sm font-medium text-text-tertiary mb-2">Esperienza</h3>
                <div className="flex items-center gap-2">
                  <Clock className="text-section-primary" size={18} />
                  <p className="text-sm text-text-inverse">
                    {providerProfile.yearsOfExperience} {providerProfile.yearsOfExperience === 1 ? 'anno' : 'anni'} di esperienza professionale
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

            {/* Availability Preview */}
            <div className="bg-background-secondary/5 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="text-section-primary" size={20} />
                  <h3 className="text-sm font-medium text-text-tertiary">
                    Disponibilità (Prossimi 7 giorni)
                  </h3>
                </div>
              </div>
              
              {/* Next 7 Days Preview */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {availabilityPreview.map((day, index) => {
                  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
                  return (
                    <div
                      key={index}
                      className={cn(
                        'text-center p-2 rounded-lg',
                        day.isAvailable
                          ? 'bg-success-DEFAULT/10 border border-success-DEFAULT/30'
                          : 'bg-background-secondary/5 border border-white/5'
                      )}
                    >
                      <p className={cn(
                        'text-[10px] uppercase',
                        day.isAvailable ? 'text-success-DEFAULT' : 'text-text-tertiary'
                      )}>
                        {dayNames[day.date.getDay()]}
                      </p>
                      <p className="text-sm font-semibold text-text-inverse">
                        {day.date.getDate()}
                      </p>
                      {day.isAvailable && day.slots.length > 0 && (
                        <p className="text-[8px] text-text-tertiary mt-0.5">
                          {day.slots.length} slot
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <AvailabilityCalendar
                schedule={providerProfile?.availabilitySchedule || null}
                onUpdate={handleUpdateAvailability}
                isEditable={true}
              />
            </div>

            {/* Service Pricing */}
            <div className="bg-background-secondary/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="text-section-primary" size={20} />
                <h3 className="text-sm font-medium text-text-tertiary">Servizi e Prezzi</h3>
              </div>
              <ServicePricingCard
                services={providerProfile?.servicePricing || []}
                onAdd={(service) => {
                  const newServices = [...(providerProfile?.servicePricing || []), { ...service, id: Date.now().toString() }];
                  handleUpdateServices(newServices);
                }}
                onUpdate={(id, service) => {
                  const updatedServices = (providerProfile?.servicePricing || []).map((s) =>
                    s.id === id ? { ...service, id } : s
                  );
                  handleUpdateServices(updatedServices);
                }}
                onDelete={(id) => {
                  const filteredServices = (providerProfile?.servicePricing || []).filter((s) => s.id !== id);
                  handleUpdateServices(filteredServices);
                }}
                isEditable={true}
              />
            </div>

            {/* License Number */}
            {providerProfile?.licenseNumber && (
              <div className="bg-background-secondary/5 rounded-xl p-4">
                <h3 className="text-sm font-medium text-text-tertiary mb-2">Licenza Professionale</h3>
                <p className="text-sm text-text-inverse font-mono">{providerProfile.licenseNumber}</p>
                {providerProfile.isVerified && (
                  <span className="inline-flex items-center gap-1 text-xs text-success-DEFAULT mt-1">
                    <Shield size={12} />
                    Verificata
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
                  <h3 className="text-sm font-medium text-text-tertiary">Recensioni</h3>
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
                    {providerProfile.reviewCount || 0} recensioni
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => router.push(`/provider/${user.id}/reviews`)}
                >
                  Visualizza tutte le recensioni
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Menu Sections */}
        {menuItems.map((section) => (
          <div key={section.section}>
            <h3 className="text-sm font-medium text-text-tertiary mb-2 px-1">
              {section.section}
            </h3>
            <div className="bg-background-secondary/5 rounded-xl overflow-hidden">
              {section.items.map((item, index) => (
                <button
                  key={item.label}
                  onClick={() => router.push(item.href)}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 text-left hover:bg-background-secondary/10 transition-colors',
                    index !== section.items.length - 1 && 'border-b border-border/10'
                  )}
                >
                  <item.icon className="w-5 h-5 text-text-secondary" />
                  <span className="flex-1 text-text-inverse">{item.label}</span>
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
          className="w-full flex items-center gap-4 p-4 text-left text-error hover:bg-error/10 rounded-xl transition-colors disabled:opacity-50"
        >
          <LogOut className="w-5 h-5" />
          <span>{isLoading ? 'Uscita...' : 'Esci'}</span>
        </button>
      </div>

      {/* App Version */}
      <p className="text-center text-xs text-text-tertiary mt-8 pb-4">
        V Fitness v1.0.0
      </p>
    </div>
  );
}

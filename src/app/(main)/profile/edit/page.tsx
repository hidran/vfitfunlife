'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  User,
  Phone,
  Mail,
  Save,
  Loader2,
  Check,
  Shield,
  Calendar,
  Bell,
  Lock,
  Briefcase,
  AlertCircle,
  Camera,
  Globe,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn, toDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/Spinner';
import { ProfilePhotoUploader } from '@/components/profile';
import {
  updateUserProfile,
  verifyEmail,
  updateProviderProfile,
  isProvider,
  updateSocialLinks,
  updateNotificationSettings,
  updatePrivacySettings,
  verifyPhoneNumber,
} from '@/lib/firebase/auth';
import { SectionSelector } from '@/components/ui/section-selector';
import { Timestamp } from 'firebase/firestore';
import { SocialLinks, NotificationSettings as NotificationSettingsType, PrivacySettings } from '@/types/firebase';

// Form validation
interface FormErrors {
  fullName?: string;
  phone?: string;
  bio?: string;
  dateOfBirth?: string;
  professionalBio?: string;
  licenseNumber?: string;
  yearsOfExperience?: string;
}

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

const AVAILABLE_LANGUAGES = [
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];

type TabType = 'personal' | 'notifications' | 'privacy' | 'professional';

export default function EditProfilePage() {
  const router = useRouter();
  const { user, firebaseUser, refreshUserProfile, isLoading } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);
  const [isProviderUser, setIsProviderUser] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  // Personal Info State
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    bio: '',
    dateOfBirth: '',
    preferredSection: 'fit' as 'fit' | 'fun' | 'life',
  });

  // Social Links State
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({
    instagram: '',
    linkedin: '',
    website: '',
    facebook: '',
    twitter: '',
  });

  // Notification Settings State
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingsType>({
    email: true,
    push: true,
    sms: false,
    marketing: true,
    bookingReminders: true,
    promotions: true,
    newMessages: true,
  });

  // Privacy Settings State
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    profileVisible: true,
    bookingsVisible: false,
    showEmail: false,
    showPhone: false,
  });

  // Professional Info State
  const [professionalData, setProfessionalData] = useState({
    professionalBio: '',
    specialties: [] as string[],
    yearsOfExperience: 0,
    languages: [] as string[],
    licenseNumber: '',
    cancellationPolicy: '',
  });

  // Load user data
  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName || '',
        phone: user.phone || '',
        bio: user.bio || '',
        dateOfBirth: user.dateOfBirth
          ? new Date(toDate(user.dateOfBirth) || Date.now()).toISOString().split('T')[0]
          : '',
        preferredSection: user.preferredSection || 'fit',
      });

      if (user.socialLinks) {
        setSocialLinks(user.socialLinks);
      }

      if (user.notificationSettings) {
        setNotificationSettings(user.notificationSettings);
      }

      if (user.privacySettings) {
        setPrivacySettings(user.privacySettings);
      }

      if (user.providerProfile) {
        setProfessionalData({
          professionalBio: user.providerProfile.professionalBio || '',
          specialties: user.providerProfile.specialties || [],
          yearsOfExperience: user.providerProfile.yearsOfExperience || 0,
          languages: user.providerProfile.languages || [],
          licenseNumber: user.providerProfile.licenseNumber || '',
          cancellationPolicy: user.providerProfile.cancellationPolicy || '',
        });
      }
    }
  }, [user]);

  // Check if user is a provider
  useEffect(() => {
    const checkProvider = async () => {
      if (user?.id) {
        const provider = await isProvider(user.id);
        setIsProviderUser(provider);
      }
    };
    checkProvider();
  }, [user?.id]);

  // Auto-save indicator
  useEffect(() => {
    if (saveStatus === 'saved') {
      const timer = setTimeout(() => setSaveStatus('idle'), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  // Warn about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Il nome è obbligatorio';
    } else if (formData.fullName.length < 2) {
      newErrors.fullName = 'Il nome deve essere di almeno 2 caratteri';
    }

    if (formData.phone && !/^[\d\s\-\+\(\)]{8,}$/.test(formData.phone)) {
      newErrors.phone = 'Numero di telefono non valido';
    }

    if (formData.bio && formData.bio.length > 500) {
      newErrors.bio = 'La bio deve essere inferiore a 500 caratteri';
    }

    if (professionalData.professionalBio && professionalData.professionalBio.length > 1000) {
      newErrors.professionalBio = 'La bio professionale deve essere inferiore a 1000 caratteri';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateUrl = (url: string): boolean => {
    if (!url) return true;
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    const handlePattern = /^@?[\w.]+$/;
    return urlPattern.test(url) || handlePattern.test(url);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!validateForm()) return;

    setIsSaving(true);
    setSaveStatus('saving');

    try {
      // Update personal info
      await updateUserProfile(user.id, {
        fullName: formData.fullName,
        phone: formData.phone || undefined,
        bio: formData.bio || undefined,
        dateOfBirth: formData.dateOfBirth ? new Date(formData.dateOfBirth) : undefined,
        preferredSection: formData.preferredSection,
      });

      // Update social links
      await updateSocialLinks(user.id, socialLinks);

      // Update notification settings
      await updateNotificationSettings(user.id, notificationSettings);

      // Update privacy settings
      await updatePrivacySettings(user.id, privacySettings);

      // Update professional info if provider
      if (isProviderUser) {
        await updateProviderProfile(user.id, {
          professionalBio: professionalData.professionalBio || undefined,
          specialties: professionalData.specialties,
          yearsOfExperience: professionalData.yearsOfExperience,
          languages: professionalData.languages,
          licenseNumber: professionalData.licenseNumber || null,
          cancellationPolicy: professionalData.cancellationPolicy || null,
        });
      }

      await refreshUserProfile();
      setSaveStatus('saved');
      setHasUnsavedChanges(false);
    } catch (error: any) {
      console.error('Error saving profile:', error);
      // Check if it's a network/offline error
      if (error.code === 'unavailable' || error.code === 'network-request-failed' || error.message?.includes('offline')) {
        alert('Sei offline. Le modifiche verranno sincronizzate quando tornerai online.');
        // Still mark as saved since Firestore will queue the write
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
      } else {
        alert('Errore durante il salvataggio. Riprova più tardi.');
        setSaveStatus('error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (firebaseUser && !firebaseUser.emailVerified) {
      try {
        await verifyEmail(firebaseUser);
        alert('Email di verifica inviata! Controlla la tua casella di posta.');
      } catch (error) {
        console.error('Error sending verification email:', error);
        alert('Errore nell\'invio dell\'email. Riprova.');
      }
    }
  };

  const handleRequestPhoneVerification = async () => {
    if (!formData.phone) {
      alert('Inserisci prima un numero di telefono');
      return;
    }
    router.push('/profile/verify-phone');
  };

  const toggleSpecialty = (specialty: string) => {
    setProfessionalData((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(specialty)
        ? prev.specialties.filter((s) => s !== specialty)
        : [...prev.specialties, specialty],
    }));
    setHasUnsavedChanges(true);
  };

  const toggleLanguage = (code: string) => {
    setProfessionalData((prev) => ({
      ...prev,
      languages: prev.languages.includes(code)
        ? prev.languages.filter((l) => l !== code)
        : [...prev.languages, code],
    }));
    setHasUnsavedChanges(true);
  };

  const updateFormField = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const updateSocialLink = (platform: keyof SocialLinks, value: string) => {
    setSocialLinks((prev) => ({ ...prev, [platform]: value }));
    setHasUnsavedChanges(true);
  };

  const toggleNotification = (key: keyof NotificationSettingsType) => {
    setNotificationSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    setHasUnsavedChanges(true);
  };

  const togglePrivacy = (key: keyof PrivacySettings) => {
    setPrivacySettings((prev) => ({ ...prev, [key]: !prev[key] }));
    setHasUnsavedChanges(true);
  };

  const displayName = user?.fullName || firebaseUser?.displayName || 'Utente';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
    { key: 'personal', label: 'Personale', icon: User },
    { key: 'notifications', label: 'Notifiche', icon: Bell },
    { key: 'privacy', label: 'Privacy', icon: Lock },
    ...(isProviderUser ? [{ key: 'professional' as TabType, label: 'Professionale', icon: Briefcase }] : []),
  ];

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background-dark/95 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => {
              if (hasUnsavedChanges) {
                setShowUnsavedWarning(true);
              } else {
                router.back();
              }
            }}
            className="p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-inverse hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-text-inverse">Modifica Profilo</h1>
          <div className="w-10" />
        </div>

        {/* Tabs */}
        <div className="flex px-2 pb-2 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors relative whitespace-nowrap',
                activeTab === tab.key
                  ? 'text-text-inverse'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-section-gradient rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Unsaved Changes Warning Modal */}
      {showUnsavedWarning && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-background-dark border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-warning-DEFAULT/20 flex items-center justify-center">
                <AlertCircle className="text-warning-DEFAULT" size={20} />
              </div>
              <h3 className="text-lg font-semibold text-text-inverse">Modifiche non salvate</h3>
            </div>
            <p className="text-text-secondary mb-6">
              Hai delle modifiche non salvate. Vuoi salvare prima di uscire?
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => {
                  setShowUnsavedWarning(false);
                  setHasUnsavedChanges(false);
                  router.back();
                }}
              >
                Esci senza salvare
              </Button>
              <Button
                variant="primary"
                size="sm"
                fullWidth
                onClick={() => {
                  setShowUnsavedWarning(false);
                  handleSave();
                }}
              >
                Salva
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 pb-32">
        {/* Photo Upload */}
        <div className="flex justify-center mb-6">
          <ProfilePhotoUploader
            userId={user?.id || ''}
            currentPhotoUrl={user?.avatarUrl || firebaseUser?.photoURL}
            displayName={displayName}
            onPhotoUpdated={refreshUserProfile}
            size="xl"
          />
        </div>

        {/* Auto-save Status */}
        <div className="flex justify-end mb-4">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-text-tertiary">
              <Loader2 size={12} className="animate-spin" />
              Salvataggio...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
              <Check size={12} />
              Salvato
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-error">Errore di salvataggio</span>
          )}
          {hasUnsavedChanges && saveStatus === 'idle' && (
            <span className="text-xs text-warning-DEFAULT">Modifiche non salvate</span>
          )}
        </div>

        {/* Personal Tab */}
        {activeTab === 'personal' && (
          <div className="space-y-5">
            {/* Full Name */}
            <Input
              label="Nome Completo *"
              value={formData.fullName}
              onChange={(e) => updateFormField('fullName', e.target.value)}
              error={errors.fullName}
              leftIcon={<User size={18} />}
              placeholder="Inserisci il tuo nome completo"
            />

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Bio
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => updateFormField('bio', e.target.value)}
                placeholder="Parlaci di te..."
                rows={4}
                maxLength={500}
                className={cn(
                  'w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-text-tertiary',
                  'focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent',
                  'transition-all duration-200 resize-none',
                  errors.bio && 'border-error ring-1 ring-error'
                )}
              />
              <div className="flex justify-between mt-1">
                {errors.bio ? (
                  <span className="text-xs text-error">{errors.bio}</span>
                ) : null}
                <span className="text-xs text-text-tertiary ml-auto">
                  {formData.bio.length}/500
                </span>
              </div>
            </div>

            {/* Phone */}
            <div>
              <Input
                label="Numero di Telefono"
                type="tel"
                value={formData.phone}
                onChange={(e) => updateFormField('phone', e.target.value)}
                error={errors.phone}
                leftIcon={<Phone size={18} />}
                placeholder="+39 123 456 7890"
              />
              {formData.phone && !user?.phoneVerified && (
                <button
                  onClick={handleRequestPhoneVerification}
                  className="mt-2 text-xs text-section-primary hover:underline"
                >
                  Verifica numero di telefono →
                </button>
              )}
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Data di Nascita
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
                  <Calendar size={18} />
                </div>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => updateFormField('dateOfBirth', e.target.value)}
                  className="w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 pl-12 text-white focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent"
                />
              </div>
            </div>

            {/* Preferred Section */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Sezione Preferita
              </label>
              <SectionSelector
                value={formData.preferredSection}
                onChange={(value: 'fit' | 'fun' | 'life') => {
                  setFormData((prev) => ({ ...prev, preferredSection: value }));
                  setHasUnsavedChanges(true);
                }}
              />
            </div>

            {/* Social Links */}
            <div className="pt-4 border-t border-white/10">
              <h3 className="text-sm font-medium text-text-tertiary mb-3 flex items-center gap-2">
                <Globe size={16} />
                Link Social
              </h3>
              <div className="space-y-3">
                {[
                  { key: 'instagram', label: 'Instagram', placeholder: '@username' },
                  { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/username' },
                  { key: 'website', label: 'Sito Web', placeholder: 'tuosito.com' },
                  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/username' },
                  { key: 'twitter', label: 'Twitter/X', placeholder: '@username' },
                ].map((platform) => (
                  <Input
                    key={platform.key}
                    label={platform.label}
                    placeholder={platform.placeholder}
                    value={socialLinks[platform.key as keyof SocialLinks] || ''}
                    onChange={(e) => updateSocialLink(platform.key as keyof SocialLinks, e.target.value)}
                  />
                ))}
              </div>
            </div>

            {/* Email Verification Status */}
            <div className="p-4 rounded-xl bg-background-secondary/5 border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background-secondary/20 flex items-center justify-center">
                    <Mail size={18} className="text-text-tertiary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-inverse">Verifica Email</p>
                    <p className="text-xs text-text-tertiary">
                      {firebaseUser?.emailVerified ? 'Verificata' : 'Non verificata'}
                    </p>
                  </div>
                </div>
                {firebaseUser?.emailVerified ? (
                  <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
                    <Shield size={14} />
                    Verificata
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSendVerificationEmail}
                  >
                    Verifica
                  </Button>
                )}
              </div>
            </div>

            {/* Phone Verification Status */}
            <div className="p-4 rounded-xl bg-background-secondary/5 border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background-secondary/20 flex items-center justify-center">
                    <Phone size={18} className="text-text-tertiary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-inverse">Verifica Telefono</p>
                    <p className="text-xs text-text-tertiary">
                      {user?.phoneVerified ? 'Verificato' : 'Non verificato'}
                    </p>
                  </div>
                </div>
                {user?.phoneVerified ? (
                  <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
                    <Shield size={14} />
                    Verificato
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRequestPhoneVerification}
                  >
                    Verifica
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-tertiary mb-4">
              Preferenze Notifiche
            </h3>

            {[
              { key: 'email', label: 'Notifiche Email', description: 'Ricevi aggiornamenti via email' },
              { key: 'push', label: 'Notifiche Push', description: 'Ricevi notifiche sul dispositivo' },
              { key: 'sms', label: 'Notifiche SMS', description: 'Ricevi messaggi per aggiornamenti importanti' },
              { key: 'bookingReminders', label: 'Promemoria Prenotazioni', description: 'Ricevi promemoria per le prenotazioni imminenti' },
              { key: 'promotions', label: 'Promozioni e Offerte', description: 'Ricevi offerte speciali e sconti' },
              { key: 'newMessages', label: 'Nuovi Messaggi', description: 'Ricevi notifiche per i nuovi messaggi' },
              { key: 'marketing', label: 'Comunicazioni Marketing', description: 'Ricevi novità, aggiornamenti e email marketing' },
            ].map((option) => {
              const isEnabled = notificationSettings[option.key as keyof NotificationSettingsType];
              return (
                <button
                  key={option.key}
                  onClick={() => toggleNotification(option.key as keyof NotificationSettingsType)}
                  className={cn(
                    'w-full flex items-center gap-3 p-4 rounded-xl transition-all duration-200 text-left',
                    isEnabled
                      ? 'bg-section-gradient/10 border border-section-primary/30'
                      : 'bg-background-secondary/5 border border-transparent hover:bg-background-secondary/10'
                  )}
                >
                  <div className="flex-1">
                    <p className={cn(
                      'font-medium text-sm',
                      isEnabled ? 'text-text-inverse' : 'text-text-secondary'
                    )}>
                      {option.label}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {option.description}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'w-12 h-6 rounded-full relative transition-colors duration-200',
                      isEnabled ? 'bg-section-primary' : 'bg-background-secondary/30'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200',
                        isEnabled ? 'translate-x-7' : 'translate-x-1'
                      )}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-tertiary mb-4">
              Impostazioni Privacy
            </h3>

            {[
              { key: 'profileVisible', label: 'Profilo Pubblico', description: 'Rendi il tuo profilo visibile agli altri utenti' },
              { key: 'bookingsVisible', label: 'Mostra Prenotazioni', description: 'Mostra le tue prenotazioni sul profilo' },
              { key: 'showEmail', label: 'Mostra Email', description: 'Rendi visibile il tuo indirizzo email' },
              { key: 'showPhone', label: 'Mostra Telefono', description: 'Rendi visibile il tuo numero di telefono' },
            ].map((option) => {
              const isEnabled = privacySettings[option.key as keyof PrivacySettings];
              return (
                <button
                  key={option.key}
                  onClick={() => togglePrivacy(option.key as keyof PrivacySettings)}
                  className={cn(
                    'w-full flex items-center gap-3 p-4 rounded-xl transition-all duration-200 text-left',
                    isEnabled
                      ? 'bg-section-gradient/10 border border-section-primary/30'
                      : 'bg-background-secondary/5 border border-transparent hover:bg-background-secondary/10'
                  )}
                >
                  <div className="flex-1">
                    <p className={cn(
                      'font-medium text-sm',
                      isEnabled ? 'text-text-inverse' : 'text-text-secondary'
                    )}>
                      {option.label}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {option.description}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'w-12 h-6 rounded-full relative transition-colors duration-200',
                      isEnabled ? 'bg-section-primary' : 'bg-background-secondary/30'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200',
                        isEnabled ? 'translate-x-7' : 'translate-x-1'
                      )}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Professional Tab */}
        {activeTab === 'professional' && isProviderUser && (
          <div className="space-y-6">
            {/* Professional Bio */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Bio Professionale
              </label>
              <textarea
                value={professionalData.professionalBio}
                onChange={(e) => {
                  setProfessionalData((prev) => ({ ...prev, professionalBio: e.target.value }));
                  setHasUnsavedChanges(true);
                }}
                placeholder="Descrivi la tua esperienza professionale e il tuo approccio..."
                rows={5}
                maxLength={1000}
                className="w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent transition-all duration-200 resize-none"
              />
              <p className="text-xs text-text-tertiary mt-1 text-right">
                {professionalData.professionalBio.length}/1000
              </p>
            </div>

            {/* Years of Experience */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Anni di Esperienza
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={professionalData.yearsOfExperience}
                onChange={(e) => {
                  setProfessionalData((prev) => ({
                    ...prev,
                    yearsOfExperience: parseInt(e.target.value) || 0,
                  }));
                  setHasUnsavedChanges(true);
                }}
                className="w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent"
              />
            </div>

            {/* License Number */}
            <Input
              label="Numero Licenza Professionale"
              value={professionalData.licenseNumber}
              onChange={(e) => {
                setProfessionalData((prev) => ({ ...prev, licenseNumber: e.target.value }));
                setHasUnsavedChanges(true);
              }}
              placeholder="Inserisci il numero di licenza"
              leftIcon={<Shield size={18} />}
            />

            {/* Specialties */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Specializzazioni
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SPECIALTIES.map((specialty) => (
                  <button
                    key={specialty}
                    onClick={() => toggleSpecialty(specialty)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                      professionalData.specialties.includes(specialty)
                        ? 'bg-section-gradient text-white'
                        : 'bg-background-secondary/20 text-text-secondary hover:bg-background-secondary/30'
                    )}
                  >
                    {specialty}
                  </button>
                ))}
              </div>
            </div>

            {/* Languages */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Lingue Parlate
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_LANGUAGES.map((language) => (
                  <button
                    key={language.code}
                    onClick={() => toggleLanguage(language.code)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2',
                      professionalData.languages.includes(language.code)
                        ? 'bg-section-gradient text-white'
                        : 'bg-background-secondary/20 text-text-secondary hover:bg-background-secondary/30'
                    )}
                  >
                    <span>{language.flag}</span>
                    <span>{language.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cancellation Policy */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Politica di Cancellazione
              </label>
              <textarea
                value={professionalData.cancellationPolicy}
                onChange={(e) => {
                  setProfessionalData((prev) => ({ ...prev, cancellationPolicy: e.target.value }));
                  setHasUnsavedChanges(true);
                }}
                placeholder="Descrivi la tua politica di cancellazione..."
                rows={3}
                maxLength={500}
                className="w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent transition-all duration-200 resize-none"
              />
              <p className="text-xs text-text-tertiary mt-1 text-right">
                {professionalData.cancellationPolicy.length}/500
              </p>
            </div>

            {/* Provider Actions */}
            <div className="pt-4 border-t border-white/10">
              <Button
                variant="outline"
                fullWidth
                onClick={() => router.push('/profile')}
              >
                Gestisci Portfolio e Servizi
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Save Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background-dark via-background-dark to-transparent">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSave}
          isLoading={isSaving}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 size={20} className="animate-spin mr-2" />
              Salvataggio...
            </>
          ) : (
            <>
              <Save size={20} className="mr-2" />
              Salva Modifiche
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

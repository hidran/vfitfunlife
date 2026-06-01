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
  verifyPhoneNumber,
} from '@/lib/firebase/auth';
import { SectionSelector } from '@/components/ui/section-selector';
import { Timestamp } from 'firebase/firestore';
import { SocialLinks } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import { AvatarUploader } from '@/components/profile/AvatarUploader';
import { SocialLinksForm } from '@/components/profile/SocialLinksForm';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { PrivacySettingsForm } from '@/components/profile/PrivacySettingsForm';
import { defaultNotificationSettings, defaultPrivacySettings } from '@/types/profile';

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

const AVAILABLE_SPECIALTIES: { value: string; labelKey: MessageKey }[] = [
  { value: 'Personal Training', labelKey: 'profile.specialty.personalTraining' },
  { value: 'Yoga', labelKey: 'profile.specialty.yoga' },
  { value: 'Pilates', labelKey: 'profile.specialty.pilates' },
  { value: 'CrossFit', labelKey: 'profile.specialty.crossfit' },
  { value: 'Nutrizione', labelKey: 'profile.specialty.nutrition' },
  { value: 'Fisioterapia', labelKey: 'profile.specialty.physiotherapy' },
  { value: 'Massaggio', labelKey: 'profile.specialty.massage' },
  { value: 'Mental Coaching', labelKey: 'profile.specialty.mentalCoaching' },
  { value: 'Group Fitness', labelKey: 'profile.specialty.groupFitness' },
  { value: 'HIIT', labelKey: 'profile.specialty.hiit' },
  { value: 'Strength Training', labelKey: 'profile.specialty.strengthTraining' },
  { value: 'Cardio', labelKey: 'profile.specialty.cardio' },
  { value: 'Danza', labelKey: 'profile.specialty.dance' },
  { value: 'Arti Marziali', labelKey: 'profile.specialty.martialArts' },
  { value: 'Nuoto', labelKey: 'profile.specialty.swimming' },
  { value: 'Spinning', labelKey: 'profile.specialty.spinning' },
  { value: 'Boxe', labelKey: 'profile.specialty.boxing' },
  { value: 'Functional Training', labelKey: 'profile.specialty.functionalTraining' },
];

const AVAILABLE_LANGUAGES: { code: string; labelKey: MessageKey; flag: string }[] = [
  { code: 'it', labelKey: 'profile.languages.option.it', flag: '🇮🇹' },
  { code: 'en', labelKey: 'profile.languages.option.en', flag: '🇬🇧' },
  { code: 'es', labelKey: 'profile.languages.option.es', flag: '🇪🇸' },
  { code: 'fr', labelKey: 'profile.languages.option.fr', flag: '🇫🇷' },
  { code: 'de', labelKey: 'profile.languages.option.de', flag: '🇩🇪' },
  { code: 'pt', labelKey: 'profile.languages.option.pt', flag: '🇵🇹' },
  { code: 'ru', labelKey: 'profile.languages.option.ru', flag: '🇷🇺' },
  { code: 'zh', labelKey: 'profile.languages.option.zh', flag: '🇨🇳' },
  { code: 'ar', labelKey: 'profile.languages.option.ar', flag: '🇸🇦' },
];

const SOCIAL_PLATFORMS: {
  key: keyof SocialLinks;
  labelKey: MessageKey;
  placeholderKey: MessageKey;
}[] = [
  {
    key: 'instagram',
    labelKey: 'profile.social.platform.instagram',
    placeholderKey: 'profile.social.placeholder.instagram',
  },
  {
    key: 'linkedin',
    labelKey: 'profile.social.platform.linkedin',
    placeholderKey: 'profile.social.placeholder.linkedin',
  },
  {
    key: 'website',
    labelKey: 'profile.social.platform.website',
    placeholderKey: 'profile.social.placeholder.website',
  },
  {
    key: 'facebook',
    labelKey: 'profile.social.platform.facebook',
    placeholderKey: 'profile.social.placeholder.facebook',
  },
  {
    key: 'twitter',
    labelKey: 'profile.social.platform.twitter',
    placeholderKey: 'profile.social.placeholder.twitter',
  },
];

type TabType = 'personal' | 'professional';

export default function EditProfilePage() {
  const router = useRouter();
  const { t } = useI18n();
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
      newErrors.fullName = t('profile.edit.validation.fullNameRequired');
    } else if (formData.fullName.length < 2) {
      newErrors.fullName = t('profile.edit.validation.fullNameMinLength');
    }

    if (formData.phone && !/^[\d\s\-\+\(\)]{8,}$/.test(formData.phone)) {
      newErrors.phone = t('profile.edit.validation.phoneInvalid');
    }

    if (formData.bio && formData.bio.length > 500) {
      newErrors.bio = t('profile.edit.validation.bioMax');
    }

    if (professionalData.professionalBio && professionalData.professionalBio.length > 1000) {
      newErrors.professionalBio = t('profile.edit.validation.professionalBioMax');
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
        alert(t('profile.edit.alert.offlineSync'));
        // Still mark as saved since Firestore will queue the write
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
      } else {
        alert(t('profile.edit.alert.saveError'));
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
        alert(t('profile.edit.alert.verificationEmailSent'));
      } catch (error) {
        console.error('Error sending verification email:', error);
        alert(t('profile.edit.alert.verificationEmailError'));
      }
    }
  };

  const handleRequestPhoneVerification = async () => {
    if (!formData.phone) {
      alert(t('profile.edit.alert.phoneRequired'));
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

  const displayName = user?.fullName || firebaseUser?.displayName || t('profile.defaultUser');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const tabs: { key: TabType; labelKey: MessageKey; icon: React.ElementType }[] = [
    { key: 'personal', labelKey: 'profile.edit.tab.personal', icon: User },
    ...(isProviderUser
      ? [{ key: 'professional' as TabType, labelKey: 'profile.edit.tab.professional' as MessageKey, icon: Briefcase }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background-dark/95 backdrop-blur-sm border-b border-hairline">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => {
              if (hasUnsavedChanges) {
                setShowUnsavedWarning(true);
              } else {
                router.back();
              }
            }}
            className="p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-inverse hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-text-inverse">{t('profile.edit.title')}</h1>
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
              {t(tab.labelKey)}
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
          <div className="bg-background-dark border border-hairline rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-warning-DEFAULT/20 flex items-center justify-center">
                <AlertCircle className="text-warning-DEFAULT" size={20} />
              </div>
              <h3 className="text-lg font-semibold text-text-inverse">{t('profile.edit.unsaved.title')}</h3>
            </div>
            <p className="text-text-secondary mb-6">
              {t('profile.edit.unsaved.description')}
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
                {t('profile.edit.unsaved.exitWithoutSaving')}
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
                {t('common.save')}
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
              {t('profile.edit.saveStatus.saving')}
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
              <Check size={12} />
              {t('profile.edit.saveStatus.saved')}
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-error">{t('profile.edit.saveStatus.error')}</span>
          )}
          {hasUnsavedChanges && saveStatus === 'idle' && (
            <span className="text-xs text-warning-DEFAULT">{t('profile.edit.saveStatus.unsaved')}</span>
          )}
        </div>

        {/* Personal Tab */}
        {activeTab === 'personal' && (
          <div className="space-y-5">
            {/* Full Name */}
            <Input
              label={t('profile.edit.fullNameLabel')}
              value={formData.fullName}
              onChange={(e) => updateFormField('fullName', e.target.value)}
              error={errors.fullName}
              leftIcon={<User size={18} />}
              placeholder={t('profile.edit.fullNamePlaceholder')}
            />

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.edit.bioLabel')}
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => updateFormField('bio', e.target.value)}
                placeholder={t('profile.edit.bioPlaceholder')}
                rows={4}
                maxLength={500}
                className={cn(
                  'w-full bg-[#2A2D3A] border border-hairline rounded-xl px-4 py-3 text-content placeholder:text-text-tertiary',
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
                label={t('profile.edit.phoneLabel')}
                type="tel"
                value={formData.phone}
                onChange={(e) => updateFormField('phone', e.target.value)}
                error={errors.phone}
                leftIcon={<Phone size={18} />}
                placeholder={t('profile.edit.phonePlaceholder')}
              />
              {formData.phone && !user?.phoneVerified && (
                <button
                  onClick={handleRequestPhoneVerification}
                  className="mt-2 text-xs text-section-primary hover:underline"
                >
                  {t('profile.edit.verifyPhoneAction')}
                </button>
              )}
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.edit.dateOfBirthLabel')}
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
                  <Calendar size={18} />
                </div>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => updateFormField('dateOfBirth', e.target.value)}
                  className="w-full bg-[#2A2D3A] border border-hairline rounded-xl px-4 py-3 pl-12 text-content focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent"
                />
              </div>
            </div>

            {/* Preferred Section */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.edit.preferredSectionLabel')}
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
            <div className="pt-4 border-t border-hairline">
              <h3 className="text-sm font-medium text-text-tertiary mb-3 flex items-center gap-2">
                <Globe size={16} />
                {t('profile.social.title')}
              </h3>
              <div className="space-y-3">
                {SOCIAL_PLATFORMS.map((platform) => (
                  <Input
                    key={platform.key}
                    label={t(platform.labelKey)}
                    placeholder={t(platform.placeholderKey)}
                    value={socialLinks[platform.key] || ''}
                    onChange={(e) => updateSocialLink(platform.key, e.target.value)}
                  />
                ))}
              </div>
            </div>

            {/* Email Verification Status */}
            <div className="p-4 rounded-xl bg-background-secondary/5 border border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background-secondary/20 flex items-center justify-center">
                    <Mail size={18} className="text-text-tertiary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-inverse">{t('profile.edit.emailVerificationTitle')}</p>
                    <p className="text-xs text-text-tertiary">
                      {firebaseUser?.emailVerified
                        ? t('profile.verification.emailVerifiedTitle')
                        : t('profile.verification.emailUnverifiedTitle')}
                    </p>
                  </div>
                </div>
                {firebaseUser?.emailVerified ? (
                  <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
                    <Shield size={14} />
                    {t('profile.edit.verification.verified')}
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSendVerificationEmail}
                  >
                    {t('profile.edit.verification.verify')}
                  </Button>
                )}
              </div>
            </div>

            {/* Phone Verification Status */}
            <div className="p-4 rounded-xl bg-background-secondary/5 border border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background-secondary/20 flex items-center justify-center">
                    <Phone size={18} className="text-text-tertiary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-inverse">{t('profile.edit.phoneVerificationTitle')}</p>
                    <p className="text-xs text-text-tertiary">
                      {user?.phoneVerified
                        ? t('profile.verification.phoneVerifiedTitle')
                        : t('profile.verification.phoneUnverifiedTitle')}
                    </p>
                  </div>
                </div>
                {user?.phoneVerified ? (
                  <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
                    <Shield size={14} />
                    {t('profile.edit.verification.verified')}
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRequestPhoneVerification}
                  >
                    {t('profile.edit.verification.verify')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Professional Tab */}
        {activeTab === 'professional' && isProviderUser && (
          <div className="space-y-6">
            {/* Professional Bio */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.edit.professionalBioLabel')}
              </label>
              <textarea
                value={professionalData.professionalBio}
                onChange={(e) => {
                  setProfessionalData((prev) => ({ ...prev, professionalBio: e.target.value }));
                  setHasUnsavedChanges(true);
                }}
                placeholder={t('profile.edit.professionalBioPlaceholder')}
                rows={5}
                maxLength={1000}
                className="w-full bg-[#2A2D3A] border border-hairline rounded-xl px-4 py-3 text-content placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent transition-all duration-200 resize-none"
              />
              <p className="text-xs text-text-tertiary mt-1 text-right">
                {professionalData.professionalBio.length}/1000
              </p>
            </div>

            {/* Years of Experience */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.edit.yearsOfExperienceLabel')}
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
                className="w-full bg-[#2A2D3A] border border-hairline rounded-xl px-4 py-3 text-content focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent"
              />
            </div>

            {/* License Number */}
            <Input
              label={t('profile.edit.licenseNumberLabel')}
              value={professionalData.licenseNumber}
              onChange={(e) => {
                setProfessionalData((prev) => ({ ...prev, licenseNumber: e.target.value }));
                setHasUnsavedChanges(true);
              }}
              placeholder={t('profile.edit.licenseNumberPlaceholder')}
              leftIcon={<Shield size={18} />}
            />

            {/* Specialties */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.edit.specialtiesLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SPECIALTIES.map((specialty) => (
                  <button
                    key={specialty.value}
                    onClick={() => toggleSpecialty(specialty.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                      professionalData.specialties.includes(specialty.value)
                        ? 'bg-section-gradient text-white'
                        : 'bg-background-secondary/20 text-text-secondary hover:bg-background-secondary/30'
                    )}
                  >
                    {t(specialty.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Languages */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.edit.languagesLabel')}
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
                    <span>{t(language.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cancellation Policy */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.edit.cancellationPolicyLabel')}
              </label>
              <textarea
                value={professionalData.cancellationPolicy}
                onChange={(e) => {
                  setProfessionalData((prev) => ({ ...prev, cancellationPolicy: e.target.value }));
                  setHasUnsavedChanges(true);
                }}
                placeholder={t('profile.edit.cancellationPolicyPlaceholder')}
                rows={3}
                maxLength={500}
                className="w-full bg-[#2A2D3A] border border-hairline rounded-xl px-4 py-3 text-content placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent transition-all duration-200 resize-none"
              />
              <p className="text-xs text-text-tertiary mt-1 text-right">
                {professionalData.cancellationPolicy.length}/500
              </p>
            </div>

            {/* Provider Actions */}
            <div className="pt-4 border-t border-hairline">
              <Button
                variant="outline"
                fullWidth
                onClick={() => router.push('/profile')}
              >
                {t('profile.edit.managePortfolioAndServices')}
              </Button>
            </div>
          </div>
        )}

        {user && (
          <>
            <section id="avatar" className="mt-8 space-y-3">
              <h2 className="text-lg font-semibold">{t('profile.settings.avatar.sectionTitle')}</h2>
              <AvatarUploader currentUrl={user.avatarUrl ?? null} uid={user.uid} />
            </section>

            <section id="social" className="mt-8 space-y-3">
              <h2 className="text-lg font-semibold">{t('profile.settings.social.sectionTitle')}</h2>
              <SocialLinksForm initial={(user as any).socialLinks ?? {}} />
            </section>

            <section id="notifications" className="mt-8 space-y-3">
              <h2 className="text-lg font-semibold">{t('profile.settings.notifications.sectionTitle')}</h2>
              <NotificationSettingsForm initial={(user as any).notificationSettings ?? defaultNotificationSettings} />
            </section>

            <section id="privacy" className="mt-8 space-y-3">
              <h2 className="text-lg font-semibold">{t('profile.settings.privacy.sectionTitle')}</h2>
              <PrivacySettingsForm initial={(user as any).privacySettings ?? defaultPrivacySettings} />
            </section>
          </>
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
              {t('profile.edit.saveStatus.saving')}
            </>
          ) : (
            <>
              <Save size={20} className="mr-2" />
              {t('profile.edit.saveChanges')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

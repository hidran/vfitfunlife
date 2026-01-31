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
  Lock,
  Eye,
  EyeOff,
  Calendar,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/Spinner';
import { ProfilePhotoUploader } from '@/components/profile';
import {
  updateUserProfile,
  verifyEmail,
  updateProviderProfile,
  isProvider,
} from '@/lib/firebase/auth';
import { SectionSelector } from '@/components/ui/section-selector';
import { Timestamp } from 'firebase/firestore';

// Form validation
interface FormErrors {
  fullName?: string;
  phone?: string;
  bio?: string;
  dateOfBirth?: string;
}

const AVAILABLE_SPECIALTIES = [
  'Personal Training',
  'Yoga',
  'Pilates',
  'CrossFit',
  'Nutrition',
  'Physical Therapy',
  'Massage Therapy',
  'Mental Coaching',
  'Group Fitness',
  'HIIT',
  'Strength Training',
  'Cardio',
  'Dance Fitness',
  'Martial Arts',
  'Swimming',
];

const AVAILABLE_LANGUAGES = [
  'Italian',
  'English',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Russian',
  'Chinese',
  'Arabic',
];

export default function EditProfilePage() {
  const router = useRouter();
  const { user, firebaseUser, refreshUserProfile, isLoading } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);
  const [isProviderUser, setIsProviderUser] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<'personal' | 'professional'>('personal');

  // Personal Info State
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    bio: '',
    dateOfBirth: '',
    preferredSection: 'fit' as 'fit' | 'fun' | 'life',
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
          ? new Date(user.dateOfBirth.toDate()).toISOString().split('T')[0]
          : '',
        preferredSection: user.preferredSection || 'fit',
      });

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

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (formData.fullName.length < 2) {
      newErrors.fullName = 'Name must be at least 2 characters';
    }

    if (formData.phone && !/^\+?[\d\s-()]{8,}$/.test(formData.phone)) {
      newErrors.phone = 'Invalid phone number';
    }

    if (formData.bio && formData.bio.length > 500) {
      newErrors.bio = 'Bio must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (firebaseUser && !firebaseUser.emailVerified) {
      try {
        const { verifyEmail } = await import('@/lib/firebase/auth');
        await verifyEmail(firebaseUser);
        alert('Verification email sent! Please check your inbox.');
      } catch (error) {
        console.error('Error sending verification email:', error);
        alert('Failed to send verification email. Please try again.');
      }
    }
  };

  const toggleSpecialty = (specialty: string) => {
    setProfessionalData((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(specialty)
        ? prev.specialties.filter((s) => s !== specialty)
        : [...prev.specialties, specialty],
    }));
  };

  const toggleLanguage = (language: string) => {
    setProfessionalData((prev) => ({
      ...prev,
      languages: prev.languages.includes(language)
        ? prev.languages.filter((l) => l !== language)
        : [...prev.languages, language],
    }));
  };

  const displayName = user?.fullName || firebaseUser?.displayName || 'Utente';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background-dark/95 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-inverse hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-text-inverse">Edit Profile</h1>
          <div className="w-10" />
        </div>

        {/* Tabs */}
        {isProviderUser && (
          <div className="flex px-4 pb-2">
            <button
              onClick={() => setActiveTab('personal')}
              className={cn(
                'flex-1 py-2 text-sm font-medium transition-colors relative',
                activeTab === 'personal'
                  ? 'text-text-inverse'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              Personal Info
              {activeTab === 'personal' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-section-gradient" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('professional')}
              className={cn(
                'flex-1 py-2 text-sm font-medium transition-colors relative',
                activeTab === 'professional'
                  ? 'text-text-inverse'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              Professional
              {activeTab === 'professional' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-section-gradient" />
              )}
            </button>
          </div>
        )}
      </div>

      <div className="p-4 pb-24">
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
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
              <Check size={12} />
              Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-error">Save failed</span>
          )}
        </div>

        {activeTab === 'personal' ? (
          /* Personal Info Form */
          <div className="space-y-5">
            {/* Full Name */}
            <Input
              label="Full Name"
              value={formData.fullName}
              onChange={(e) => {
                setFormData({ ...formData, fullName: e.target.value });
                if (errors.fullName) setErrors({ ...errors, fullName: undefined });
              }}
              error={errors.fullName}
              leftIcon={<User size={18} />}
              placeholder="Enter your full name"
            />

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Bio
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => {
                  setFormData({ ...formData, bio: e.target.value });
                  if (errors.bio) setErrors({ ...errors, bio: undefined });
                }}
                placeholder="Tell us about yourself..."
                rows={4}
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
            <Input
              label="Phone Number"
              type="tel"
              value={formData.phone}
              onChange={(e) => {
                setFormData({ ...formData, phone: e.target.value });
                if (errors.phone) setErrors({ ...errors, phone: undefined });
              }}
              error={errors.phone}
              leftIcon={<Phone size={18} />}
              placeholder="+39 123 456 7890"
            />

            {/* Date of Birth */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Date of Birth
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
                  <Calendar size={18} />
                </div>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className="w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 pl-12 text-white focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent"
                />
              </div>
            </div>

            {/* Preferred Section */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Preferred Section
              </label>
              <SectionSelector
                value={formData.preferredSection}
                onChange={(value: 'fit' | 'fun' | 'life') => setFormData({ ...formData, preferredSection: value })}
              />
            </div>

            {/* Email Verification Status */}
            <div className="p-4 rounded-xl bg-background-secondary/5 border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background-secondary/20 flex items-center justify-center">
                    <Mail size={18} className="text-text-tertiary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-inverse">Email Verification</p>
                    <p className="text-xs text-text-tertiary">
                      {firebaseUser?.emailVerified ? 'Verified' : 'Not verified'}
                    </p>
                  </div>
                </div>
                {firebaseUser?.emailVerified ? (
                  <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
                    <Shield size={14} />
                    Verified
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSendVerificationEmail}
                  >
                    Verify
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
                    <p className="text-sm font-medium text-text-inverse">Phone Verification</p>
                    <p className="text-xs text-text-tertiary">
                      {user?.phoneVerified ? 'Verified' : 'Not verified'}
                    </p>
                  </div>
                </div>
                {user?.phoneVerified ? (
                  <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
                    <Shield size={14} />
                    Verified
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/profile/verify-phone')}
                  >
                    Verify
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Professional Info Form */
          <div className="space-y-5">
            {/* Professional Bio */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Professional Bio
              </label>
              <textarea
                value={professionalData.professionalBio}
                onChange={(e) =>
                  setProfessionalData({ ...professionalData, professionalBio: e.target.value })
                }
                placeholder="Describe your professional experience and approach..."
                rows={5}
                className="w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent transition-all duration-200 resize-none"
              />
              <p className="text-xs text-text-tertiary mt-1 text-right">
                {professionalData.professionalBio.length}/1000
              </p>
            </div>

            {/* Years of Experience */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Years of Experience
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={professionalData.yearsOfExperience}
                onChange={(e) =>
                  setProfessionalData({
                    ...professionalData,
                    yearsOfExperience: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent"
              />
            </div>

            {/* License Number */}
            <Input
              label="Professional License Number"
              value={professionalData.licenseNumber}
              onChange={(e) =>
                setProfessionalData({ ...professionalData, licenseNumber: e.target.value })
              }
              placeholder="Enter your license number"
              leftIcon={<Shield size={18} />}
            />

            {/* Specialties */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Specialties
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
                Languages Spoken
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_LANGUAGES.map((language) => (
                  <button
                    key={language}
                    onClick={() => toggleLanguage(language)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                      professionalData.languages.includes(language)
                        ? 'bg-section-gradient text-white'
                        : 'bg-background-secondary/20 text-text-secondary hover:bg-background-secondary/30'
                    )}
                  >
                    {language}
                  </button>
                ))}
              </div>
            </div>

            {/* Cancellation Policy */}
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                Cancellation Policy
              </label>
              <textarea
                value={professionalData.cancellationPolicy}
                onChange={(e) =>
                  setProfessionalData({ ...professionalData, cancellationPolicy: e.target.value })
                }
                placeholder="Describe your cancellation policy..."
                rows={3}
                className="w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent transition-all duration-200 resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Floating Save Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background-dark to-transparent">
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
              Saving...
            </>
          ) : (
            <>
              <Save size={20} className="mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/Spinner';
import { Camera, Calendar, User, Mail, Lock, ChevronLeft } from 'lucide-react';
import { completeRegistration } from '@/lib/firebase/auth';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { SERVICE_CATEGORIES } from '@/lib/serviceCategories';
import { submitProviderApplication } from '@/lib/firebase/providerApplication';

const SECTIONS = [
  { id: 'fit' as const, label: 'VFit', color: 'from-vfit-primary to-vfit-secondary' },
  { id: 'fun' as const, label: 'VFun', color: 'from-vfun-primary to-vfun-secondary' },
  { id: 'life' as const, label: 'VLife', color: 'from-vlife-primary to-vlife-secondary' },
];

type RegistrationMethod = 'social' | 'email' | null;

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { firebaseUser, refreshUserProfile, registerWithEmail, clearError, error: storeError } = useAuthStore();

  const [registrationMethod, setRegistrationMethod] = useState<RegistrationMethod>(
    firebaseUser ? 'social' : null
  );
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(firebaseUser?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [preferredSection, setPreferredSection] = useState<'fit' | 'fun' | 'life'>('fit');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [wantsProvider, setWantsProvider] = useState(false);
  const [providerCategory, setProviderCategory] = useState('');

  const handleSocialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError(t('auth.register.error.fullNameRequired'));
      return;
    }

    if (!acceptTerms) {
      setError(t('auth.register.error.acceptTerms'));
      return;
    }

    if (!firebaseUser) {
      setError(t('auth.register.error.userNotAuthenticated'));
      return;
    }

    setIsLoading(true);

    try {
      await completeRegistration(firebaseUser.uid, {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        preferredSection,
      });

      if (wantsProvider) {
        if (!providerCategory) {
          setError('Seleziona il tipo di servizio che offri.');
          setIsLoading(false);
          return;
        }
        await submitProviderApplication(firebaseUser.uid, {
          fullName,
          categoryName: providerCategory,
        });
      }

      // Refresh user profile in store
      await refreshUserProfile();

      // Navigate to home
      router.push('/home');
    } catch (err) {
      console.error('Registration error:', err);
      setError(t('auth.register.error.generic'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    clearError();

    // Validation
    if (!fullName.trim()) {
      setError(t('auth.register.error.fullNameRequired'));
      return;
    }

    if (!email.trim()) {
      setError(t('auth.register.error.emailRequired'));
      return;
    }

    if (!password || password.length < 6) {
      setError(t('auth.register.error.passwordMinLength'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.register.error.passwordMismatch'));
      return;
    }

    if (!acceptTerms) {
      setError(t('auth.register.error.acceptTerms'));
      return;
    }

    setIsLoading(true);

    try {
      // Register with email/password
      await registerWithEmail(email.trim(), password, fullName.trim());
      
      // Navigate to permissions or home
      router.push('/auth/permissions');
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(storeError || t('auth.register.error.generic'));
    } finally {
      setIsLoading(false);
    }
  };

  // Method Selection Screen
  if (!registrationMethod && !firebaseUser) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
        {/* Header */}
        <div className="px-6 pt-12 pb-6">
          <button
            onClick={() => router.push('/auth/login')}
            className="flex items-center gap-2 text-text-secondary hover:text-text-inverse transition-colors mb-6"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">{t('auth.common.backToLogin')}</span>
          </button>
          <h1 className="text-3xl font-bold text-white mb-2">{t('auth.register.methodSelection.title')}</h1>
          <p className="text-text-secondary">
            {t('auth.register.methodSelection.subtitle')}
          </p>
        </div>

        {/* Options */}
        <div className="flex-1 px-6 pb-8">
          <div className="space-y-4 max-w-md mx-auto">
            <button
              onClick={() => setRegistrationMethod('email')}
              className={cn(
                'w-full flex items-center gap-4 p-5 rounded-2xl border transition-all',
                'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
              )}
            >
              <div className="h-14 w-14 rounded-xl bg-section-primary/20 flex items-center justify-center">
                <Mail className="h-7 w-7 text-section-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-text-inverse text-lg">{t('auth.register.method.email.title')}</p>
                <p className="text-sm text-text-tertiary">{t('auth.register.method.email.subtitle')}</p>
              </div>
            </button>

            <button
              onClick={() => router.push('/auth/login')}
              className={cn(
                'w-full flex items-center gap-4 p-5 rounded-2xl border transition-all',
                'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
              )}
            >
              <div className="h-14 w-14 rounded-xl bg-white/10 flex items-center justify-center">
                <svg className="h-7 w-7" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div className="text-left">
                <p className="font-semibold text-text-inverse text-lg">{t('auth.register.method.google.title')}</p>
                <p className="text-sm text-text-tertiary">{t('auth.register.method.google.subtitle')}</p>
              </div>
            </button>

            <button
              onClick={() => router.push('/auth/login')}
              className={cn(
                'w-full flex items-center gap-4 p-5 rounded-2xl border transition-all',
                'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
              )}
            >
              <div className="h-14 w-14 rounded-xl bg-white/10 flex items-center justify-center">
                <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.74 1.18 0 2.21-1.21 3.72-1.06 1.4.12 2.69.74 3.51 1.86-3.12 1.87-2.38 5.98.22 7.13-.57 1.5-1.31 2.99-2.53 4.3zM12.03 7.25c-.15-2.55 2.11-4.61 4.65-4.75.26 2.77-2.36 5.26-4.65 4.75z"/>
                </svg>
              </div>
              <div className="text-left">
                <p className="font-semibold text-text-inverse text-lg">{t('auth.register.method.apple.title')}</p>
                <p className="text-sm text-text-tertiary">{t('auth.register.method.apple.subtitle')}</p>
              </div>
            </button>

            <button
              onClick={() => router.push('/auth/login')}
              className={cn(
                'w-full flex items-center gap-4 p-5 rounded-2xl border transition-all',
                'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
              )}
            >
              <div className="h-14 w-14 rounded-xl bg-green-500/20 flex items-center justify-center">
                <svg className="h-7 w-7 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <div className="text-left">
                <p className="font-semibold text-text-inverse text-lg">{t('auth.register.method.phone.title')}</p>
                <p className="text-sm text-text-tertiary">{t('auth.register.method.phone.subtitle')}</p>
              </div>
            </button>
          </div>

          <div className="mt-8 text-center">
            <p className="text-text-secondary text-sm">
              {t('auth.register.alreadyHaveAccount')}{' '}
              <Link href="/auth/login" className="font-semibold text-primary hover:underline">
                {t('auth.common.login')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Email Registration Form
  if (registrationMethod === 'email' || !firebaseUser) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
        {/* Header */}
        <div className="px-6 pt-8 pb-6">
          <button
            onClick={() => {
              setRegistrationMethod(null);
              clearError();
            }}
            className="flex items-center gap-2 text-text-secondary hover:text-text-inverse transition-colors mb-6"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">{t('auth.common.back')}</span>
          </button>
          <h1 className="text-3xl font-bold text-white mb-2">{t('auth.register.emailForm.title')}</h1>
          <p className="text-text-secondary">
            {t('auth.register.emailForm.subtitle')}
          </p>
        </div>

        {/* Form */}
        <div className="flex-1 px-6 pb-8 overflow-y-auto">
          <form onSubmit={handleEmailSubmit} className="space-y-6 max-w-md mx-auto">
            {/* Error Message */}
            {(error || storeError) && (
              <div className={cn(
                "p-4 border rounded-lg",
                (error || storeError)?.includes('not enabled')
                  ? "bg-yellow-500/10 border-yellow-500/20"
                  : "bg-red-500/10 border-red-500/20"
              )}>
                <p className={cn(
                  "text-sm text-center",
                  (error || storeError)?.includes('not enabled')
                    ? "text-yellow-400"
                    : "text-red-400"
                )}>
                  {error || storeError}
                </p>
                {(error || storeError)?.includes('not enabled') && (
                  <div className="mt-3 text-center">
                    <p className="text-xs text-text-tertiary mb-2">
                      {t('auth.register.emailForm.altMethodsHint')}
                    </p>
                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => router.push('/auth/login')}
                        className="text-xs bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full text-text-inverse transition-colors"
                      >
                        {t('auth.register.method.google.title')}
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push('/auth/login')}
                        className="text-xs bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full text-text-inverse transition-colors"
                      >
                        {t('auth.register.method.phone.title')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Full Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">
                {t('auth.register.field.fullName')}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                <Input
                  type="text"
                  placeholder={t('auth.register.placeholder.fullName')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">
                {t('auth.register.field.emailRequired')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                <Input
                  type="email"
                  placeholder={t('auth.common.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">
                {t('auth.register.field.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-20"
                  required
                  minLength={6}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary hover:text-text-inverse"
                >
                  {showPassword ? t('auth.common.hide') : t('auth.common.show')}
                </button>
              </div>
              <p className="text-xs text-text-tertiary">{t('auth.register.passwordMinHint')}</p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">
                {t('auth.register.field.confirmPassword')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">
                {t('auth.register.field.dateOfBirthOptional')}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                <Input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Section Preference */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-text-secondary">
                {t('auth.register.field.preferredSection')}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setPreferredSection(section.id)}
                    disabled={isLoading}
                    className={`
                      relative py-4 px-3 rounded-xl font-semibold text-sm transition-all
                      ${
                        preferredSection === section.id
                          ? `bg-gradient-to-br ${section.color} text-white shadow-lg scale-105`
                          : 'bg-white/5 text-text-secondary border border-white/10 hover:bg-white/10'
                      }
                    `}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Terms & Privacy */}
            <div className="flex items-start gap-3 p-4 bg-white/5 rounded-lg">
              <Checkbox
                id="terms"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                disabled={isLoading}
              />
              <label htmlFor="terms" className="text-sm text-text-secondary leading-relaxed">
                {t('auth.register.acceptPrefix')}{' '}
                <Link href="/terms" className="text-primary hover:underline">
                  {t('auth.common.termsOfService')}
                </Link>{' '}
                {t('auth.common.andThe')}{' '}
                <Link href="/privacy" className="text-primary hover:underline">
                  {t('auth.common.privacyPolicy')}
                </Link>
              </label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity py-3"
              disabled={isLoading || !acceptTerms}
            >
              {isLoading ? <Spinner size="sm" /> : t('auth.register.createAccount')}
            </Button>

            <div className="text-center">
              <p className="text-text-secondary text-sm">
                {t('auth.register.alreadyHaveAccount')}{' '}
                <Link href="/auth/login" className="font-semibold text-primary hover:underline">
                  {t('auth.common.login')}
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Social Registration Form (existing firebaseUser)
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <h1 className="text-3xl font-bold text-white mb-2">{t('auth.register.socialForm.title')}</h1>
        <p className="text-text-secondary">
          {t('auth.register.socialForm.subtitle')}
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 px-6 pb-8">
        <form onSubmit={handleSocialSubmit} className="space-y-6 max-w-md mx-auto">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {/* Avatar Upload (placeholder for now) */}
          <div className="flex justify-center">
            <button
              type="button"
              className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center hover:bg-white/15 transition-colors"
            >
              <Camera className="w-8 h-8 text-text-secondary" />
            </button>
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              {t('auth.register.field.fullName')}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <Input
                type="text"
                placeholder={t('auth.register.placeholder.fullName')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="pl-10"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Email (optional) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              {t('auth.register.field.emailOptional')}
            </label>
            <Input
              type="email"
              placeholder={t('auth.common.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Date of Birth */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              {t('auth.register.field.dateOfBirthOptional')}
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <Input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="pl-10"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Section Preference */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-text-secondary">
              {t('auth.register.field.preferredSection')}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setPreferredSection(section.id)}
                  disabled={isLoading}
                  className={`
                    relative py-4 px-3 rounded-xl font-semibold text-sm transition-all
                    ${
                      preferredSection === section.id
                        ? `bg-gradient-to-br ${section.color} text-white shadow-lg scale-105`
                        : 'bg-white/5 text-text-secondary border border-white/10 hover:bg-white/10'
                    }
                  `}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>

          {/* Provider opt-in */}
          <div className="mt-4 rounded-xl border border-white/10 p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wantsProvider}
                onChange={(e) => setWantsProvider(e.target.checked)}
                className="w-5 h-5 accent-vfit-primary"
              />
              <span className="text-sm text-white">
                Voglio anche offrire servizi come professionista
              </span>
            </label>

            {wantsProvider && (
              <div className="mt-3">
                <p className="text-sm text-white/60 mb-2">Che tipo di servizio offri?</p>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setProviderCategory(c.name)}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm border transition-colors',
                        providerCategory === c.name
                          ? 'border-vfit-primary bg-vfit-primary/10 text-white'
                          : 'border-white/10 text-white/70 hover:bg-white/5'
                      )}
                    >
                      <span className="mr-1">{c.icon}</span>{c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Terms & Privacy */}
          <div className="flex items-start gap-3 p-4 bg-white/5 rounded-lg">
            <Checkbox
              id="terms"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              disabled={isLoading}
            />
            <label htmlFor="terms" className="text-sm text-text-secondary leading-relaxed">
              {t('auth.register.acceptPrefix')}{' '}
              <Link href="/terms" className="text-primary hover:underline">
                {t('auth.common.termsOfService')}
              </Link>{' '}
              {t('auth.common.andThe')}{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                {t('auth.common.privacyPolicy')}
              </Link>
            </label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity py-3"
            disabled={isLoading || !acceptTerms}
          >
            {isLoading ? <Spinner size="sm" /> : t('auth.register.completeRegistration')}
          </Button>
        </form>
      </div>
    </div>
  );
}

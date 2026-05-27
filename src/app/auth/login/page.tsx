'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CountryCodePicker } from '@/components/ui/country-code-picker';
import { OtpInput } from '@/components/ui/otp-input';
import { Divider } from '@/components/ui/divider';
import { Spinner } from '@/components/ui/Spinner';
import { Apple, Mail, Phone, Lock, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

type LoginMethod = 'phone' | 'email' | null;

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background-dark">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop')] bg-cover bg-center opacity-25 mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-b from-background-dark/80 via-background-dark/90 to-background-dark" />
        <div className="absolute -top-24 left-1/2 h-72 w-[120%] -translate-x-1/2 rounded-full bg-vlife-primary/20 blur-3xl" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const {
    firebaseUser,
    user,
    isLoading,
    isInitialized,
    error,
    isOtpSent,
    phoneNumber: storedPhoneNumber,
    initPhoneAuth,
    sendPhoneOtp,
    verifyPhoneOtp,
    loginWithGoogle,
    loginWithApple,
    loginWithEmail,
    clearError,
  } = useAuthStore();

  const [loginMethod, setLoginMethod] = useState<LoginMethod>(null);
  const [countryCode, setCountryCode] = useState('+39');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [recaptchaInitialized, setRecaptchaInitialized] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Initialize reCAPTCHA only when phone method is selected
  useEffect(() => {
    if (
      typeof window !== 'undefined' && 
      loginMethod === 'phone' && 
      !isOtpSent &&
      !recaptchaInitialized && 
      isInitialized
    ) {
      // Small delay to ensure DOM element exists
      const timer = setTimeout(() => {
        const container = document.getElementById('recaptcha-container');
        if (container) {
          try {
            initPhoneAuth('recaptcha-container');
            setRecaptchaInitialized(true);
          } catch (error) {
            console.error('Failed to initialize reCAPTCHA:', error);
          }
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [loginMethod, isOtpSent, initPhoneAuth, recaptchaInitialized, isInitialized]);

  // Redirect based on auth state
  useEffect(() => {
    if (!isInitialized) return;

    if (user) {
      router.replace('/home');
    } else if (firebaseUser && !user) {
      router.replace('/auth/register');
    }
  }, [user, firebaseUser, isInitialized, router]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!phoneNumber || phoneNumber.length < 8) {
      return;
    }

    const fullPhoneNumber = `${countryCode}${phoneNumber}`;
    const success = await sendPhoneOtp(fullPhoneNumber);

    if (success) {
      setCountdown(60); // Start 60 second countdown
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;

    clearError();
    const fullPhoneNumber = `${countryCode}${phoneNumber}`;
    const success = await sendPhoneOtp(fullPhoneNumber);

    if (success) {
      setCountdown(60); // Restart countdown
      setOtpCode(''); // Clear OTP input
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (otpCode.length !== 6) {
      return;
    }

    await verifyPhoneOtp(otpCode);
  };

  const handleGoogleLogin = async () => {
    clearError();
    await loginWithGoogle();
  };

  const handleAppleLogin = async () => {
    clearError();
    await loginWithApple();
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await loginWithEmail(email, password);
  };

  // Show loading while initializing or during auth operations
  if (!isInitialized || (isLoading && !isOtpSent && loginMethod !== 'email')) {
    return (
      <AuthFrame>
        <div className="min-h-screen flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AuthFrame>
    );
  }

  // Don't show login form if user is authenticated (will redirect)
  if (user || (firebaseUser && !user)) {
    return (
      <AuthFrame>
        <div className="min-h-screen flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AuthFrame>
    );
  }

  // Method Selection Screen
  if (!loginMethod) {
    return (
      <AuthFrame>
        <div className="relative min-h-screen flex flex-col">
          <LanguageSwitcher variant="menu" className="absolute right-4 top-4 z-10" />
        {/* Logo Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-8">
          <div className="w-24 h-24 mb-6 relative">
            <div className="absolute inset-0 bg-vlife-primary/20 rounded-full blur-xl" />
            <div className="relative w-full h-full bg-white/5 border border-white/10 rounded-full flex items-center justify-center shadow-[0_0_24px_rgba(0,230,118,0.25)]">
              <span className="text-4xl font-bold text-vlife-primary">V</span>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">{t('auth.login.welcomeTitle')}</h1>
          <p className="text-text-secondary text-center mb-8">
            {t('auth.login.welcomeSubtitle')}
          </p>

          {/* Error Message */}
          {error && (
            <div className="w-full max-w-md mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {/* Login Method Options */}
          <div className="w-full max-w-md space-y-3">
            <button
              onClick={() => setLoginMethod('phone')}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-2xl border transition-all',
                'border-white/10 bg-white/5 hover:bg-white/10 hover:border-vlife-primary/30'
              )}
            >
              <div className="h-12 w-12 rounded-xl bg-section-primary/20 flex items-center justify-center">
                <Phone className="h-6 w-6 text-section-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-text-inverse">{t('auth.login.method.phone.title')}</p>
                <p className="text-sm text-text-tertiary">{t('auth.login.method.phone.subtitle')}</p>
              </div>
            </button>

            <button
              onClick={() => setLoginMethod('email')}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-2xl border transition-all',
                'border-white/10 bg-white/5 hover:bg-white/10 hover:border-vlife-primary/30'
              )}
            >
              <div className="h-12 w-12 rounded-xl bg-section-primary/20 flex items-center justify-center">
                <Mail className="h-6 w-6 text-section-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-text-inverse">{t('auth.login.method.email.title')}</p>
                <p className="text-sm text-text-tertiary">{t('auth.login.method.email.subtitle')}</p>
              </div>
            </button>

            <Divider className="my-6" text={t('auth.login.or')} />

            {/* Social Login Buttons */}
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white"
                onClick={handleGoogleLogin}
                disabled={isLoading}
              >
                <FcGoogle className="w-5 h-5 mr-2" />
                {t('auth.login.continueWithGoogle')}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white"
                onClick={handleAppleLogin}
                disabled={isLoading}
              >
                <Apple className="w-5 h-5 mr-2" />
                {t('auth.login.continueWithApple')}
              </Button>
            </div>

            <div className="mt-8 text-center">
              <p className="text-text-secondary text-sm">
                {t('auth.login.noAccount')}{' '}
                <Link href="/auth/register" className="font-semibold text-primary hover:underline">
                  {t('auth.common.register')}
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-8 text-center">
          <p className="text-text-secondary text-xs mb-2">
            {t('auth.common.continuing')}{' '}
            <Link href="/terms" className="text-primary hover:underline">
              {t('auth.common.termsOfService')}
            </Link>{' '}
            {t('auth.common.andThe')}{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              {t('auth.common.privacyPolicy')}
            </Link>
          </p>
        </div>
        </div>
      </AuthFrame>
    );
  }

  // Phone Login Screen
  if (loginMethod === 'phone') {
    return (
      <AuthFrame>
        <div className="relative min-h-screen flex flex-col">
          <LanguageSwitcher variant="menu" className="absolute right-4 top-4 z-10" />
        {/* Header */}
        <div className="px-6 pt-6">
          <button
            onClick={() => {
              setLoginMethod(null);
              clearError();
            }}
            className="flex items-center gap-2 text-text-secondary hover:text-text-inverse transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">{t('auth.common.back')}</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-8">
          <h1 className="text-2xl font-bold text-white mb-2">{t('auth.login.phone.title')}</h1>
          <p className="text-text-secondary text-center mb-8">
            {t('auth.login.phone.subtitle')}
          </p>

          {/* Error Message */}
          {error && (
            <div className="w-full max-w-md mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {/* Phone Auth Form */}
          <div className="w-full max-w-md">
            {!isOtpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="flex gap-2">
                  <CountryCodePicker
                    value={countryCode}
                    onChange={setCountryCode}
                    className="w-32"
                  />
                  <Input
                    type="tel"
                    placeholder={t('auth.login.phone.phonePlaceholder')}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    className="flex-1"
                    disabled={isLoading}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                  disabled={isLoading || phoneNumber.length < 8}
                >
                  {isLoading ? <Spinner size="sm" /> : t('auth.login.phone.sendCode')}
                </Button>

                {/* Hidden reCAPTCHA container */}
                <div id="recaptcha-container" className="hidden" />
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-text-secondary text-sm mb-2">
                    {t('auth.login.phone.codeSentTo', { phone: storedPhoneNumber || '' })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      clearError();
                      setCountdown(0);
                      window.location.reload();
                    }}
                    className="text-primary text-sm hover:underline"
                  >
                    {t('auth.login.phone.changeNumber')}
                  </button>
                </div>

                <OtpInput
                  length={6}
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={isLoading}
                />

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                  disabled={isLoading || otpCode.length !== 6}
                >
                  {isLoading ? <Spinner size="sm" /> : t('auth.login.phone.verifyCode')}
                </Button>

                {/* Resend OTP Button */}
                <div className="text-center">
                  {countdown > 0 ? (
                    <p className="text-text-secondary text-sm">
                      {t('auth.login.phone.resendIn', { seconds: countdown })}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isLoading}
                      className="text-primary text-sm font-medium hover:underline disabled:opacity-50"
                    >
                      {t('auth.login.phone.resendCode')}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
        </div>
      </AuthFrame>
    );
  }

  // Email Login Screen
  if (loginMethod === 'email') {
    return (
      <AuthFrame>
        <div className="relative min-h-screen flex flex-col">
          <LanguageSwitcher variant="menu" className="absolute right-4 top-4 z-10" />
          {/* Header */}
          <div className="px-6 pt-6">
            <button
              onClick={() => {
                setLoginMethod(null);
                clearError();
                setEmail('');
                setPassword('');
              }}
              className="flex items-center gap-2 text-text-secondary hover:text-text-inverse transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="text-sm">{t('auth.common.back')}</span>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col justify-center px-6 pb-8">
            <div className="mx-auto w-full max-w-md">
              <div className="flex flex-col items-center mb-8">
                <div className="relative mb-6">
                  <div className="absolute inset-0 rounded-full bg-vlife-primary/25 blur-xl" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-[0_0_24px_rgba(0,230,118,0.25)]">
                    <span className="text-4xl font-bold text-vlife-primary">V</span>
                  </div>
                </div>

                <h1 className="text-3xl font-display font-bold text-white text-center">
                  {t('auth.login.email.title')}
                </h1>
                <p className="mt-2 text-sm text-text-secondary text-center">
                  {t('auth.login.email.subtitle')}
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 p-4">
                  <p className="text-sm text-red-400 text-center">{error}</p>
                </div>
              )}

              {/* Email Login Form */}
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="sr-only">
                    {t('auth.common.email')}
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.common.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    leftIcon={<Mail className="h-5 w-5" />}
                    className="h-14 rounded-full border-white/10 bg-white/[0.04] placeholder:text-text-tertiary/80"
                    disabled={isLoading}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="sr-only">
                    {t('auth.common.password')}
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      leftIcon={<Lock className="h-5 w-5" />}
                      className="h-14 rounded-full border-white/10 bg-white/[0.04] pr-24 placeholder:text-text-tertiary/80"
                      disabled={isLoading}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-xs font-medium text-text-tertiary hover:text-text-inverse"
                      aria-label={showPassword ? t('auth.common.hide') : t('auth.common.show')}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span>{showPassword ? t('auth.common.hide') : t('auth.common.show')}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end text-sm">
                  <Link href="/auth/forgot-password" className="text-vlife-primary hover:text-vlife-secondary">
                    {t('auth.login.email.forgotPassword')}
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="h-14 w-full rounded-full bg-gradient-to-r from-vlife-primary to-vlife-secondary text-background-dark text-base font-bold uppercase tracking-wide shadow-[0_0_22px_rgba(0,230,118,0.3)] hover:opacity-95"
                  disabled={isLoading || !email || password.length < 6}
                >
                  {isLoading ? <Spinner size="sm" /> : t('auth.common.login')}
                </Button>
              </form>

              <Divider className="my-7" text={t('auth.login.or')} />

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="h-14 w-14 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-50"
                  aria-label={t('auth.login.continueWithGoogle')}
                >
                  <FcGoogle className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={handleAppleLogin}
                  disabled={isLoading}
                  className="h-14 w-14 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-50"
                  aria-label={t('auth.login.continueWithApple')}
                >
                  <Apple className="h-6 w-6 text-white" />
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMethod('phone')}
                  disabled={isLoading}
                  className="h-14 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {t('auth.login.method.phone.title')}
                </button>
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm text-text-secondary">
                  {t('auth.login.noAccount')}{' '}
                  <Link href="/auth/register" className="font-semibold text-vlife-primary hover:underline">
                    {t('auth.common.register')}
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-8 text-center">
            <p className="text-xs text-text-secondary">
              {t('auth.common.continuing')}{' '}
              <Link href="/terms" className="text-vlife-primary hover:underline">
                {t('auth.common.termsOfService')}
              </Link>{' '}
              {t('auth.common.andThe')}{' '}
              <Link href="/privacy" className="text-vlife-primary hover:underline">
                {t('auth.common.privacyPolicy')}
              </Link>
            </p>
          </div>
        </div>
      </AuthFrame>
    );
  }

  return null;
}

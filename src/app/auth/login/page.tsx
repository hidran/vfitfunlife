'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CountryCodePicker } from '@/components/ui/country-code-picker';
import { OtpInput } from '@/components/ui/otp-input';
import { Divider } from '@/components/ui/divider';
import { Spinner } from '@/components/ui/Spinner';
import { Apple, Mail, Phone, ChevronLeft } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

type LoginMethod = 'phone' | 'email' | null;

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
    console.log('[Login] Redirect check - isInitialized:', isInitialized, 'firebaseUser:', firebaseUser?.uid, 'user:', user?.uid);
    if (!isInitialized) return;

    if (user) {
      // Fully authenticated with complete profile
      console.log('[Login] User authenticated, redirecting to /home');
      router.replace('/home');
    } else if (firebaseUser && !user) {
      // Authenticated but profile incomplete
      console.log('[Login] Profile incomplete, redirecting to /auth/register');
      router.replace('/auth/register');
    } else {
      console.log('[Login] No user, staying on login page');
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
    console.log('[Login] Google login clicked');
    clearError();
    try {
      await loginWithGoogle();
      console.log('[Login] Google login completed');
    } catch (error) {
      console.error('[Login] Google login error:', error);
    }
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
        <Spinner size="lg" />
      </div>
    );
  }

  // Don't show login form if user is authenticated (will redirect)
  if (user || (firebaseUser && !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
        <Spinner size="lg" />
      </div>
    );
  }

  // Method Selection Screen
  if (!loginMethod) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
        {/* Logo Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-8">
          <div className="w-24 h-24 mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary rounded-2xl opacity-20 blur-xl" />
            <div className="relative w-full h-full bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center">
              <span className="text-4xl font-bold text-white">V</span>
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
                'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
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
                'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
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
    );
  }

  // Phone Login Screen
  if (loginMethod === 'phone') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
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
    );
  }

  // Email Login Screen
  if (loginMethod === 'email') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
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
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-8">
          <h1 className="text-2xl font-bold text-white mb-2">{t('auth.login.email.title')}</h1>
          <p className="text-text-secondary text-center mb-8">
            {t('auth.login.email.subtitle')}
          </p>

          {/* Error Message */}
          {error && (
            <div className="w-full max-w-md mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {/* Email Login Form */}
          <div className="w-full max-w-md">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
                  {t('auth.common.email')}
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('auth.common.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full"
                  disabled={isLoading}
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
                  {t('auth.common.password')}
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pr-20"
                    disabled={isLoading}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary hover:text-text-inverse"
                  >
                    {showPassword ? t('auth.common.hide') : t('auth.common.show')}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                  <input type="checkbox" className="rounded border-white/20 bg-white/5" />
                  <span>{t('auth.login.email.rememberMe')}</span>
                </label>
                <Link href="/auth/forgot-password" className="text-primary hover:underline">
                  {t('auth.login.email.forgotPassword')}
                </Link>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                disabled={isLoading || !email || password.length < 6}
              >
                {isLoading ? <Spinner size="sm" /> : t('auth.common.login')}
              </Button>
            </form>

            <div className="mt-8 text-center space-y-4">
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
    );
  }

  return null;
}

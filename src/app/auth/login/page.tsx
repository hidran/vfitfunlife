'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CountryCodePicker } from '@/components/ui/country-code-picker';
import { OtpInput } from '@/components/ui/otp-input';
import { Divider } from '@/components/ui/divider';
import { Spinner } from '@/components/ui/Spinner';
import Image from 'next/image';
import { Apple, Mail } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';

export default function LoginPage() {
  const router = useRouter();
  const {
    firebaseUser,
    user,
    isLoading,
    error,
    isOtpSent,
    phoneNumber: storedPhoneNumber,
    initPhoneAuth,
    sendPhoneOtp,
    verifyPhoneOtp,
    loginWithGoogle,
    loginWithApple,
    clearError,
  } = useAuthStore();

  const [countryCode, setCountryCode] = useState('+39');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Initialize reCAPTCHA on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      initPhoneAuth('recaptcha-container');
    }
  }, [initPhoneAuth]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      router.push('/home');
    } else if (firebaseUser && !user) {
      // User is authenticated but profile is not complete
      router.push('/auth/register');
    }
  }, [user, firebaseUser, router]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
        <Spinner size="lg" />
      </div>
    );
  }

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

        <h1 className="text-3xl font-bold text-white mb-2">Benvenuto</h1>
        <p className="text-text-secondary text-center mb-8">
          Accedi per gestire la tua esperienza fitness
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
                  placeholder="Numero di telefono"
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
                {isLoading ? <Spinner size="sm" /> : 'Continua con Telefono'}
              </Button>

              {/* Hidden reCAPTCHA container */}
              <div id="recaptcha-container" className="hidden" />
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center mb-4">
                <p className="text-text-secondary text-sm mb-2">
                  Codice inviato a {storedPhoneNumber}
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
                  Cambia numero
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
                {isLoading ? <Spinner size="sm" /> : 'Verifica Codice'}
              </Button>

              {/* Resend OTP Button */}
              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-text-secondary text-sm">
                    Richiedi nuovo codice tra {countdown}s
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isLoading}
                    className="text-primary text-sm font-medium hover:underline disabled:opacity-50"
                  >
                    Invia di nuovo il codice
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Social Login Divider */}
          {!isOtpSent && (
            <>
              <Divider className="my-6" text="oppure" />

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
                  Continua con Google
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white"
                  onClick={handleAppleLogin}
                  disabled={isLoading}
                >
                  <Apple className="w-5 h-5 mr-2" />
                  Continua con Apple
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-8 text-center">
        <p className="text-text-secondary text-xs mb-2">
          Continuando, accetti i nostri{' '}
          <a href="/terms" className="text-primary hover:underline">
            Termini di Servizio
          </a>{' '}
          e la{' '}
          <a href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}

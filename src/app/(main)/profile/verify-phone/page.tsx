'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Phone, Shield, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export default function VerifyPhonePage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuthStore();
  const [phoneNumber, setPhoneNumber] = useState(user?.phone || '');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      setError(t('profile.verifyPhone.error.phoneRequired'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Implement actual phone verification using Firebase Phone Auth
      // This is a placeholder implementation
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setStep('code');
      setCountdown(60);
    } catch (err) {
      console.error('Error sending code:', err);
      setError(t('profile.verifyPhone.error.sendCode'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      setError(t('profile.verifyPhone.error.codeLength'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Implement actual code verification
      // This is a placeholder implementation
      await new Promise((resolve) => setTimeout(resolve, 1500));
      router.back();
    } catch (err) {
      console.error('Error verifying code:', err);
      setError(t('profile.verifyPhone.error.invalidCode'));
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhoneNumber = (value: string): string => {
    // Remove all non-numeric characters
    const numbers = value.replace(/\D/g, '');
    
    // Format as Italian number if starts with 3
    if (numbers.startsWith('3') && numbers.length <= 10) {
      if (numbers.length <= 3) return numbers;
      if (numbers.length <= 6) return `${numbers.slice(0, 3)} ${numbers.slice(3)}`;
      return `${numbers.slice(0, 3)} ${numbers.slice(3, 6)} ${numbers.slice(6, 10)}`;
    }
    
    return numbers;
  };

  return (
    <div className="min-h-screen bg-background-dark">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background-dark/95 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center p-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-inverse hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-text-inverse ml-2">
            {t('profile.verifyPhone.title')}
          </h1>
        </div>
      </div>

      <div className="p-6">
        {/* Icon */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full bg-section-gradient/10 flex items-center justify-center">
            {step === 'phone' ? (
              <Phone className="text-section-primary" size={32} />
            ) : (
              <Shield className="text-section-primary" size={32} />
            )}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-text-inverse text-center mb-2">
          {step === 'phone'
            ? t('profile.verifyPhone.step.phone.title')
            : t('profile.verifyPhone.step.code.title')}
        </h2>
        <p className="text-text-secondary text-center mb-8">
          {step === 'phone'
            ? t('profile.verifyPhone.step.phone.subtitle')
            : t('profile.verifyPhone.step.code.subtitle', { phone: phoneNumber })}
        </p>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-error/10 text-error text-sm mb-6">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {/* Phone Input Step */}
        {step === 'phone' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.verifyPhone.phoneLabel')}
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
                  <span className="text-sm">+39</span>
                </div>
                <input
                  type="tel"
                  value={phoneNumber.replace(/^\+39/, '').replace(/\D/g, '')}
                  onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                  placeholder={t('profile.verifyPhone.phonePlaceholder')}
                  maxLength={13}
                  className={cn(
                    'w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-4 pl-14 text-white placeholder:text-text-tertiary',
                    'focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent',
                    'transition-all duration-200 text-lg tracking-wider'
                  )}
                />
              </div>
              <p className="text-xs text-text-tertiary mt-2">
                {t('profile.verifyPhone.phoneHint')}
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleSendCode}
              isLoading={isLoading}
              disabled={isLoading || phoneNumber.length < 9}
              className="mt-6"
            >
              {t('profile.verifyPhone.sendCode')}
            </Button>
          </div>
        )}

        {/* Code Input Step */}
        {step === 'code' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-tertiary mb-2">
                {t('profile.verifyPhone.codeLabel')}
              </label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(value);
                  if (error) setError(null);
                }}
                placeholder="123456"
                maxLength={6}
                className={cn(
                  'w-full bg-[#2A2D3A] border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-text-tertiary',
                  'focus:outline-none focus:ring-2 focus:ring-section-primary focus:border-transparent',
                  'transition-all duration-200 text-center text-2xl tracking-[0.5em] font-mono'
                )}
              />
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleVerifyCode}
              isLoading={isLoading}
              disabled={isLoading || verificationCode.length !== 6}
              className="mt-6"
            >
              {t('profile.verifyPhone.verify')}
            </Button>

            {/* Resend Code */}
            <div className="text-center mt-4">
              {countdown > 0 ? (
                <p className="text-sm text-text-tertiary">
                  {t('profile.verifyPhone.resendIn', { seconds: countdown })}
                </p>
              ) : (
                <button
                  onClick={handleSendCode}
                  className="text-sm text-section-primary hover:underline"
                >
                  {t('profile.verifyPhone.resendCode')}
                </button>
              )}
            </div>

            {/* Change Number */}
            <button
              onClick={() => setStep('phone')}
              className="w-full text-center text-sm text-text-tertiary hover:text-text-secondary transition-colors mt-2"
            >
              {t('profile.verifyPhone.changeNumber')}
            </button>
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-text-tertiary text-center mt-8">
          Riceverai un SMS con il codice di verifica.{' '}
          <br />
          Messaggio e dati standard possono applicarsi.
        </p>
      </div>
    </div>
  );
}

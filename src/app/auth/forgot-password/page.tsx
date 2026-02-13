'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/Spinner';
import { Mail, ChevronLeft, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { resetPassword, isLoading, error, clearError } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (!email.trim()) {
      setLocalError('Inserisci la tua email');
      return;
    }

    try {
      await resetPassword(email.trim());
      setIsSubmitted(true);
    } catch (err) {
      console.error('Password reset error:', err);
      setLocalError(error || 'Errore durante l\'invio dell\'email di reset');
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
        {/* Header */}
        <div className="px-6 pt-6">
          <button
            onClick={() => router.push('/auth/login')}
            className="flex items-center gap-2 text-text-secondary hover:text-text-inverse transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">Torna al login</span>
          </button>
        </div>

        {/* Success Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-md text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>

            <h1 className="text-2xl font-bold text-white mb-4">
              Email inviata!
            </h1>
            <p className="text-text-secondary mb-8">
              Abbiamo inviato un link per reimpostare la password a{' '}
              <span className="text-text-inverse font-medium">{email}</span>.{' '}
              Controlla la tua casella di posta e segui le istruzioni.
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => router.push('/auth/login')}
                className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
              >
                Torna al login
              </Button>

              <button
                onClick={() => setIsSubmitted(false)}
                className="text-text-secondary text-sm hover:text-text-inverse"
              >
                Non hai ricevuto l&apos;email? Reinvia
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
      {/* Header */}
      <div className="px-6 pt-6">
        <button
          onClick={() => router.push('/auth/login')}
          className="flex items-center gap-2 text-text-secondary hover:text-text-inverse transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="text-sm">Torna al login</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Password dimenticata?</h1>
        <p className="text-text-secondary text-center mb-8 max-w-sm">
          Inserisci la tua email e ti invieremo un link per reimpostare la password
        </p>

        {/* Error Message */}
        {(localError || error) && (
          <div className="w-full max-w-md mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm text-center">{localError || error}</p>
          </div>
        )}

        {/* Form */}
        <div className="w-full max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                <Input
                  id="email"
                  type="email"
                  placeholder="nome@esempio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
              disabled={isLoading || !email}
            >
              {isLoading ? <Spinner size="sm" /> : 'Invia link di reset'}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-text-secondary text-sm">
              Ricordi la password?{' '}
              <Link href="/auth/login" className="font-semibold text-primary hover:underline">
                Accedi
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

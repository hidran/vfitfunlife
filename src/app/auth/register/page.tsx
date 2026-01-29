'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/Spinner';
import { Camera, Calendar, User } from 'lucide-react';
import { completeRegistration } from '@/lib/firebase/auth';
import { Checkbox } from '@/components/ui/checkbox';

const SECTIONS = [
  { id: 'fit' as const, label: 'VFit', color: 'from-vfit-primary to-vfit-secondary' },
  { id: 'fun' as const, label: 'VFun', color: 'from-vfun-primary to-vfun-secondary' },
  { id: 'life' as const, label: 'VLife', color: 'from-vlife-primary to-vlife-secondary' },
];

export default function RegisterPage() {
  const router = useRouter();
  const { firebaseUser, refreshUserProfile } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [preferredSection, setPreferredSection] = useState<'fit' | 'fun' | 'life'>('fit');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Il nome completo è obbligatorio');
      return;
    }

    if (!acceptTerms) {
      setError('Devi accettare i Termini e Condizioni');
      return;
    }

    if (!firebaseUser) {
      setError('Utente non autenticato');
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

      // Refresh user profile in store
      await refreshUserProfile();

      // Navigate to home
      router.push('/home');
    } catch (err) {
      console.error('Registration error:', err);
      setError('Errore durante la registrazione. Riprova.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Completa il profilo</h1>
        <p className="text-text-secondary">
          Aiutaci a personalizzare la tua esperienza
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 px-6 pb-8">
        <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
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
              Nome completo *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <Input
                type="text"
                placeholder="Mario Rossi"
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
              Email (opzionale)
            </label>
            <Input
              type="email"
              placeholder="mario@esempio.it"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Date of Birth */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Data di nascita (opzionale)
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
              Cosa ti interessa di più?
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
              Accetto i{' '}
              <a href="/terms" className="text-primary hover:underline">
                Termini di Servizio
              </a>{' '}
              e la{' '}
              <a href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </a>
            </label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity py-3"
            disabled={isLoading || !acceptTerms}
          >
            {isLoading ? <Spinner size="sm" /> : 'Completa Registrazione'}
          </Button>
        </form>
      </div>
    </div>
  );
}

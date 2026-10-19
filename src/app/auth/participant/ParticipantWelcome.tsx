'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
export function ParticipantWelcome() {
  const params = useSearchParams();
  const { t } = useI18n();
  const resetPassword = useAuthStore(s => s.resetPassword);
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await resetPassword(email.trim()); setSent(true); }
    catch { setError(t('courses.invitationFailed')); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-background flex items-center justify-center p-5 text-content">
    <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-6 space-y-5">
      <h1 className="text-2xl font-bold">{t('courses.finishRegistration')}</h1>
      <p>{t('courses.registrationBindingHint')}</p>
      {sent ? <p role="status">{t('courses.checkSetupEmail')}</p> : <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">{t('courses.participantEmail')}<input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          className="w-full rounded-xl border border-hairline bg-surface p-3" /></label>
        <Button type="submit" disabled={busy}>{t('courses.finishRegistration')}</Button>
      </form>}
      {error && <p role="alert">{error}</p>}
      <Link className="block underline" href="/auth/login">{t('auth.common.backToLogin')}</Link>
    </div>
  </main>;
}

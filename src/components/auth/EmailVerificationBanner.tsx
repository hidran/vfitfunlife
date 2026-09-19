'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { isAwaitingEmailVerification } from '@/lib/emailVerification';
import { cn } from '@/lib/utils';
import type { MessageKey } from '@/i18n/messages';
import { Button } from '@/components/ui/button';

const RESEND_COOLDOWN_S = 60;
/** Minimum gap between silent re-checks when the app regains focus. */
const FOCUS_CHECK_INTERVAL_MS = 15_000;

type Notice = { key: MessageKey; tone: 'info' | 'error' } | null;

/**
 * Asks email/password users to open the verification link, with resend and
 * "I've verified" actions. Google/Apple and phone sign-ins never see it; it
 * disappears as soon as the address is verified (also when the user comes back
 * to the app from their mail client).
 */
export function EmailVerificationBanner({ className }: { className?: string }) {
  const { t } = useI18n();
  const { firebaseUser, user, resendVerificationEmail, checkEmailVerification } = useAuthStore();
  const [notice, setNotice] = useState<Notice>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const lastFocusCheck = useRef(0);

  const awaiting =
    !!firebaseUser && !!user && isAwaitingEmailVerification(firebaseUser, user.emailVerified);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Coming back from the mail app: re-check quietly.
  useEffect(() => {
    if (!awaiting) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFocusCheck.current < FOCUS_CHECK_INTERVAL_MS) return;
      lastFocusCheck.current = Date.now();
      checkEmailVerification().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [awaiting, checkEmailVerification]);

  const handleCheck = useCallback(async () => {
    setIsChecking(true);
    setNotice(null);
    try {
      const verified = await checkEmailVerification();
      if (!verified) setNotice({ key: 'auth.verifyEmail.notYet', tone: 'info' });
    } catch {
      setNotice({ key: 'auth.verifyEmail.error', tone: 'error' });
    } finally {
      setIsChecking(false);
    }
  }, [checkEmailVerification]);

  const handleResend = useCallback(async () => {
    setIsSending(true);
    setNotice(null);
    try {
      await resendVerificationEmail();
      setNotice({ key: 'auth.verifyEmail.sent', tone: 'info' });
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setNotice({
        key: code === 'auth/too-many-requests' ? 'auth.verifyEmail.tooManyRequests' : 'auth.verifyEmail.error',
        tone: 'error',
      });
    } finally {
      setIsSending(false);
    }
  }, [resendVerificationEmail]);

  if (!awaiting) return null;

  return (
    <section
      aria-labelledby="verify-email-title"
      className={cn(
        'mx-4 mt-3 rounded-2xl border border-warning-DEFAULT/30 bg-warning-DEFAULT/10 p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-DEFAULT/20" aria-hidden>
          <MailCheck size={18} className="text-warning-DEFAULT" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="verify-email-title" className="text-sm font-semibold text-text-inverse">
            {t('auth.verifyEmail.title')}
          </h2>
          <p className="mt-0.5 break-words text-xs text-text-secondary">
            {t('auth.verifyEmail.body', { email: firebaseUser.email ?? '' })}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          size="sm"
          className="justify-center px-3 text-xs"
          onClick={handleCheck}
          isLoading={isChecking}
        >
          {t('auth.verifyEmail.check')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-center px-3 text-xs"
          onClick={handleResend}
          disabled={cooldown > 0}
          isLoading={isSending}
        >
          {cooldown > 0
            ? t('auth.verifyEmail.resendIn', { seconds: cooldown })
            : t('auth.verifyEmail.resend')}
        </Button>
      </div>

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'mt-2 text-xs',
            notice.tone === 'error' ? 'text-error-DEFAULT' : 'text-text-secondary',
          )}
        >
          {t(notice.key)}
        </p>
      )}
    </section>
  );
}

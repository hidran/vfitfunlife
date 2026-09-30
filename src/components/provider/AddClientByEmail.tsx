'use client';

/**
 * "Nuovo cliente" — the trainer adds a client by email.
 *
 * Used as the "Nuovo cliente (email)" mode of "Aggiungi appuntamento" (/provider/schedule) and
 * behind a "+ Nuovo cliente" button in the header of /provider/clients.
 *
 * 1. addClientByEmail: an existing account joins the roster at once — `onAdded` gets the entry
 *    so the caller can reload and preselect it.
 * 2. No account (`not_found`): nothing is sent. The trainer sees "Non ha ancora un account
 *    VFit" and may choose "Invita a unirsi a VFit" → inviteClientToPlatform sends the email.
 */

import { useId, useState, type FormEvent } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { addClientByEmail, inviteClientToPlatform, type AddedRosterClient } from '@/lib/firebase/functions';
import { callableErrorMessage, fieldClass } from './schedule/ScheduleSheet';

const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

interface AddClientByEmailProps {
  /** After an existing account was added (or already was a client). */
  onAdded: (client: AddedRosterClient) => void;
  /** Show a "+ Nuovo cliente" button first (clients page); false shows the field directly. */
  collapsible?: boolean;
  className?: string;
}

type Outcome =
  | { kind: 'added'; name: string; already: boolean }
  | { kind: 'notFound'; email: string }
  | { kind: 'invited' }
  | { kind: 'error'; message: string };

export function AddClientByEmail({ onAdded, collapsible = false, className }: AddClientByEmailProps) {
  const { t } = useI18n();
  const emailId = useId();
  const [open, setOpen] = useState(!collapsible);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'lookup' | 'invite' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const errorFor = (err: unknown): string => {
    const message = callableErrorMessage(err);
    if (message.includes('invalid_email')) return t('provider.addClient.error.invalidEmail');
    if (message.includes('self')) return t('provider.addClient.error.self');
    if (message.includes('rate_limited')) return t('provider.addClient.error.rateLimited');
    if (message.includes('instructor_not_bookable')) return t('provider.addClient.error.notBookable');
    if (message.includes('already_registered')) return t('provider.addClient.error.alreadyRegistered');
    if (message.includes('email_failed')) return t('provider.addClient.error.emailFailed');
    return t('provider.addClient.error.generic');
  };

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setOutcome({ kind: 'error', message: t('provider.addClient.error.invalidEmail') });
      return;
    }
    setBusy('lookup');
    setOutcome(null);
    try {
      const result = await addClientByEmail(normalized);
      if (result.status === 'added') {
        const name = result.client.name || result.client.email || normalized;
        setOutcome({ kind: 'added', name, already: result.alreadyClient });
        setEmail('');
        onAdded(result.client);
      } else {
        setOutcome({ kind: 'notFound', email: normalized });
      }
    } catch (err) {
      setOutcome({ kind: 'error', message: errorFor(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleInvite = async (address: string) => {
    if (busy) return;
    setBusy('invite');
    try {
      await inviteClientToPlatform(address);
      setOutcome({ kind: 'invited' });
      setEmail('');
    } catch (err) {
      setOutcome({ kind: 'error', message: errorFor(err) });
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn('min-h-11', className)}
      >
        <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
        {t('provider.addClient.open')}
      </Button>
    );
  }

  return (
    <form onSubmit={handleLookup} noValidate className={cn('space-y-2', className)}>
      <label htmlFor={emailId} className="text-sm font-medium text-content">
        {t('provider.addClient.emailLabel')}
      </label>
      <div className="flex gap-2">
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (outcome?.kind === 'notFound' || outcome?.kind === 'error') setOutcome(null);
          }}
          placeholder={t('provider.addClient.emailPlaceholder')}
          disabled={busy !== null}
          className={cn(fieldClass, 'flex-1 min-w-0')}
        />
        <Button
          type="submit"
          isLoading={busy === 'lookup'}
          disabled={busy !== null || !email.trim()}
          className="min-h-11 shrink-0"
        >
          {t('provider.addClient.submit')}
        </Button>
      </div>
      {!outcome && <p className="text-xs text-content-muted">{t('provider.addClient.hint')}</p>}

      {outcome?.kind === 'added' && (
        <p className="text-sm text-content-muted" role="status">
          {t(outcome.already ? 'provider.addClient.alreadyClient' : 'provider.addClient.added', {
            name: outcome.name,
          })}
        </p>
      )}
      {outcome?.kind === 'notFound' && (
        <div className="rounded-lg border border-hairline p-3 space-y-2" role="status">
          <p className="text-sm text-content">{t('provider.addClient.notFound')}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleInvite(outcome.email)}
            isLoading={busy === 'invite'}
            disabled={busy !== null}
            className="min-h-11 w-full"
          >
            <UserPlus className="w-4 h-4 mr-1" aria-hidden="true" />
            {t('provider.addClient.invite')}
          </Button>
        </div>
      )}
      {outcome?.kind === 'invited' && (
        <p className="text-sm text-content-muted" role="status">{t('provider.addClient.invited')}</p>
      )}
      {outcome?.kind === 'error' && (
        <p className="text-sm text-error" role="alert">{outcome.message}</p>
      )}
    </form>
  );
}

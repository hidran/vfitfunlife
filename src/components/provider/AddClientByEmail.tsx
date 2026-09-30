'use client';

/**
 * "Nuovo cliente" — the trainer adds a client by email.
 *
 * Used as the "Nuovo cliente (email)" mode of "Aggiungi appuntamento" (/provider/schedule) and
 * behind a "+ Nuovo cliente" button in the header of /provider/clients.
 *
 * 1. addClientByEmail: an existing account joins the roster at once — `onAdded` gets the entry
 *    so the caller can reload and preselect it.
 * 2. No account (`not_found`): nothing is sent yet. The trainer may
 *    - create the account (name + optional phone → createClientAccount): the client joins the
 *      roster at once (`onAdded`, like 1.) and gets an email to confirm the account; or
 *    - just "Invita a unirsi a VFit" (secondary link) → inviteClientToPlatform sends an invite.
 */

import { useId, useState, type FormEvent } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import {
  addClientByEmail,
  createClientAccount,
  inviteClientToPlatform,
  type AddedRosterClient,
} from '@/lib/firebase/functions';
import { callableErrorMessage, fieldClass } from './schedule/ScheduleSheet';

const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
// Same loose rules as the server (createClientAccountCore): 2..80 chars; 6..15 digits.
const MIN_NAME = 2;
const MAX_NAME = 80;
const PHONE_RE = /^\+?\d{6,15}$/;

function phoneLooksValid(raw: string): boolean {
  const compact = raw.trim().replace(/[\s\-.()]/g, '');
  if (compact === '') return true;
  return PHONE_RE.test(compact.startsWith('00') ? `+${compact.slice(2)}` : compact);
}

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
  | { kind: 'created'; name: string; emailSent: boolean }
  | { kind: 'invited' }
  | { kind: 'error'; message: string };

export function AddClientByEmail({ onAdded, collapsible = false, className }: AddClientByEmailProps) {
  const { t } = useI18n();
  const emailId = useId();
  const nameId = useId();
  const phoneId = useId();
  const [open, setOpen] = useState(!collapsible);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'lookup' | 'invite' | 'create' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const errorFor = (err: unknown): string => {
    const message = callableErrorMessage(err);
    if (message.includes('invalid_email')) return t('provider.addClient.error.invalidEmail');
    if (message.includes('self')) return t('provider.addClient.error.self');
    if (message.includes('rate_limited')) return t('provider.addClient.error.rateLimited');
    if (message.includes('instructor_not_bookable')) return t('provider.addClient.error.notBookable');
    if (message.includes('already_registered')) return t('provider.addClient.error.alreadyRegistered');
    if (message.includes('email_failed')) return t('provider.addClient.error.emailFailed');
    if (message.includes('invalid_name')) return t('provider.addClient.error.invalidName');
    if (message.includes('invalid_phone')) return t('provider.addClient.error.invalidPhone');
    if (message.includes('account_create_failed')) return t('provider.addClient.error.createFailed');
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
    setCreateError(null);
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

  const handleCreate = async (address: string) => {
    if (busy) return;
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (name.length < MIN_NAME || name.length > MAX_NAME) {
      setCreateError(t('provider.addClient.error.invalidName'));
      return;
    }
    if (!phoneLooksValid(phone)) {
      setCreateError(t('provider.addClient.error.invalidPhone'));
      return;
    }
    setBusy('create');
    setCreateError(null);
    try {
      const result = await createClientAccount({
        email: address,
        fullName: name,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      const shown = result.client.name || name;
      setOutcome(
        result.status === 'created'
          ? { kind: 'created', name: shown, emailSent: result.emailSent }
          : { kind: 'added', name: shown, already: result.alreadyClient },
      );
      setEmail('');
      setFullName('');
      setPhone('');
      onAdded(result.client);
    } catch (err) {
      // Stay on the form so the trainer can fix the field and retry.
      setCreateError(errorFor(err));
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
            if (outcome?.kind === 'notFound' || outcome?.kind === 'error') {
              setOutcome(null);
              setCreateError(null);
            }
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
        <div className="rounded-lg border border-hairline p-3 space-y-3">
          <p className="text-sm text-content" role="status">{t('provider.addClient.notFound')}</p>
          <div className="space-y-1">
            <label htmlFor={nameId} className="text-sm font-medium text-content">
              {t('provider.addClient.create.nameLabel')}
            </label>
            <input
              id={nameId}
              type="text"
              autoComplete="off"
              required
              maxLength={MAX_NAME}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setCreateError(null);
              }}
              disabled={busy !== null}
              className={cn(fieldClass, 'w-full')}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={phoneId} className="text-sm font-medium text-content">
              {t('provider.addClient.create.phoneLabel')}
            </label>
            <input
              id={phoneId}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setCreateError(null);
              }}
              placeholder={t('provider.addClient.create.phonePlaceholder')}
              disabled={busy !== null}
              className={cn(fieldClass, 'w-full')}
            />
          </div>
          {createError && <p className="text-sm text-error" role="alert">{createError}</p>}
          <Button
            type="button"
            onClick={() => handleCreate(outcome.email)}
            isLoading={busy === 'create'}
            disabled={busy !== null || !fullName.trim()}
            className="min-h-11 w-full"
          >
            <UserPlus className="w-4 h-4 mr-1" aria-hidden="true" />
            {t('provider.addClient.create.submit')}
          </Button>
          <button
            type="button"
            onClick={() => handleInvite(outcome.email)}
            disabled={busy !== null}
            aria-busy={busy === 'invite'}
            className="min-h-11 w-full text-sm text-content-muted underline underline-offset-2 hover:text-content disabled:opacity-50"
          >
            {t('provider.addClient.invite')}
          </button>
        </div>
      )}
      {outcome?.kind === 'created' && (
        <p
          className={cn('text-sm', outcome.emailSent ? 'text-content-muted' : 'text-warning')}
          role={outcome.emailSent ? 'status' : 'alert'}
        >
          {t(outcome.emailSent ? 'provider.addClient.create.created' : 'provider.addClient.create.createdNoEmail', {
            name: outcome.name,
          })}
        </p>
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

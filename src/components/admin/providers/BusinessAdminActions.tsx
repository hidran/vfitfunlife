'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, FileEdit, Unlock, UserRound, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { notify } from '@/lib/notify';
import type { MessageKey } from '@/i18n/messages';
import {
  convertBusinessToIndividual,
  releaseBusinessVat,
  updateBusinessTaxId,
} from '@/lib/firebase/functions';
import { adminBusinessErrorMessageKey } from '@/lib/providerApplicationErrors';
import { BUSINESS_FIELD_LIMITS, BUSINESS_LEGAL_FORMS } from '@/lib/businessDetails';
import { isValidItalianVat, normalizeVatNumber } from '@/lib/vatNumber';
import type { AdminBusiness } from '@/lib/admin/providerBusiness';
import type { BusinessLegalForm } from '@/types/firebase';
import { LEGAL_FORM_LABEL } from './BusinessReviewCard';

/** The UI's cap on the optional audit reason (the server accepts up to 1000). */
export const ADMIN_REASON_MAX_LENGTH = 200;

type Action = 'change' | 'release' | 'convert';

interface Props {
  providerId: string;
  business: AdminBusiness;
  /**
   * Offer "release tax-id claim": only where it can succeed — a rejected company. The server
   * refuses (`claim_in_use`) while a pending or approved company still carries the number.
   */
  canRelease: boolean;
  /** Reload the provider after a successful action. */
  onChanged: () => void | Promise<void>;
}

/**
 * The three admin corrections of a company (plan 2026-10-04, B8): change its tax id / legal
 * data, release its tax-id claim, convert it to an individual. Each runs in a confirmation
 * dialog with an optional reason; the callables write the audit entry themselves.
 */
export function BusinessAdminActions({ providerId, business, canRelease, onChanged }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Action | null>(null);

  const done = async (successKey: MessageKey) => {
    setOpen(null);
    notify.success(t(successKey));
    await onChanged();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 pt-2 border-t border-hairline">
        <Button variant="secondary" size="sm" onClick={() => setOpen('change')} className="gap-2">
          <FileEdit aria-hidden="true" className="w-4 h-4" />
          {t('admin.business.action.changeTaxId')}
        </Button>
        {canRelease && (
          <Button variant="secondary" size="sm" onClick={() => setOpen('release')} className="gap-2">
            <Unlock aria-hidden="true" className="w-4 h-4" />
            {t('admin.business.action.release')}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setOpen('convert')} className="gap-2">
          <UserRound aria-hidden="true" className="w-4 h-4" />
          {t('admin.business.action.convert')}
        </Button>
      </div>

      {open === 'change' && (
        <ChangeTaxIdDialog
          providerId={providerId}
          business={business}
          onClose={() => setOpen(null)}
          onDone={() => done('admin.business.change.success')}
        />
      )}
      {open === 'release' && (
        <ActionDialog
          title={t('admin.business.release.title')}
          description={t('admin.business.release.description', { vat: business.vatNumber })}
          confirmLabel={t('admin.business.release.confirm')}
          onClose={() => setOpen(null)}
          onConfirm={async (reason) => {
            await releaseBusinessVat({ vatNumber: business.vatNumber, ...(reason ? { reason } : {}) });
            await done('admin.business.release.success');
          }}
        />
      )}
      {open === 'convert' && (
        <ActionDialog
          title={t('admin.business.convert.title')}
          description={t('admin.business.convert.warning')}
          warning
          confirmLabel={t('admin.business.convert.confirm')}
          onClose={() => setOpen(null)}
          onConfirm={async (reason) => {
            await convertBusinessToIndividual({ providerId, ...(reason ? { reason } : {}) });
            await done('admin.business.convert.success');
          }}
        />
      )}
    </>
  );
}

interface ActionDialogProps {
  title: string;
  description: string;
  /** Show the description as a warning (icon + emphasis), for an action that removes data. */
  warning?: boolean;
  confirmLabel: string;
  onClose: () => void;
  /** Receives the trimmed reason, or undefined when left empty. Throws to keep the dialog open. */
  onConfirm: (reason: string | undefined) => Promise<void>;
  /** Extra fields above the reason. */
  children?: ReactNode;
  /** Runs before onConfirm; false stops the confirmation (the fields show their own errors). */
  validate?: () => boolean;
}

/**
 * Confirmation dialog shared by the three actions: an accessible modal (focus trapped, Escape
 * and the backdrop close it — except while the call is running), an optional reason of at most
 * ADMIN_REASON_MAX_LENGTH characters, and the server's refusal as localised text, never a code.
 */
function ActionDialog({
  title,
  description,
  warning = false,
  confirmLabel,
  onClose,
  onConfirm,
  children,
  validate,
}: ActionDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const counterId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (!busy) onClose();
  };

  const confirm = async () => {
    if (busy) return;
    setError(null);
    if (validate && !validate()) return;
    setBusy(true);
    try {
      const trimmed = reason.trim();
      await onConfirm(trimmed ? trimmed : undefined);
    } catch (err) {
      console.error('[BusinessAdminActions]', err);
      const key = adminBusinessErrorMessageKey(err);
      setError(t(key ?? 'admin.business.dialog.genericError'));
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={close}
      closeOnBackdrop={!busy}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="w-full max-w-md"
    >
      <div className="rounded-2xl bg-surface-elevated border border-hairline p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-content">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label={t('common.close')}
            className="w-11 h-11 -mr-2 -mt-2 shrink-0 flex items-center justify-center rounded-lg text-content-muted hover:text-content disabled:opacity-50"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        <p
          id={descriptionId}
          className={
            warning
              ? 'flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-content'
              : 'text-sm text-content-muted'
          }
        >
          {warning && (
            <AlertTriangle aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0 text-amber-400 light:text-amber-700" />
          )}
          <span>{description}</span>
        </p>

        {children}

        <div className="space-y-1">
          <label htmlFor={reasonId} className="text-sm font-medium text-content">
            {t('admin.business.dialog.reasonLabel')}
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, ADMIN_REASON_MAX_LENGTH))}
            maxLength={ADMIN_REASON_MAX_LENGTH}
            rows={2}
            disabled={busy}
            aria-describedby={counterId}
            className="w-full rounded-lg bg-surface-sunken border border-hairline px-3 py-2 text-content resize-none"
          />
          <p id={counterId} className="text-xs text-content-muted text-right">
            {t('admin.business.dialog.reasonCounter', {
              count: String(reason.length),
              max: String(ADMIN_REASON_MAX_LENGTH),
            })}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400 light:text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy} className="min-h-11">
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={confirm}
            isLoading={busy}
            className={warning ? 'min-h-11 bg-red-600 bg-none hover:bg-red-700' : 'min-h-11'}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface ChangeTaxIdDialogProps {
  providerId: string;
  business: AdminBusiness;
  onClose: () => void;
  onDone: () => Promise<void>;
}

type ChangeField = 'vatNumber' | 'legalName' | 'affiliationNumber';

/**
 * Change a company's admin-owned fields. The form starts from what is stored and sends all of
 * them: the new state is exactly what the admin saw and confirmed. The tax id goes as bare
 * digits; an empty affiliation number is sent as null (cleared, as at signup).
 */
function ChangeTaxIdDialog({ providerId, business, onClose, onDone }: ChangeTaxIdDialogProps) {
  const { t } = useI18n();
  const [vatNumber, setVatNumber] = useState(business.vatNumber);
  const [legalName, setLegalName] = useState(business.legalName);
  const [legalForm, setLegalForm] = useState<BusinessLegalForm>(business.legalForm ?? 'company');
  const [affiliationNumber, setAffiliationNumber] = useState(business.affiliationNumber);
  const [errors, setErrors] = useState<Partial<Record<ChangeField, MessageKey>>>({});
  const vatRef = useRef<HTMLInputElement>(null);
  const legalNameRef = useRef<HTMLInputElement>(null);
  const affiliationRef = useRef<HTMLInputElement>(null);
  const ids = {
    vatNumber: useId(),
    vatHint: useId(),
    legalName: useId(),
    legalForm: useId(),
    affiliationNumber: useId(),
  };

  const validate = (): boolean => {
    const next: Partial<Record<ChangeField, MessageKey>> = {};
    const vat = vatNumber.trim();
    if (!vat) next.vatNumber = 'provider.business.error.vatRequired';
    else if (!isValidItalianVat(vat)) next.vatNumber = 'provider.business.error.vatInvalid';
    const name = legalName.trim();
    if (!name) next.legalName = 'provider.business.error.legalNameRequired';
    else if (name.length > BUSINESS_FIELD_LIMITS.legalName) next.legalName = 'provider.business.error.nameInvalid';
    if (affiliationNumber.trim().length > BUSINESS_FIELD_LIMITS.affiliationNumber) {
      next.affiliationNumber = 'provider.business.error.affiliationInvalid';
    }
    setErrors(next);
    const first = (['vatNumber', 'legalName', 'affiliationNumber'] as const).find((f) => next[f]);
    if (first) {
      const focusTarget = { vatNumber: vatRef, legalName: legalNameRef, affiliationNumber: affiliationRef }[first];
      focusTarget.current?.focus();
    }
    return !first;
  };

  const fieldError = (field: ChangeField) =>
    errors[field] ? (
      <p id={`${ids[field]}-error`} className="text-xs text-red-400 light:text-red-700">
        {t(errors[field]!)}
      </p>
    ) : null;
  const describedBy = (field: ChangeField, extra?: string) =>
    [extra, errors[field] ? `${ids[field]}-error` : undefined].filter(Boolean).join(' ') || undefined;
  const inputClass =
    'w-full min-h-11 rounded-lg bg-surface-sunken border border-hairline px-3 py-2 text-content aria-[invalid=true]:border-red-500';

  return (
    <ActionDialog
      title={t('admin.business.change.title')}
      description={t('admin.business.change.description')}
      confirmLabel={t('admin.business.change.confirm')}
      onClose={onClose}
      validate={validate}
      onConfirm={async (reason) => {
        const affiliation = affiliationNumber.trim();
        await updateBusinessTaxId({
          providerId,
          vatNumber: normalizeVatNumber(vatNumber),
          legalName: legalName.trim(),
          legalForm,
          affiliationNumber: affiliation ? affiliation : null,
          ...(reason ? { reason } : {}),
        });
        await onDone();
      }}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={ids.vatNumber} className="text-sm font-medium text-content">
            {t('provider.business.field.vatNumber')}
          </label>
          <input
            ref={vatRef}
            id={ids.vatNumber}
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={errors.vatNumber ? true : undefined}
            aria-describedby={describedBy('vatNumber', ids.vatHint)}
            className={`${inputClass} font-mono`}
          />
          <p id={ids.vatHint} className="text-xs text-content-muted">
            {t('provider.business.hint.vatNumber')}
          </p>
          {fieldError('vatNumber')}
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.legalName} className="text-sm font-medium text-content">
            {t('provider.business.field.legalName')}
          </label>
          <input
            ref={legalNameRef}
            id={ids.legalName}
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            autoComplete="off"
            aria-invalid={errors.legalName ? true : undefined}
            aria-describedby={describedBy('legalName')}
            className={inputClass}
          />
          {fieldError('legalName')}
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.legalForm} className="text-sm font-medium text-content">
            {t('provider.business.field.legalForm')}
          </label>
          <select
            id={ids.legalForm}
            value={legalForm}
            onChange={(e) => setLegalForm(e.target.value as BusinessLegalForm)}
            className={inputClass}
          >
            {BUSINESS_LEGAL_FORMS.map((form) => (
              <option key={form} value={form}>
                {t(LEGAL_FORM_LABEL[form])}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.affiliationNumber} className="text-sm font-medium text-content">
            {t('provider.business.field.affiliationNumber')}
          </label>
          <input
            ref={affiliationRef}
            id={ids.affiliationNumber}
            value={affiliationNumber}
            onChange={(e) => setAffiliationNumber(e.target.value)}
            autoComplete="off"
            aria-invalid={errors.affiliationNumber ? true : undefined}
            aria-describedby={describedBy('affiliationNumber')}
            className={inputClass}
          />
          {fieldError('affiliationNumber')}
        </div>
      </div>
    </ActionDialog>
  );
}

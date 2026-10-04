'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Briefcase, Clock, CheckCircle, XCircle } from 'lucide-react';
import { applicationOutcomeStatus, providerCardState } from '@/lib/providerStatus';
import { useProviderStatus, useSubmitProviderApplication } from '@/hooks/useProviderApplication';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { CategoryLeafPicker } from '@/components/provider/CategoryLeafPicker';
import { ProviderTypeChoice } from '@/components/provider/ProviderTypeChoice';
import {
  BusinessDetailsForm,
  type BusinessDetailsFormHandle,
} from '@/components/provider/BusinessDetailsForm';
import { PROVIDER_APPLICATION_ERRORS, providerApplicationErrorCode } from '@/lib/providerApplicationErrors';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import type { ProviderType } from '@/types/firebase';

export function BecomeProviderCard() {
  const { t } = useI18n();
  const role = useAuthStore((s) => s.user?.role);
  const storedProviderType = useAuthStore((s) => s.user?.providerType);
  const status = useProviderStatus();
  const submit = useSubmitProviderApplication();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [providerType, setProviderType] = useState<ProviderType>('individual');
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const businessFormRef = useRef<BusinessDetailsFormHandle>(null);

  // The auth user is reloaded after a successful application, but that read can lag (or fail):
  // until it shows the application, the callable's answer picks the approved or pending card.
  const outcome = applicationOutcomeStatus(submit.data);
  const variant = providerCardState(status === 'none' && outcome ? outcome : status);
  const isBusiness = storedProviderType === 'business' || submit.data?.providerType === 'business';

  // The verified card is a way IN to the provider area, not an application CTA, so it is
  // checked before the role guard below. Guarding first hid it from anyone whose role had
  // been promoted to 'provider' — which is to say, from every trainer who needed it. That
  // left /profile with no route to /provider/* at all.
  if (variant === 'verified') {
    return (
      <Link
        href="/provider/dashboard"
        className="flex items-center gap-3 rounded-xl border border-hairline p-4 hover:bg-surface-2"
      >
        <CheckCircle className="w-5 h-5 text-[#10B981]" />
        <div>
          <p className="text-content font-medium">{t('provider.card.verified.title')}</p>
          <p className="text-sm text-content-muted">{t('provider.card.verified.subtitle')}</p>
        </div>
      </Link>
    );
  }

  // Only customers can apply to become a provider. Admins and superadmins don't see the
  // CTA. (Applicants keep role 'customer' until approval promotes them, so their
  // pending/rejected states still render correctly.)
  if (role !== 'customer') return null;

  if (variant === 'pending') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4">
        <Clock className="w-5 h-5 shrink-0 text-[#F59E0B]" />
        <div className="min-w-0">
          <p className="text-content font-medium">{t('provider.card.pending.title')}</p>
          <p className="text-sm text-content-muted break-words">
            {/* A company is never approved on the spot: say what is being checked. */}
            {t(isBusiness ? 'provider.card.pending.subtitleBusiness' : 'provider.card.pending.subtitle')}
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'rejected') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-hairline p-4">
        <XCircle className="w-5 h-5 text-[#EF4444]" />
        <div>
          <p className="text-content font-medium">{t('provider.card.rejected.title')}</p>
          <p className="text-sm text-content-muted">{t('provider.card.rejected.subtitle')}</p>
        </div>
      </div>
    );
  }

  /** A failed application: on its company field when it has one, else under the form. */
  const reportError = (err: unknown) => {
    const code = providerApplicationErrorCode(err);
    if (code && providerType === 'business' && businessFormRef.current?.showServerError(code)) return;
    setErrorKey(code ? PROVIDER_APPLICATION_ERRORS[code].messageKey : 'provider.card.error');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    if (selected.length === 0 || submit.isPending) return;
    if (providerType === 'business') {
      // Shows the errors on their fields and focuses the first one when something is wrong.
      const business = await businessFormRef.current?.validate();
      if (!business) return;
      submit.mutate(
        { categoryIds: selected, providerType: 'business', business },
        { onError: reportError }
      );
    } else {
      submit.mutate(selected, { onError: reportError });
    }
  };

  // variant === 'cta'
  return (
    <div className="rounded-xl border border-hairline p-4">
      <div className="flex items-center gap-3">
        <Briefcase className="w-5 h-5 shrink-0 text-vfit-primary light:text-vfit-secondary" />
        <div className="min-w-0 flex-1">
          <p className="text-content font-medium">{t('provider.card.cta.title')}</p>
          <p className="text-sm text-content-muted">{t('provider.card.cta.subtitle')}</p>
        </div>
        {!open && <Button size="sm" onClick={() => setOpen(true)}>{t('provider.card.cta.start')}</Button>}
      </div>

      {open && (
        <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
          <ProviderTypeChoice value={providerType} onChange={setProviderType} disabled={submit.isPending} />
          {/* Hidden, not unmounted: switching back and forth keeps what was typed. */}
          <div hidden={providerType !== 'business'}>
            <BusinessDetailsForm ref={businessFormRef} mode="create" disabled={submit.isPending} />
          </div>
          <div>
            <p className="text-sm text-content-muted mb-2">{t('provider.optIn.pickServices')}</p>
            <CategoryLeafPicker value={selected} onChange={setSelected} />
          </div>
          <div aria-live="polite">
            {errorKey && <p className="text-sm text-error break-words">{t(errorKey)}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" className="min-h-11" disabled={selected.length === 0 || submit.isPending}>
              {submit.isPending ? t('provider.card.submitting') : t('provider.card.submit')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                submit.reset();
                setErrorKey(null);
                setOpen(false);
              }}
            >
              {t('provider.card.cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

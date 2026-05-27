'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, Clock, CheckCircle, XCircle } from 'lucide-react';
import { SERVICE_CATEGORIES } from '@/lib/serviceCategories';
import { providerCardState } from '@/lib/providerStatus';
import { useProviderStatus, useSubmitProviderApplication } from '@/hooks/useProviderApplication';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export function BecomeProviderCard() {
  const { t } = useI18n();
  const status = useProviderStatus();
  const variant = providerCardState(status);
  const submit = useSubmitProviderApplication();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');

  if (variant === 'verified') {
    return (
      <Link
        href="/provider/dashboard"
        className="flex items-center gap-3 rounded-xl border border-white/10 p-4 hover:bg-white/5"
      >
        <CheckCircle className="w-5 h-5 text-[#10B981]" />
        <div>
          <p className="text-white font-medium">{t('provider.card.verified.title')}</p>
          <p className="text-sm text-white/50">{t('provider.card.verified.subtitle')}</p>
        </div>
      </Link>
    );
  }

  if (variant === 'pending') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4">
        <Clock className="w-5 h-5 text-[#F59E0B]" />
        <div>
          <p className="text-white font-medium">{t('provider.card.pending.title')}</p>
          <p className="text-sm text-white/60">{t('provider.card.pending.subtitle')}</p>
        </div>
      </div>
    );
  }

  if (variant === 'rejected') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 p-4">
        <XCircle className="w-5 h-5 text-[#EF4444]" />
        <div>
          <p className="text-white font-medium">{t('provider.card.rejected.title')}</p>
          <p className="text-sm text-white/60">{t('provider.card.rejected.subtitle')}</p>
        </div>
      </div>
    );
  }

  // variant === 'cta'
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-3">
        <Briefcase className="w-5 h-5 text-vfit-primary" />
        <div className="flex-1">
          <p className="text-white font-medium">{t('provider.card.cta.title')}</p>
          <p className="text-sm text-white/50">{t('provider.card.cta.subtitle')}</p>
        </div>
        {!open && <Button size="sm" onClick={() => setOpen(true)}>{t('provider.card.cta.start')}</Button>}
      </div>

      {open && (
        <div className="mt-4">
          <p className="text-sm text-white/60 mb-2">{t('provider.optIn.pickType')}</p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.name)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm border transition-colors',
                  category === c.name
                    ? 'border-vfit-primary bg-vfit-primary/10 text-white'
                    : 'border-white/10 text-white/70 hover:bg-white/5'
                )}
              >
                <span className="mr-1">{c.icon}</span>{c.name}
              </button>
            ))}
          </div>
          {submit.isError && (
            <p className="text-sm text-[#EF4444] mt-2">{t('provider.card.error')}</p>
          )}
          <div className="flex gap-2 mt-4">
            <Button size="sm" disabled={!category || submit.isPending} onClick={() => submit.mutate(category)}>
              {submit.isPending ? t('provider.card.submitting') : t('provider.card.submit')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { submit.reset(); setOpen(false); }}>{t('provider.card.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

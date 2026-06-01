'use client';

import { useMemo, useState } from 'react';
import { Copy, Gift, Users } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

interface ReferralEntry {
  id: string;
  name: string;
  status: 'invited' | 'registered' | 'vip_activated';
  reward: number;
}

const REFERRAL_ENTRIES: ReferralEntry[] = [
  { id: 'r1', name: 'Francesca', status: 'registered', reward: 10 },
  { id: 'r2', name: 'Lorenzo', status: 'vip_activated', reward: 25 },
  { id: 'r3', name: 'Marta', status: 'invited', reward: 0 },
];

const STATUS_LABELS: Record<ReferralEntry['status'], MessageKey> = {
  invited: 'referral.status.invited',
  registered: 'referral.status.registered',
  vip_activated: 'referral.status.vip_activated',
};

export default function ReferralPage() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const referralCode = 'VFIT-HIDRAN-2026';

  const totalReward = useMemo(
    () => REFERRAL_ENTRIES.reduce((sum, entry) => sum + entry.reward, 0),
    []
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="container-mobile py-6 space-y-4 pb-20">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-section-primary" />
          <h1 className="text-2xl font-bold text-text-inverse">{t('referral.title')}</h1>
        </div>
        <p className="text-sm text-text-secondary">
          {t('referral.subtitle')}
        </p>
      </header>

      <section className="rounded-2xl border border-hairline bg-surface-2 p-4">
        <p className="text-xs uppercase tracking-wide text-text-tertiary">{t('referral.yourCode')}</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="rounded-xl border border-white/15 bg-surface-sunken px-3 py-2 text-sm text-text-inverse">
            {referralCode}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text-inverse"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? t('referral.copied') : t('referral.copy')}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-hairline bg-surface-2 p-4">
          <p className="text-xs text-text-tertiary">{t('referral.invites')}</p>
          <p className="mt-1 text-xl font-bold text-text-inverse">{REFERRAL_ENTRIES.length}</p>
        </div>
        <div className="rounded-2xl border border-hairline bg-surface-2 p-4">
          <p className="text-xs text-text-tertiary">{t('referral.rewards')}</p>
          <p className="mt-1 text-xl font-bold text-section-primary">{formatPrice(totalReward)}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
          {t('referral.history')}
        </h2>
        {REFERRAL_ENTRIES.map((entry) => (
          <article key={entry.id} className="rounded-2xl border border-hairline bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-section-primary" />
                <p className="font-medium text-text-inverse">{entry.name}</p>
              </div>
              <span className="text-xs text-text-tertiary">{t(STATUS_LABELS[entry.status])}</span>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              {t('referral.reward', {
                value: entry.reward > 0 ? formatPrice(entry.reward) : t('referral.pending'),
              })}
            </p>
          </article>
        ))}
      </section>

      <Button className="w-full">{t('referral.inviteNow')}</Button>
    </div>
  );
}

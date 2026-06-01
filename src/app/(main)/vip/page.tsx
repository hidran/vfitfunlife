'use client';

import { useState } from 'react';
import { Check, Crown, Sparkles } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

interface VipPlan {
  id: string;
  nameKey: MessageKey;
  monthlyPrice: number;
  yearlyPrice: number;
  highlight?: boolean;
  benefitKeys: MessageKey[];
}

const VIP_PLANS: VipPlan[] = [
  {
    id: 'starter',
    nameKey: 'vip.plan.starter.name',
    monthlyPrice: 9.9,
    yearlyPrice: 89,
    benefitKeys: [
      'vip.plan.starter.benefit1',
      'vip.plan.starter.benefit2',
      'vip.plan.starter.benefit3',
    ],
  },
  {
    id: 'pro',
    nameKey: 'vip.plan.pro.name',
    monthlyPrice: 19.9,
    yearlyPrice: 179,
    highlight: true,
    benefitKeys: [
      'vip.plan.pro.benefit1',
      'vip.plan.pro.benefit2',
      'vip.plan.pro.benefit3',
      'vip.plan.pro.benefit4',
    ],
  },
];

export default function VipPage() {
  const { t } = useI18n();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<string>('pro');

  return (
    <div className="container-mobile py-6 space-y-4 pb-20">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-warning" />
          <h1 className="text-2xl font-bold text-text-inverse">{t('vip.title')}</h1>
        </div>
        <p className="text-sm text-text-secondary">
          {t('vip.subtitle')}
        </p>
      </header>

      <section className="rounded-2xl border border-warning/30 bg-warning/15 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-warning">
          <Sparkles className="h-4 w-4" />
          {t('vip.promoTrial')}
        </p>
      </section>

      <section className="inline-flex rounded-full border border-hairline bg-surface-2 p-1">
        <button
          type="button"
          onClick={() => setBilling('monthly')}
          className={cn(
            'rounded-full px-4 py-2 text-xs font-semibold transition-colors',
            billing === 'monthly' ? 'bg-section-primary text-background-dark' : 'text-text-secondary'
          )}
        >
          {t('vip.billing.monthly')}
        </button>
        <button
          type="button"
          onClick={() => setBilling('yearly')}
          className={cn(
            'rounded-full px-4 py-2 text-xs font-semibold transition-colors',
            billing === 'yearly' ? 'bg-section-primary text-background-dark' : 'text-text-secondary'
          )}
        >
          {t('vip.billing.yearly')}
        </button>
      </section>

      <section className="space-y-3">
        {VIP_PLANS.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const price = billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice / 12;
          return (
            <article
              key={plan.id}
              className={cn(
                'rounded-2xl border p-4 transition-colors',
                isSelected
                  ? 'border-section-primary bg-section-primary/10'
                  : 'border-hairline bg-surface-2'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-text-inverse">{t(plan.nameKey)}</p>
                  <p className="text-sm text-text-secondary">
                    {t('vip.pricePerMonth', { price: formatPrice(price) })}
                  </p>
                </div>
                {plan.highlight && (
                  <span className="rounded-full bg-warning/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
                    {t('vip.recommended')}
                  </span>
                )}
              </div>

              <ul className="mt-3 space-y-2">
                {plan.benefitKeys.map((benefitKey) => (
                  <li key={benefitKey} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Check className="h-4 w-4 text-success" />
                    {t(benefitKey)}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-4 w-full"
                variant={isSelected ? 'primary' : 'secondary'}
                onClick={() => setSelectedPlan(plan.id)}
              >
                {isSelected ? t('vip.selected') : t('vip.selectPlan')}
              </Button>
            </article>
          );
        })}
      </section>

      <Button className="w-full">
        {t('vip.activate', {
          name: t(VIP_PLANS.find((plan) => plan.id === selectedPlan)?.nameKey ?? 'vip.plan.pro.name'),
        })}
      </Button>
    </div>
  );
}

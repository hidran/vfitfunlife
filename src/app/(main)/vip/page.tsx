'use client';

import { useState } from 'react';
import { Check, Crown, Sparkles } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface VipPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  highlight?: boolean;
  benefits: string[];
}

const VIP_PLANS: VipPlan[] = [
  {
    id: 'starter',
    name: 'VIP Starter',
    monthlyPrice: 9.9,
    yearlyPrice: 89,
    benefits: [
      'Sconto 5% su servizi selezionati',
      'Notifiche prioritarie booking',
      'Accesso promo mensili',
    ],
  },
  {
    id: 'pro',
    name: 'VIP Pro',
    monthlyPrice: 19.9,
    yearlyPrice: 179,
    highlight: true,
    benefits: [
      'Sconto 12% su tutto il catalogo',
      'Supporto prioritario',
      'Accesso anticipato ad eventi VFun',
      'Doppio accumulo punti reward',
    ],
  },
];

export default function VipPage() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<string>('pro');

  return (
    <div className="container-mobile py-6 space-y-4 pb-20">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-warning" />
          <h1 className="text-2xl font-bold text-text-inverse">Programma VIP</h1>
        </div>
        <p className="text-sm text-text-secondary">
          Sblocca vantaggi esclusivi su booking, eventi e priorita assistenza.
        </p>
      </header>

      <section className="rounded-2xl border border-warning/30 bg-warning/15 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-warning">
          <Sparkles className="h-4 w-4" />
          Promo attiva: 7 giorni prova VIP Pro
        </p>
      </section>

      <section className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setBilling('monthly')}
          className={cn(
            'rounded-full px-4 py-2 text-xs font-semibold transition-colors',
            billing === 'monthly' ? 'bg-section-primary text-background-dark' : 'text-text-secondary'
          )}
        >
          Mensile
        </button>
        <button
          type="button"
          onClick={() => setBilling('yearly')}
          className={cn(
            'rounded-full px-4 py-2 text-xs font-semibold transition-colors',
            billing === 'yearly' ? 'bg-section-primary text-background-dark' : 'text-text-secondary'
          )}
        >
          Annuale
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
                  : 'border-white/10 bg-white/5'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-text-inverse">{plan.name}</p>
                  <p className="text-sm text-text-secondary">
                    {formatPrice(price)}/mese
                  </p>
                </div>
                {plan.highlight && (
                  <span className="rounded-full bg-warning/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
                    Consigliato
                  </span>
                )}
              </div>

              <ul className="mt-3 space-y-2">
                {plan.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Check className="h-4 w-4 text-success" />
                    {benefit}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-4 w-full"
                variant={isSelected ? 'primary' : 'secondary'}
                onClick={() => setSelectedPlan(plan.id)}
              >
                {isSelected ? 'Selezionato' : 'Seleziona piano'}
              </Button>
            </article>
          );
        })}
      </section>

      <Button className="w-full">
        Attiva {VIP_PLANS.find((plan) => plan.id === selectedPlan)?.name}
      </Button>
    </div>
  );
}

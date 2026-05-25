'use client';

import Link from 'next/link';
import { Clock, Home, MapPin, ShieldCheck, Star } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useHomeTrainingServices } from '@/hooks/useFitness';
import { Spinner } from '@/components/ui/Spinner';

export default function HomeTrainingPage() {
  const { t } = useI18n();
  const { data: services = [], isLoading } = useHomeTrainingServices();

  return (
    <div className="container-mobile py-6 pb-24 space-y-5">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <h1 className="text-2xl font-display font-bold text-text-inverse">{t('fit.homeTraining.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t('fit.homeTraining.subtitle')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/booking"
            className="rounded-full bg-section-primary px-4 py-2 text-xs font-semibold text-background-dark"
          >
            {t('fit.homeTraining.startBooking')}
          </Link>
          <Link
            href="/profile/addresses"
            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-text-inverse"
          >
            {t('fit.homeTraining.manageAddresses')}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-text-inverse">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          {t('fit.homeTraining.certifiedBanner')}
        </p>
      </section>

      <section className="space-y-3">
        {isLoading ? (
          <Spinner size="md" />
        ) : (
          services.map((service) => (
            <article key={service.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold text-text-inverse">{service.title}</h2>
              <p className="mt-1 text-xs text-text-tertiary">{service.coach}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                <span className="inline-flex items-center gap-1">
                  <Home className="h-3.5 w-3.5" />
                  {t('fit.homeTraining.serviceAtHome')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {service.eta}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-yellow-400" />
                  {service.rating.toFixed(1)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-section-primary">{service.fromPrice}</span>
                <Link
                  href="/booking"
                  className="rounded-full bg-section-primary/20 px-3 py-1.5 text-xs font-semibold text-section-primary"
                >
                  {t('fit.homeTraining.book')}
                </Link>
              </div>
            </article>
          ))
        )}
      </section>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-text-tertiary">
        <p className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {t('fit.homeTraining.coverage')}
        </p>
      </div>
    </div>
  );
}

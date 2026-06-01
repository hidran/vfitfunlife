'use client';

import Link from 'next/link';
import { MonitorPlay, Play, Signal, Star, Timer } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useVirtualPrograms } from '@/hooks/useFitness';
import { Spinner } from '@/components/ui/Spinner';

export default function FitVirtualPage() {
  const { t } = useI18n();
  const { data: programs = [], isLoading } = useVirtualPrograms();

  return (
    <div className="container-mobile py-6 pb-24 space-y-5">
      <section className="rounded-3xl border border-hairline bg-surface-2 p-5">
        <h1 className="text-2xl font-display font-bold text-text-inverse">{t('fit.virtual.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t('fit.virtual.subtitle')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/booking"
            className="rounded-full bg-section-primary px-4 py-2 text-xs font-semibold text-background-dark"
          >
            {t('fit.virtual.bookSession')}
          </Link>
          <Link
            href="/bookings"
            className="rounded-full border border-white/20 bg-surface-2 px-4 py-2 text-xs font-semibold text-text-inverse"
          >
            {t('fit.virtual.viewCalendar')}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-text-inverse">
          <Signal className="h-4 w-4 text-red-300" />
          {t('fit.virtual.liveChannelActive', { count: 2 })}
        </p>
      </section>

      <section className="space-y-3">
        {isLoading ? (
          <Spinner size="md" />
        ) : (
          programs.map((program) => (
            <article key={program.id} className="rounded-2xl border border-hairline bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-text-inverse">{program.title}</h2>
                {program.live && (
                  <span className="rounded-full bg-red-500/80 px-2 py-1 text-[10px] font-semibold uppercase text-white">
                    {t('common.live')}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                <span className="inline-flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" />
                  {program.durationMinutes} min
                </span>
                <span className="inline-flex items-center gap-1">
                  <MonitorPlay className="h-3.5 w-3.5" />
                  {program.level}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-yellow-400" />
                  {program.rating.toFixed(1)}
                </span>
              </div>
              <Link
                href="/booking"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-section-primary/20 px-4 py-2 text-sm font-semibold text-section-primary"
              >
                <Play className="h-4 w-4" />
                {t('fit.virtual.startProgram')}
              </Link>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Calendar, Clock, Filter, Star, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

type ClassCategory = 'all' | 'yoga' | 'hiit' | 'pilates' | 'functional';

interface FitnessClassItem {
  id: string;
  title: string;
  category: Exclude<ClassCategory, 'all'>;
  trainer: string;
  time: string;
  duration: string;
  spotsLeft: number;
  rating: number;
}

const classes: FitnessClassItem[] = [
  {
    id: 'c1',
    title: 'Morning Power Yoga',
    category: 'yoga',
    trainer: 'Elisa Serra',
    time: '08:30',
    duration: '60 min',
    spotsLeft: 6,
    rating: 4.8,
  },
  {
    id: 'c2',
    title: 'HIIT Burn',
    category: 'hiit',
    trainer: 'Marco Vitali',
    time: '12:15',
    duration: '45 min',
    spotsLeft: 4,
    rating: 4.9,
  },
  {
    id: 'c3',
    title: 'Pilates Core Flow',
    category: 'pilates',
    trainer: 'Giulia Neri',
    time: '17:30',
    duration: '50 min',
    spotsLeft: 8,
    rating: 4.7,
  },
  {
    id: 'c4',
    title: 'Functional Circuit',
    category: 'functional',
    trainer: 'Andrea Rossi',
    time: '19:00',
    duration: '55 min',
    spotsLeft: 3,
    rating: 4.8,
  },
];

export default function FitClassesPage() {
  const [category, setCategory] = useState<ClassCategory>('all');
  const { t } = useI18n();

  const categoryLabels = useMemo<Record<ClassCategory, string>>(
    () => ({
      all: t('fit.classes.category.all'),
      yoga: t('fit.classes.category.yoga'),
      hiit: t('fit.classes.category.hiit'),
      pilates: t('fit.classes.category.pilates'),
      functional: t('fit.classes.category.functional'),
    }),
    [t]
  );

  const filteredClasses = useMemo(() => {
    if (category === 'all') return classes;
    return classes.filter((item) => item.category === category);
  }, [category]);

  return (
    <div className="container-mobile py-6 pb-24 space-y-5">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <h1 className="text-2xl font-display font-bold text-text-inverse">{t('fit.classes.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t('fit.classes.subtitle')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/bookings"
            className="rounded-full bg-section-primary px-4 py-2 text-xs font-semibold text-background-dark"
          >
            {t('fit.classes.myBookings')}
          </Link>
          <Link
            href="/fit/gyms"
            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-text-inverse"
          >
            {t('fit.classes.viewGyms')}
          </Link>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        {Object.keys(categoryLabels).map((value) => {
          const key = value as ClassCategory;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                category === key
                  ? 'border-section-primary bg-section-primary text-background-dark'
                  : 'border-white/15 bg-white/5 text-text-tertiary'
              )}
            >
              {categoryLabels[key]}
            </button>
          );
        })}
      </section>

      <section className="space-y-3">
        {filteredClasses.map((item) => (
          <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text-inverse">{item.title}</h2>
                <p className="mt-1 text-xs text-text-tertiary">{item.trainer}</p>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase text-text-tertiary">
                {categoryLabels[item.category]}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {item.time} · {item.duration}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {t('fit.classes.spots', { count: item.spotsLeft })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-yellow-400" />
                {item.rating.toFixed(1)}
              </span>
            </div>
            <Link
              href="/booking"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-section-primary/20 px-4 py-2 text-sm font-semibold text-section-primary"
            >
              <Calendar className="h-4 w-4" />
              {t('fit.classes.bookClass')}
            </Link>
          </article>
        ))}
      </section>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-text-tertiary">
        <p className="inline-flex items-center gap-2">
          <Filter className="h-4 w-4" />
          {t('fit.classes.realtimeNote')}
        </p>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, Clock, MapPin, Star } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { useVenue, useVenueServices, useVenueCourses } from '@/hooks/useVenues';
import { amenityIcon } from '@/lib/icons/amenityIcons';
import { VenueNotFound } from '@/components/venue/VenueNotFound';
import { Spinner } from '@/components/ui/Spinner';

type TabOption = 'services' | 'classes';

export default function VenueDetailClient() {
  const searchParams = useSearchParams();
  const id = searchParams?.get('id') ?? undefined;

  const venueQuery = useVenue(id);
  const servicesQuery = useVenueServices(id);
  const coursesQuery = useVenueCourses(id);

  const [activeSlide, setActiveSlide] = useState(0);
  const [showAllHours, setShowAllHours] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [activeTab, setActiveTab] = useState<TabOption>('services');

  if (!id) {
    return <VenueNotFound message="Venue non specificato" />;
  }

  if (venueQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-dark">
        <Spinner size="md" />
      </div>
    );
  }

  const venue = venueQuery.data;
  if (!venue) {
    return <VenueNotFound onRetry={() => venueQuery.refetch()} />;
  }

  const slides = venue.heroGradients ?? [];
  const services = servicesQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const visibleHours = showAllHours ? venue.hours : venue.hours.slice(0, 1);

  return (
    <div className="min-h-screen bg-background-dark pb-24">
      <div className="relative">
        <div className="absolute left-4 top-4 z-10">
          <Link
            href="/fit/gyms"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-background-dark/80 text-text-inverse"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>

        <div className="relative h-72 overflow-hidden">
          {slides.map((gradient, idx) => (
            <div
              key={idx}
              className={cn(
                'absolute inset-0 bg-gradient-to-br transition-opacity duration-500',
                gradient,
                activeSlide === idx ? 'opacity-100' : 'opacity-0'
              )}
              onClick={() => setActiveSlide((activeSlide + 1) % Math.max(slides.length, 1))}
            />
          ))}
        </div>
      </div>

      <div className="-mt-6 rounded-t-3xl bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{venue.name}</h1>
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="h-3.5 w-3.5" />
              {venue.address}
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
            <Star className="h-3.5 w-3.5 fill-current" />
            {venue.rating.toFixed(1)} <span className="text-yellow-600/70">({venue.reviewCount})</span>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Clock className="h-4 w-4" /> Orari
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {visibleHours.map((h) => (
              <li key={h.day} className="flex justify-between">
                <span>{h.day}</span>
                <span>{h.time}</span>
              </li>
            ))}
          </ul>
          {venue.hours.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllHours((v) => !v)}
              className="mt-2 text-xs font-medium text-vfit-accent"
            >
              {showAllHours ? 'Mostra meno' : `Tutti gli orari (${venue.hours.length})`}
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {venue.amenities.map((a) => {
            const Icon = amenityIcon(a.kind);
            return (
              <span
                key={a.kind}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
              >
                <Icon className="h-3.5 w-3.5" /> {a.kind.replace(/_/g, ' ')}
              </span>
            );
          })}
        </div>

        <p className={cn('mt-4 text-sm text-slate-600', !showDescription && 'line-clamp-3')}>
          {venue.description}
        </p>
        {venue.description.length > 160 && (
          <button
            type="button"
            onClick={() => setShowDescription((v) => !v)}
            className="mt-1 text-xs font-medium text-vfit-accent"
          >
            {showDescription ? 'Mostra meno' : 'Leggi tutto'}
          </button>
        )}

        <div className="mt-6 flex gap-2 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab('services')}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              activeTab === 'services'
                ? 'border-vfit-accent text-vfit-accent'
                : 'border-transparent text-slate-500'
            )}
          >
            Servizi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('classes')}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              activeTab === 'classes'
                ? 'border-vfit-accent text-vfit-accent'
                : 'border-transparent text-slate-500'
            )}
          >
            Corsi
          </button>
        </div>

        {activeTab === 'services' && (
          <ul className="mt-3 space-y-2">
            {servicesQuery.isLoading && <Spinner size="sm" />}
            {services.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3"
              >
                <span className="text-sm font-medium text-slate-800">{s.name}</span>
                <span className="text-sm font-semibold text-slate-900">{formatPrice(s.price)}</span>
              </li>
            ))}
            {!servicesQuery.isLoading && services.length === 0 && (
              <li className="text-sm text-slate-500">Nessun servizio disponibile.</li>
            )}
          </ul>
        )}

        {activeTab === 'classes' && (
          <ul className="mt-3 space-y-2">
            {coursesQuery.isLoading && <Spinner size="sm" />}
            {courses.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.time} · {c.coach}
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-700">{c.spots} posti</span>
              </li>
            ))}
            {!coursesQuery.isLoading && courses.length === 0 && (
              <li className="text-sm text-slate-500">Nessun corso programmato.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

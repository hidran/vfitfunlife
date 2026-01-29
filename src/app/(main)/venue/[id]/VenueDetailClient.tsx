'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  Clock,
  MapPin,
  Star,
} from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { venues } from './data';

type TabOption = 'services' | 'classes';

export default function VenueDetailClient({ id }: { id: string }) {
  const venue = useMemo(
    () => venues.find((item) => item.id === id) ?? venues[0],
    [id]
  );
  const [activeSlide, setActiveSlide] = useState(0);
  const [showAllHours, setShowAllHours] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [activeTab, setActiveTab] = useState<TabOption>('services');

  const slides = venue.hero;

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

        <div
          className={cn(
            'relative h-64 w-full bg-gradient-to-br',
            slides[activeSlide]
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.22),_transparent_65%)]" />
          <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-background-dark/80 px-3 py-1 text-xs text-text-inverse">
            <Star className="h-3 w-3 text-yellow-400" />
            {venue.rating.toFixed(1)} ({venue.reviews})
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveSlide(index)}
              className={cn(
                'h-2 w-6 rounded-full transition-all',
                activeSlide === index
                  ? 'bg-section-primary'
                  : 'bg-white/30'
              )}
              aria-label={`Slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      <div className="container-mobile -mt-10 space-y-6">
        <section className="rounded-3xl border border-white/10 bg-background-dark/90 p-5 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-text-inverse">
                {venue.name}
              </h1>
              <p className="text-sm text-text-tertiary">{venue.address}</p>
            </div>
            {venue.partner && (
              <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase text-background-dark">
                Partner
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-section-primary" />
              <span>{venue.address}</span>
            </div>
            <button
              type="button"
              className="rounded-full border border-section-primary/40 px-3 py-1 text-section-primary"
            >
              Indicazioni
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-inverse">Orari di apertura</p>
              <p className="text-xs text-text-tertiary">Aperto oggi</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAllHours((value) => !value)}
              className="text-xs font-semibold text-section-primary"
            >
              {showAllHours ? 'Nascondi' : 'Vedi tutto'}
            </button>
          </div>
          <div className="mt-3 space-y-2 text-xs text-text-tertiary">
            {(showAllHours ? venue.hours : venue.hours.slice(0, 2)).map((hour) => (
              <div key={hour.day} className="flex items-center justify-between">
                <span>{hour.day}</span>
                <span>{hour.time}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-text-inverse">Servizi inclusi</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {venue.amenities.map((amenity) => {
              const Icon = amenity.icon;
              return (
                <div
                  key={amenity.label}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-section-primary/15 text-section-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-text-inverse">
                    {amenity.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-inverse">Descrizione</p>
            <button
              type="button"
              onClick={() => setShowDescription((value) => !value)}
              className="text-xs font-semibold text-section-primary"
            >
              {showDescription ? 'Meno' : 'Altro'}
            </button>
          </div>
          <p className="mt-3 text-sm text-text-tertiary">
            {showDescription ? venue.description : `${venue.description.slice(0, 120)}...`}
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-background-dark/60 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('services')}
              className={cn(
                'flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                activeTab === 'services'
                  ? 'bg-section-primary text-background-dark'
                  : 'text-text-tertiary'
              )}
            >
              Servizi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('classes')}
              className={cn(
                'flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                activeTab === 'classes'
                  ? 'bg-section-primary text-background-dark'
                  : 'text-text-tertiary'
              )}
            >
              Corsi
            </button>
          </div>

          {activeTab === 'services' ? (
            <div className="mt-4 space-y-3">
              {venue.services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <span className="text-sm font-semibold text-text-inverse">
                    {service.name}
                  </span>
                  <span className="text-sm font-semibold text-section-primary">
                    {formatPrice(service.price)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {venue.courses.map((course) => (
                <div
                  key={course.name}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-section-primary/15 text-section-primary">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-inverse">
                        {course.name}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {course.time} · {course.coach}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-text-inverse">
                    {course.spots} posti
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <button
          type="button"
          className="w-full rounded-full bg-section-primary py-3 text-sm font-semibold text-background-dark"
        >
          Prenota adesso
        </button>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Clock, Home, MapPin, ShieldCheck, Star } from 'lucide-react';

interface HomeTrainingService {
  id: string;
  title: string;
  coach: string;
  eta: string;
  rating: number;
  fromPrice: string;
}

const services: HomeTrainingService[] = [
  {
    id: 'h1',
    title: 'Personal Training 1:1',
    coach: 'Luca Ferri',
    eta: 'Disponibile oggi 18:00',
    rating: 4.9,
    fromPrice: 'Da EUR 55',
  },
  {
    id: 'h2',
    title: 'Mobility & Recovery',
    coach: 'Giulia Neri',
    eta: 'Disponibile domani 09:30',
    rating: 4.8,
    fromPrice: 'Da EUR 49',
  },
  {
    id: 'h3',
    title: 'Functional Duo Session',
    coach: 'Andrea Rossi',
    eta: 'Disponibile domani 19:00',
    rating: 4.7,
    fromPrice: 'Da EUR 62',
  },
];

export default function HomeTrainingPage() {
  return (
    <div className="container-mobile py-6 pb-24 space-y-5">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <h1 className="text-2xl font-display font-bold text-text-inverse">A Domicilio</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Sessioni fitness a casa con professionisti verificati.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/booking"
            className="rounded-full bg-section-primary px-4 py-2 text-xs font-semibold text-background-dark"
          >
            Inizia prenotazione
          </Link>
          <Link
            href="/profile/addresses"
            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-text-inverse"
          >
            Gestisci indirizzi
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-text-inverse">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          Trainer certificati, check-in live e supporto dedicato.
        </p>
      </section>

      <section className="space-y-3">
        {services.map((service) => (
          <article key={service.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-text-inverse">{service.title}</h2>
            <p className="mt-1 text-xs text-text-tertiary">{service.coach}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
              <span className="inline-flex items-center gap-1">
                <Home className="h-3.5 w-3.5" />
                Servizio a domicilio
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
                Prenota
              </Link>
            </div>
          </article>
        ))}
      </section>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-text-tertiary">
        <p className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Copertura attiva su Milano, Monza, Sesto e hinterland.
        </p>
      </div>
    </div>
  );
}


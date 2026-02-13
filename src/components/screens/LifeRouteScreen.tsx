'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Clock,
  Home,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  Wind,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LIFE_ROUTE_CONTENT, type LifeRouteSlug } from '@/lib/featureRouteContent';

type SortBy = 'nearest' | 'rating' | 'price';
type ProviderSlug = Exclude<LifeRouteSlug, 'home-services' | 'centers' | 'hyperbaric'>;

interface LifeProvider {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  reviews: number;
  distanceKm: number;
  nextSlot: string;
  priceFrom: number;
  homeService: boolean;
}

interface WellnessCenter {
  id: string;
  name: string;
  city: string;
  rating: number;
  distanceKm: number;
  specialties: string[];
  isPartner: boolean;
}

const providerDirectory: Record<ProviderSlug, LifeProvider[]> = {
  osteopatia: [
    {
      id: 'osteo-1',
      name: 'Dr. Luca Ferri',
      specialty: 'Osteopatia posturale',
      rating: 4.9,
      reviews: 212,
      distanceKm: 1.4,
      nextSlot: 'Oggi 18:00',
      priceFrom: 65,
      homeService: true,
    },
    {
      id: 'osteo-2',
      name: 'Dott.ssa Elisa Serra',
      specialty: 'Osteopatia sportiva',
      rating: 4.8,
      reviews: 169,
      distanceKm: 2.2,
      nextSlot: 'Domani 10:30',
      priceFrom: 72,
      homeService: false,
    },
    {
      id: 'osteo-3',
      name: 'Marco Bellini',
      specialty: 'Dolore cervicale e lombare',
      rating: 4.7,
      reviews: 128,
      distanceKm: 3.5,
      nextSlot: 'Domani 17:15',
      priceFrom: 58,
      homeService: true,
    },
  ],
  fisioterapia: [
    {
      id: 'fizio-1',
      name: 'Centro Recovery+',
      specialty: 'Riabilitazione ortopedica',
      rating: 4.8,
      reviews: 241,
      distanceKm: 1.7,
      nextSlot: 'Oggi 16:30',
      priceFrom: 60,
      homeService: false,
    },
    {
      id: 'fizio-2',
      name: 'Giulia Costa',
      specialty: 'Fisioterapia neurologica',
      rating: 4.9,
      reviews: 184,
      distanceKm: 2.8,
      nextSlot: 'Domani 09:00',
      priceFrom: 74,
      homeService: true,
    },
    {
      id: 'fizio-3',
      name: 'Studio Movimento',
      specialty: 'Recupero funzionale',
      rating: 4.7,
      reviews: 95,
      distanceKm: 4.1,
      nextSlot: 'Domani 19:00',
      priceFrom: 52,
      homeService: false,
    },
  ],
  'mental-coach': [
    {
      id: 'mental-1',
      name: 'Sara Mendez',
      specialty: 'Performance mindset',
      rating: 4.9,
      reviews: 138,
      distanceKm: 1.1,
      nextSlot: 'Oggi 20:00',
      priceFrom: 55,
      homeService: false,
    },
    {
      id: 'mental-2',
      name: 'MindFlex Studio',
      specialty: 'Stress e focus professionale',
      rating: 4.8,
      reviews: 176,
      distanceKm: 2.9,
      nextSlot: 'Domani 12:00',
      priceFrom: 69,
      homeService: true,
    },
    {
      id: 'mental-3',
      name: 'Paolo Verri',
      specialty: 'Coaching individuale',
      rating: 4.6,
      reviews: 81,
      distanceKm: 3.8,
      nextSlot: 'Venerdi 09:30',
      priceFrom: 49,
      homeService: true,
    },
  ],
  psicologo: [
    {
      id: 'psy-1',
      name: 'Dott.ssa Anna Greco',
      specialty: 'Psicologia clinica',
      rating: 4.9,
      reviews: 260,
      distanceKm: 1.9,
      nextSlot: 'Domani 18:15',
      priceFrom: 80,
      homeService: false,
    },
    {
      id: 'psy-2',
      name: 'Centro Equilibrio',
      specialty: 'Psicoterapia breve',
      rating: 4.8,
      reviews: 194,
      distanceKm: 2.6,
      nextSlot: 'Domani 11:00',
      priceFrom: 72,
      homeService: false,
    },
    {
      id: 'psy-3',
      name: 'Lorenzo Dini',
      specialty: 'Supporto adolescenziale',
      rating: 4.7,
      reviews: 113,
      distanceKm: 4.4,
      nextSlot: 'Sabato 10:00',
      priceFrom: 68,
      homeService: true,
    },
  ],
  estetista: [
    {
      id: 'est-1',
      name: 'Glow House',
      specialty: 'Trattamenti viso premium',
      rating: 4.9,
      reviews: 322,
      distanceKm: 1.3,
      nextSlot: 'Oggi 17:00',
      priceFrom: 45,
      homeService: true,
    },
    {
      id: 'est-2',
      name: 'Nadia Care Studio',
      specialty: 'Skin detox e anti-age',
      rating: 4.8,
      reviews: 204,
      distanceKm: 2.4,
      nextSlot: 'Domani 15:30',
      priceFrom: 52,
      homeService: false,
    },
    {
      id: 'est-3',
      name: 'Beauty Lab Milano',
      specialty: 'Radiofrequenza e peeling',
      rating: 4.7,
      reviews: 166,
      distanceKm: 3.6,
      nextSlot: 'Venerdi 12:30',
      priceFrom: 48,
      homeService: false,
    },
  ],
  parrucchiere: [
    {
      id: 'hair-1',
      name: 'Studio Chroma',
      specialty: 'Color e gloss specialist',
      rating: 4.8,
      reviews: 267,
      distanceKm: 1.0,
      nextSlot: 'Oggi 19:00',
      priceFrom: 35,
      homeService: true,
    },
    {
      id: 'hair-2',
      name: 'Luca Hair Club',
      specialty: 'Taglio e styling',
      rating: 4.7,
      reviews: 191,
      distanceKm: 2.1,
      nextSlot: 'Domani 10:45',
      priceFrom: 30,
      homeService: false,
    },
    {
      id: 'hair-3',
      name: 'Blow&Go Team',
      specialty: 'Piega express',
      rating: 4.6,
      reviews: 128,
      distanceKm: 3.2,
      nextSlot: 'Domani 17:20',
      priceFrom: 24,
      homeService: true,
    },
  ],
  unghie: [
    {
      id: 'nails-1',
      name: 'Nails District',
      specialty: 'Gel e ricostruzione',
      rating: 4.9,
      reviews: 187,
      distanceKm: 1.6,
      nextSlot: 'Oggi 18:40',
      priceFrom: 29,
      homeService: true,
    },
    {
      id: 'nails-2',
      name: 'Lemon Nails',
      specialty: 'Manicure Spa',
      rating: 4.8,
      reviews: 143,
      distanceKm: 2.3,
      nextSlot: 'Domani 09:30',
      priceFrom: 24,
      homeService: false,
    },
    {
      id: 'nails-3',
      name: 'Studio Velvet',
      specialty: 'Nail art',
      rating: 4.7,
      reviews: 109,
      distanceKm: 4.0,
      nextSlot: 'Venerdi 14:00',
      priceFrom: 27,
      homeService: true,
    },
  ],
  massaggi: [
    {
      id: 'mass-1',
      name: 'Relief Point',
      specialty: 'Massaggio decontratturante',
      rating: 4.9,
      reviews: 299,
      distanceKm: 1.5,
      nextSlot: 'Oggi 21:00',
      priceFrom: 58,
      homeService: true,
    },
    {
      id: 'mass-2',
      name: 'Deep Tissue Milano',
      specialty: 'Massaggio sportivo',
      rating: 4.8,
      reviews: 221,
      distanceKm: 2.5,
      nextSlot: 'Domani 11:30',
      priceFrom: 65,
      homeService: true,
    },
    {
      id: 'mass-3',
      name: 'Zen Studio',
      specialty: 'Rilassante e aromaterapia',
      rating: 4.7,
      reviews: 144,
      distanceKm: 3.9,
      nextSlot: 'Sabato 10:30',
      priceFrom: 52,
      homeService: false,
    },
  ],
};

const wellnessCenters: WellnessCenter[] = [
  {
    id: 'center-1',
    name: 'VLife Downtown Hub',
    city: 'Milano Centro',
    rating: 4.9,
    distanceKm: 1.2,
    specialties: ['Fisioterapia', 'Massaggi', 'Estetica'],
    isPartner: true,
  },
  {
    id: 'center-2',
    name: 'Wellness Porta Nuova',
    city: 'Porta Nuova',
    rating: 4.8,
    distanceKm: 2.0,
    specialties: ['Osteopatia', 'Mental Coach', 'Psicologia'],
    isPartner: true,
  },
  {
    id: 'center-3',
    name: 'Beauty & Rehab Navigli',
    city: 'Navigli',
    rating: 4.7,
    distanceKm: 3.4,
    specialties: ['Parrucchiere', 'Unghie', 'Recupero sportivo'],
    isPartner: false,
  },
  {
    id: 'center-4',
    name: 'Urban Recovery Isola',
    city: 'Isola',
    rating: 4.6,
    distanceKm: 4.1,
    specialties: ['Camera iperbarica', 'Fisioterapia', 'Massaggi'],
    isPartner: false,
  },
];

const homeServiceSteps = [
  'Seleziona il servizio e la fascia oraria',
  'Conferma indirizzo e note per il professionista',
  'Ricevi tracking e check-in in tempo reale',
];

const homeServiceCategories = [
  { name: 'Massaggi', eta: 'Entro 2h', from: 'EUR 55' },
  { name: 'Beauty', eta: 'Entro 3h', from: 'EUR 39' },
  { name: 'Hair Styling', eta: 'Entro 2h', from: 'EUR 29' },
  { name: 'Fisioterapia', eta: 'Entro 4h', from: 'EUR 68' },
];

const hyperbaricPlans = [
  {
    id: 'hb-single',
    name: 'Sessione Singola',
    duration: '90 minuti',
    price: 'EUR 120',
    notes: 'Perfetta per primo approccio o recupero spot.',
  },
  {
    id: 'hb-5',
    name: 'Pacchetto 5 Sessioni',
    duration: '5 x 90 minuti',
    price: 'EUR 540',
    notes: 'Ideale per protocollo rigenerazione intensivo.',
  },
  {
    id: 'hb-10',
    name: 'Pacchetto 10 Sessioni',
    duration: '10 x 90 minuti',
    price: 'EUR 980',
    notes: 'Programma completo con follow-up professionale.',
  },
];

const providerSortLabels: Record<SortBy, string> = {
  nearest: 'Piu vicino',
  rating: 'Valutazione',
  price: 'Prezzo',
};

const providerSortOptions: SortBy[] = ['nearest', 'rating', 'price'];

export function LifeRouteScreen({ slug }: { slug: LifeRouteSlug }) {
  const content = LIFE_ROUTE_CONTENT[slug];
  const Icon = content?.icon ?? Sparkles;
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('nearest');

  const providerSlug = useMemo(
    () => (slug in providerDirectory ? (slug as ProviderSlug) : null),
    [slug]
  );
  const providers = useMemo(
    () => (providerSlug ? providerDirectory[providerSlug] : []),
    [providerSlug]
  );
  const isProviderRoute = providerSlug !== null;

  const filteredProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = providers.filter((provider) => {
      if (!normalizedQuery) return true;
      return (
        provider.name.toLowerCase().includes(normalizedQuery) ||
        provider.specialty.toLowerCase().includes(normalizedQuery)
      );
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'rating') return right.rating - left.rating;
      if (sortBy === 'price') return left.priceFrom - right.priceFrom;
      return left.distanceKm - right.distanceKm;
    });
  }, [providers, query, sortBy]);

  const filteredCenters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return wellnessCenters.filter((center) => {
      if (!normalizedQuery) return true;
      return (
        center.name.toLowerCase().includes(normalizedQuery) ||
        center.city.toLowerCase().includes(normalizedQuery) ||
        center.specialties.some((specialty) => specialty.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [query]);

  return (
    <div className="container-mobile py-6 pb-24 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-section-primary/20 blur-2xl" />
        <div className="absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-section-secondary/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            VLife
          </span>
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-section-primary/20 text-section-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-text-inverse">{content.title}</h1>
              <p className="mt-1 text-sm text-text-secondary">{content.description}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/home"
              className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-text-inverse"
            >
              Torna a Home
            </Link>
            <Link
              href="/booking"
              className="rounded-full bg-section-primary px-4 py-2 text-xs font-semibold text-background-dark"
            >
              Prenota servizio
            </Link>
          </div>
        </div>
      </section>

      {(isProviderRoute || slug === 'centers') && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              slug === 'centers'
                ? 'Cerca centri o specialita...'
                : 'Cerca professionisti o trattamenti...'
            }
          />
          {isProviderRoute && (
            <button
              type="button"
              onClick={() => {
                const currentIndex = providerSortOptions.indexOf(sortBy);
                setSortBy(providerSortOptions[(currentIndex + 1) % providerSortOptions.length]);
              }}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-text-inverse"
            >
              Ordina: {providerSortLabels[sortBy]}
            </button>
          )}
        </div>
      )}

      {isProviderRoute && (
        <section className="space-y-3">
          {filteredProviders.map((provider) => (
            <article key={provider.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-text-inverse">{provider.name}</h2>
                  <p className="mt-1 text-xs text-text-tertiary">{provider.specialty}</p>
                </div>
                {provider.homeService && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-300">
                    <Home className="h-3 w-3" />
                    Domicilio
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  {provider.rating.toFixed(1)} ({provider.reviews})
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {provider.distanceKm.toFixed(1)} km
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {provider.nextSlot}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-section-primary">Da EUR {provider.priceFrom}</span>
                <Link
                  href="/booking"
                  className="rounded-full bg-section-primary/20 px-3 py-1.5 text-xs font-semibold text-section-primary"
                >
                  Prenota
                </Link>
              </div>
            </article>
          ))}
          {filteredProviders.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-tertiary">
              Nessun professionista trovato con i filtri selezionati.
            </p>
          )}
        </section>
      )}

      {slug === 'centers' && (
        <section className="space-y-3">
          {filteredCenters.map((center) => (
            <article key={center.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-text-inverse">{center.name}</h2>
                  <p className="mt-1 text-xs text-text-tertiary">{center.city}</p>
                </div>
                {center.isPartner && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase text-background-dark">
                    <ShieldCheck className="h-3 w-3" />
                    Partner
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  {center.rating.toFixed(1)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {center.distanceKm.toFixed(1)} km
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {center.specialties.map((specialty) => (
                  <span key={specialty} className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-text-tertiary">
                    {specialty}
                  </span>
                ))}
              </div>
              <Link
                href="/booking"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-section-primary"
              >
                Vedi disponibilita
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
          {filteredCenters.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-tertiary">
              Nessun centro trovato con la ricerca corrente.
            </p>
          )}
        </section>
      )}

      {slug === 'home-services' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <h2 className="text-base font-semibold text-text-inverse">Servizi a domicilio verificati</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Professionisti certificati con check-in in app e supporto dedicato.
            </p>
            <div className="mt-3 space-y-1.5">
              {homeServiceSteps.map((step) => (
                <p key={step} className="text-xs text-text-tertiary">
                  • {step}
                </p>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {homeServiceCategories.map((category) => (
              <article key={category.name} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-semibold text-text-inverse">{category.name}</h3>
                <p className="mt-1 text-xs text-text-tertiary">{category.eta}</p>
                <p className="mt-2 text-sm font-bold text-section-primary">Da {category.from}</p>
                <Link
                  href="/booking"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-section-primary"
                >
                  Prenota ora
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {slug === 'hyperbaric' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
            <div className="flex items-center gap-2">
              <Wind className="h-5 w-5 text-cyan-300" />
              <h2 className="text-base font-semibold text-text-inverse">Percorso Ossigeno Iperbarico</h2>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Trattamento in ambiente controllato con protocollo medico e monitoraggio costante.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/5 p-2 text-center">
                <p className="text-lg font-bold text-cyan-300">90</p>
                <p className="text-[10px] text-text-tertiary">Minuti</p>
              </div>
              <div className="rounded-xl bg-white/5 p-2 text-center">
                <p className="text-lg font-bold text-cyan-300">2.0</p>
                <p className="text-[10px] text-text-tertiary">ATA</p>
              </div>
              <div className="rounded-xl bg-white/5 p-2 text-center">
                <p className="text-lg font-bold text-cyan-300">100%</p>
                <p className="text-[10px] text-text-tertiary">O2</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {hyperbaricPlans.map((plan) => (
              <article key={plan.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-semibold text-text-inverse">{plan.name}</h3>
                <p className="mt-1 text-xs text-text-tertiary">{plan.duration}</p>
                <p className="mt-2 text-sm font-bold text-section-primary">{plan.price}</p>
                <p className="mt-2 text-xs text-text-tertiary">{plan.notes}</p>
              </article>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Nota medica</p>
            <p className="mt-1 text-sm text-text-secondary">
              Prima della prenotazione e richiesto un breve questionario anamnestico.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Recupero sportivo', 'Rigenerazione cellulare', 'Focus mentale'].map((benefit) => (
                <span
                  key={benefit}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-text-tertiary'
                  )}
                >
                  <Sparkles className="h-3 w-3 text-cyan-300" />
                  {benefit}
                </span>
              ))}
            </div>
          </div>
          <Link
            href="/booking"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-section-primary/20 px-4 py-3 text-sm font-semibold text-section-primary"
          >
            Prenota una valutazione
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>
      )}
    </div>
  );
}

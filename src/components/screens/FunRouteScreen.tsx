'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Glasses,
  MapPin,
  PartyPopper,
  Play,
  Radio,
  Sparkles,
  Star,
  Ticket,
  Tv,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FUN_ROUTE_CONTENT, type FunRouteSlug } from '@/lib/featureRouteContent';

type EventTag = 'Hot' | 'VIP' | 'Nuovo';

interface FunEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  price: string;
  attendees: number;
  tag: EventTag;
}

interface VrExperience {
  id: string;
  title: string;
  duration: string;
  level: string;
  rating: number;
  price: string;
}

interface TvShow {
  id: string;
  time: string;
  title: string;
  channel: string;
  isLive: boolean;
}

const upcomingEvents: FunEvent[] = [
  {
    id: 'sunset-sessions',
    title: 'Sunset Sessions Rooftop',
    date: '16 Feb',
    time: '18:30',
    location: 'Terrazza Porta Nuova',
    price: 'Da EUR 39',
    attendees: 420,
    tag: 'Hot',
  },
  {
    id: 'fit-party',
    title: 'Fit & Dance Night',
    date: '20 Feb',
    time: '21:00',
    location: 'V Arena Milano',
    price: 'Da EUR 28',
    attendees: 680,
    tag: 'Nuovo',
  },
  {
    id: 'vip-gala',
    title: 'VIP Wellness Gala',
    date: '27 Feb',
    time: '20:30',
    location: 'Grand Hotel Duomo',
    price: 'Da EUR 90',
    attendees: 180,
    tag: 'VIP',
  },
  {
    id: 'neon-run',
    title: 'Neon Run After Party',
    date: '3 Mar',
    time: '22:00',
    location: 'Navigli District',
    price: 'Da EUR 32',
    attendees: 510,
    tag: 'Hot',
  },
];

const vrExperiences: VrExperience[] = [
  {
    id: 'vr-boxing',
    title: 'VR Boxing Pro Arena',
    duration: '45 min',
    level: 'Avanzato',
    rating: 4.8,
    price: 'EUR 22',
  },
  {
    id: 'vr-dance',
    title: 'Dance Revolution Arena',
    duration: '30 min',
    level: 'Tutti',
    rating: 4.7,
    price: 'EUR 16',
  },
  {
    id: 'vr-racing',
    title: 'Hyper Racing League',
    duration: '35 min',
    level: 'Intermedio',
    rating: 4.9,
    price: 'EUR 20',
  },
  {
    id: 'vr-escape',
    title: 'Escape Lab 2099',
    duration: '60 min',
    level: 'Team',
    rating: 4.9,
    price: 'EUR 26',
  },
];

const tvSchedule: TvShow[] = [
  {
    id: 'tv-1',
    time: '10:00',
    title: 'Morning Mobility Flow',
    channel: 'V Wellness',
    isLive: false,
  },
  {
    id: 'tv-2',
    time: '14:30',
    title: 'HIIT Live Stage',
    channel: 'V Fit',
    isLive: true,
  },
  {
    id: 'tv-3',
    time: '18:00',
    title: 'Beauty & Glow Masterclass',
    channel: 'V Life',
    isLive: false,
  },
  {
    id: 'tv-4',
    time: '21:00',
    title: 'Global DJ Set',
    channel: 'V Fun',
    isLive: false,
  },
  {
    id: 'tv-5',
    time: '23:30',
    title: 'Aftershow Backstage',
    channel: 'V Fun',
    isLive: true,
  },
];

const partyPackages = [
  {
    id: 'private',
    name: 'Private Party',
    priceFrom: 'Da EUR 790',
    capacity: 'Fino a 60 ospiti',
    features: ['DJ resident', 'Welcome drink', 'Host dedicato'],
  },
  {
    id: 'corporate',
    name: 'Corporate Event',
    priceFrom: 'Da EUR 1.490',
    capacity: 'Fino a 180 ospiti',
    features: ['Location premium', 'Stage setup', 'Catering smart'],
  },
  {
    id: 'vip',
    name: 'VIP Experience',
    priceFrom: 'Da EUR 2.600',
    capacity: 'Fino a 250 ospiti',
    features: ['Line-up personalizzata', 'Media team', 'Concierge full service'],
  },
];

type EventFilter = 'all' | EventTag;

const eventFilters: Array<{ id: EventFilter; label: string }> = [
  { id: 'all', label: 'Tutti' },
  { id: 'Hot', label: 'Hot' },
  { id: 'VIP', label: 'VIP' },
  { id: 'Nuovo', label: 'Nuovi' },
];

export function FunRouteScreen({ slug }: { slug: FunRouteSlug }) {
  const content = FUN_ROUTE_CONTENT[slug];
  const Icon = content?.icon ?? Sparkles;
  const isPartyRoute = slug === 'parties' || slug === 'party-mode';
  const [eventQuery, setEventQuery] = useState('');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [quoteSent, setQuoteSent] = useState(false);
  const [partyForm, setPartyForm] = useState({
    eventType: 'Private Party',
    attendees: '60',
    date: '',
    budget: '',
  });

  const filteredEvents = useMemo(() => {
    const normalizedQuery = eventQuery.trim().toLowerCase();
    return upcomingEvents.filter((event) => {
      const matchesFilter = eventFilter === 'all' || event.tag === eventFilter;
      const matchesQuery =
        !normalizedQuery ||
        event.title.toLowerCase().includes(normalizedQuery) ||
        event.location.toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [eventFilter, eventQuery]);

  const channels = useMemo(
    () => ['all', ...Array.from(new Set(tvSchedule.map((show) => show.channel)))],
    []
  );

  const filteredShows = useMemo(() => {
    if (selectedChannel === 'all') return tvSchedule;
    return tvSchedule.filter((show) => show.channel === selectedChannel);
  }, [selectedChannel]);

  return (
    <div className="container-mobile py-6 pb-24 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-section-primary/20 blur-2xl" />
        <div className="absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-section-secondary/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            VFun
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
              href="/bookings"
              className="rounded-full bg-section-primary px-4 py-2 text-xs font-semibold text-background-dark"
            >
              Le mie prenotazioni
            </Link>
          </div>
        </div>
      </section>

      {slug === 'events' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-black/20 p-3">
                <p className="text-xs text-text-tertiary">Eventi questo mese</p>
                <p className="mt-1 text-xl font-bold text-text-inverse">24</p>
              </div>
              <div className="rounded-xl bg-black/20 p-3">
                <p className="text-xs text-text-tertiary">Con tag VIP</p>
                <p className="mt-1 text-xl font-bold text-text-inverse">8</p>
              </div>
              <div className="rounded-xl bg-black/20 p-3">
                <p className="text-xs text-text-tertiary">Posti disponibili</p>
                <p className="mt-1 text-xl font-bold text-text-inverse">1.790</p>
              </div>
            </div>
            <div className="mt-4">
              <Input
                value={eventQuery}
                onChange={(event) => setEventQuery(event.target.value)}
                placeholder="Cerca eventi o location..."
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {eventFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setEventFilter(filter.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    eventFilter === filter.id
                      ? 'border-section-primary bg-section-primary text-background-dark'
                      : 'border-white/15 bg-white/5 text-text-tertiary'
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredEvents.map((event) => (
              <article key={event.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-text-inverse">{event.title}</h2>
                    <p className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                      <Calendar className="h-3.5 w-3.5" />
                      {event.date}
                      <Clock className="ml-1 h-3.5 w-3.5" />
                      {event.time}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                      <MapPin className="h-3.5 w-3.5" />
                      {event.location}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase',
                      event.tag === 'VIP' && 'bg-vip-gold/90 text-background-dark',
                      event.tag === 'Hot' && 'bg-orange-500/90 text-white',
                      event.tag === 'Nuovo' && 'bg-section-primary/90 text-background-dark'
                    )}
                  >
                    {event.tag}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-text-tertiary">
                    <Users className="h-3.5 w-3.5" />
                    {event.attendees} partecipanti previsti
                  </span>
                  <span className="text-sm font-bold text-section-primary">{event.price}</span>
                </div>
                <Link
                  href="/booking"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-section-primary/20 px-4 py-2 text-sm font-semibold text-section-primary"
                >
                  Prenota ticket
                </Link>
              </article>
            ))}
            {filteredEvents.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-tertiary">
                Nessun evento trovato con i filtri selezionati.
              </p>
            )}
          </div>
        </section>
      )}

      {slug === 'vr' && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {vrExperiences.map((experience) => (
              <article key={experience.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20">
                    <Glasses className="h-5 w-5 text-indigo-300" />
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="text-[11px] font-semibold text-text-inverse">
                      {experience.rating}
                    </span>
                  </div>
                </div>
                <h2 className="mt-3 text-sm font-semibold text-text-inverse">{experience.title}</h2>
                <p className="mt-1 text-xs text-text-tertiary">{experience.duration} · {experience.level}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-text-inverse">{experience.price}</span>
                  <Link
                    href="/booking"
                    className="rounded-full bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-300"
                  >
                    Prenota
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-secondary">
            Sessioni in piccoli gruppi, briefing iniziale incluso e attrezzatura sanificata ad ogni turno.
          </div>
        </section>
      )}

      {isPartyRoute && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {partyPackages.map((partyPackage) => (
              <article key={partyPackage.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text-inverse">{partyPackage.name}</h2>
                  <PartyPopper className="h-4 w-4 text-section-primary" />
                </div>
                <p className="mt-2 text-xs text-text-tertiary">{partyPackage.capacity}</p>
                <p className="mt-2 text-sm font-bold text-section-primary">{partyPackage.priceFrom}</p>
                <ul className="mt-3 space-y-1">
                  {partyPackage.features.map((feature) => (
                    <li key={feature} className="text-xs text-text-tertiary">
                      • {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              setQuoteSent(true);
            }}
            className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <h3 className="text-base font-semibold text-text-inverse">Richiedi preventivo</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-tertiary">Tipo evento</label>
                <select
                  value={partyForm.eventType}
                  onChange={(event) =>
                    setPartyForm((current) => ({ ...current, eventType: event.target.value }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#2A2D3A] px-3 py-3 text-sm text-text-inverse focus:outline-none focus:ring-2 focus:ring-section-primary"
                >
                  <option>Private Party</option>
                  <option>Corporate Event</option>
                  <option>Birthday Experience</option>
                  <option>Bachelor Party</option>
                </select>
              </div>
              <Input
                type="number"
                label="Numero ospiti"
                min={10}
                value={partyForm.attendees}
                onChange={(event) =>
                  setPartyForm((current) => ({ ...current, attendees: event.target.value }))
                }
              />
              <Input
                type="date"
                label="Data preferita"
                value={partyForm.date}
                onChange={(event) =>
                  setPartyForm((current) => ({ ...current, date: event.target.value }))
                }
              />
              <Input
                label="Budget indicativo"
                placeholder="Es. EUR 2.000"
                value={partyForm.budget}
                onChange={(event) =>
                  setPartyForm((current) => ({ ...current, budget: event.target.value }))
                }
              />
            </div>
            <Button type="submit" fullWidth>
              Invia richiesta
            </Button>
            {quoteSent && (
              <p className="text-sm text-success-DEFAULT">
                Richiesta inviata. Il team VFun ti contattera entro 24 ore.
              </p>
            )}
          </form>
        </section>
      )}

      {slug === 'tv' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/25">
                <Radio className="h-5 w-5 text-red-400" />
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-red-400">Live now</p>
                <h2 className="text-sm font-semibold text-text-inverse">HIIT Live Stage</h2>
              </div>
              <button
                type="button"
                className="ml-auto rounded-full bg-red-500/20 p-2 text-red-400"
                aria-label="Play live stream"
              >
                <Play className="h-4 w-4 fill-current" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {channels.map((channel) => (
              <button
                key={channel}
                type="button"
                onClick={() => setSelectedChannel(channel)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  selectedChannel === channel
                    ? 'border-section-primary bg-section-primary text-background-dark'
                    : 'border-white/15 bg-white/5 text-text-tertiary'
                )}
              >
                {channel === 'all' ? 'Tutti i canali' : channel}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredShows.map((show) => (
              <article
                key={show.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3',
                  show.isLive ? 'border-red-500/30 bg-red-500/10' : 'border-white/10 bg-white/5'
                )}
              >
                <div
                  className={cn(
                    'flex h-11 w-11 flex-col items-center justify-center rounded-xl text-xs font-semibold',
                    show.isLive ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-text-tertiary'
                  )}
                >
                  {show.time}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-inverse">{show.title}</p>
                  <p className="text-xs text-text-tertiary">{show.channel}</p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-1 text-[10px] font-semibold uppercase',
                    show.isLive ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-text-tertiary'
                  )}
                >
                  {show.isLive ? 'Live' : 'Replay'}
                </span>
              </article>
            ))}
          </div>

          <Link
            href="/booking"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-section-primary/20 px-4 py-3 text-sm font-semibold text-section-primary"
          >
            <Ticket className="h-4 w-4" />
            Scopri eventi collegati
          </Link>
        </section>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-text-tertiary">
        <p className="flex items-center gap-2">
          <Tv className="h-4 w-4" />
          Disponibilita, prezzi e lineup vengono aggiornati in tempo reale.
        </p>
      </div>
    </div>
  );
}

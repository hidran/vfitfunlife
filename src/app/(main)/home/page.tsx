'use client';

import Link from 'next/link';
import { useSection, type Section } from '@/contexts/SectionContext';
import {
  ArrowUpRight,
  Calendar,
  ChevronRight,
  Dumbbell,
  Home as HomeIcon,
  MapPin,
  PartyPopper,
  Sparkles,
  Star,
  Tv,
  Trophy,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

const vfitQuickActions = [
  { label: 'Palestre', icon: Dumbbell, href: '/fit/gyms' },
  { label: 'Corsi', icon: Calendar },
  { label: 'A Domicilio', icon: HomeIcon },
  { label: 'Virtual', icon: Tv },
];

const vfitGyms = [
  {
    id: 'carosello',
    name: 'Carosello Fitness',
    city: 'Milano Centro',
    rating: 4.8,
    reviews: 124,
    distance: '1.2 km',
    partner: true,
  },
  {
    id: 'urban-core',
    name: 'Urban Core Gym',
    city: 'Porta Nuova',
    rating: 4.9,
    reviews: 98,
    distance: '2.4 km',
    partner: false,
  },
  {
    id: 'village-fit',
    name: 'Village Fit Club',
    city: 'Navigli',
    rating: 4.7,
    reviews: 142,
    distance: '3.1 km',
    partner: true,
  },
];

const vfitClasses = [
  {
    time: '07:30',
    name: 'HIIT Power',
    instructor: 'Marco R.',
    spots: 3,
    tag: 'Intenso',
  },
  {
    time: '12:15',
    name: 'Pilates Flow',
    instructor: 'Elena B.',
    spots: 6,
    tag: 'Balance',
  },
  {
    time: '18:45',
    name: 'Functional 360',
    instructor: 'Luca S.',
    spots: 2,
    tag: 'Strength',
  },
];

const vfitTrainers = [
  {
    name: 'Elena Bianchi',
    specialty: 'Yoga & Mobility',
    rating: 4.9,
    reviews: 98,
  },
  {
    name: 'Marco Rossi',
    specialty: 'HIIT & Cardio',
    rating: 4.8,
    reviews: 132,
  },
  {
    name: 'Giulia Conti',
    specialty: 'Strength Coach',
    rating: 4.7,
    reviews: 76,
  },
];

const vfitChallenges = [
  {
    title: '30-Day Core',
    progress: 0.7,
    target: '14/20 sessioni',
    streak: '7 giorni',
  },
  {
    title: 'Run 50 km',
    progress: 0.45,
    target: '22/50 km',
    streak: '4 giorni',
  },
];

const sectionContent: Record<
  Section,
  {
    title: string;
    subtitle: string;
    description: string;
    icon: typeof Dumbbell;
    features: string[];
  }
> = {
  fit: {
    title: 'VFit',
    subtitle: 'Your Fitness Journey',
    description:
      'Access gyms, book classes, connect with personal trainers, and discover home workouts.',
    icon: Dumbbell,
    features: [
      'Gym Access & Check-in',
      'Group Fitness Classes',
      'Personal Training',
      'Home Workout Programs',
      'Progress Tracking',
    ],
  },
  fun: {
    title: 'VFun',
    subtitle: 'Entertainment & Events',
    description:
      'Discover events, parties, VR experiences, and exclusive streaming content.',
    icon: PartyPopper,
    features: [
      'Live Events & Parties',
      'VR Experiences',
      'Exclusive Streaming',
      'Social Meetups',
      'Member-Only Access',
    ],
  },
  life: {
    title: 'VLife',
    subtitle: 'Wellness & Beauty',
    description:
      'Book spa treatments, aesthetic services, massage therapy, and mental wellness sessions.',
    icon: Sparkles,
    features: [
      'Spa & Relaxation',
      'Aesthetic Treatments',
      'Massage Therapy',
      'Mental Wellness',
      'Beauty Services',
    ],
  },
};

function VFitHome() {
  return (
    <div className="container-mobile py-6 space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-vfit-secondary/25 via-vfit-primary/20 to-vfit-accent/20 p-5">
        <div className="absolute -top-16 -right-10 h-32 w-32 rounded-full bg-vfit-primary/20 blur-2xl" />
        <div className="absolute -bottom-20 left-0 h-40 w-40 rounded-full bg-vfit-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-vip-gold/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-vip-gold">
              VIP Upgrade
            </span>
            <h2 className="mt-3 text-xl font-bold text-text-inverse">
              Sblocca sconti esclusivi
            </h2>
            <p className="mt-1 text-sm text-text-tertiary">
              Passa a VIP per classi illimitate e offerte premium.
            </p>
          </div>
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-background-dark shadow-lg shadow-white/10"
          >
            Attiva
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Azioni rapide</h3>
          <span className="text-xs text-text-tertiary">VFit</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {vfitQuickActions.map((action) => {
            const Icon = action.icon;
            const content = (
              <>
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-xl bg-section-primary/20 text-section-primary flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-4 text-sm font-semibold text-text-inverse">
                  {action.label}
                </p>
                <p className="mt-1 text-xs text-text-tertiary">Scopri ora</p>
              </>
            );

            if (action.href) {
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className={cn(
                    'group rounded-2xl border border-white/10 bg-white/5 p-4 transition-all',
                    'hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10'
                  )}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={action.label}
                type="button"
                className={cn(
                  'group rounded-2xl border border-white/10 bg-white/5 p-4 transition-all',
                  'hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10'
                )}
              >
                {content}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Palestre vicine</h3>
          <Link
            href="/fit/gyms"
            className="text-sm font-medium text-section-primary"
          >
            Vedi tutte
          </Link>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {vfitGyms.map((gym) => (
            <Link
              key={gym.id}
              href={`/venue/${gym.id}`}
              className="min-w-[220px] rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="relative h-28 bg-gradient-to-br from-vfit-secondary/40 via-vfit-primary/20 to-transparent">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_60%)]" />
                {gym.partner && (
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase text-background-dark">
                    Partner
                  </span>
                )}
                <div className="absolute right-3 top-3 rounded-full bg-background-dark/80 px-2 py-1 text-[11px] font-semibold text-white">
                  {gym.rating.toFixed(1)}
                </div>
              </div>
              <div className="p-3">
                <h4 className="text-sm font-semibold text-text-inverse">
                  {gym.name}
                </h4>
                <p className="text-xs text-text-tertiary">{gym.city}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
                  <span>{gym.distance}</span>
                  <span>{gym.reviews} recensioni</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Corsi oggi</h3>
          <button className="text-sm font-medium text-section-primary">Calendario</button>
        </div>
        <div className="space-y-3">
          {vfitClasses.map((session) => (
            <div
              key={session.name}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-section-primary/15 text-section-primary">
                  <span className="text-xs font-semibold">{session.time}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-inverse">
                    {session.name}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {session.instructor} · {session.tag}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-text-inverse">
                {session.spots} posti
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Istruttori top</h3>
          <button className="text-sm font-medium text-section-primary">Scopri</button>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {vfitTrainers.map((trainer) => (
            <div
              key={trainer.name}
              className="min-w-[200px] rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar name={trainer.name} size="md" />
                <div>
                  <p className="text-sm font-semibold text-text-inverse">
                    {trainer.name}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {trainer.specialty}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-text-tertiary">
                <Star className="h-4 w-4 text-yellow-400" />
                <span className="text-text-inverse font-semibold">
                  {trainer.rating.toFixed(1)}
                </span>
                <span>({trainer.reviews})</span>
              </div>
              <button className="mt-4 w-full rounded-full bg-section-primary/20 py-2 text-xs font-semibold text-section-primary">
                Prenota
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Le tue sfide</h3>
          <Trophy className="h-5 w-5 text-section-primary" />
        </div>
        {vfitChallenges.map((challenge) => (
          <div
            key={challenge.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text-inverse">
                  {challenge.title}
                </p>
                <p className="text-xs text-text-tertiary">{challenge.target}</p>
              </div>
              <span className="rounded-full bg-section-primary/15 px-3 py-1 text-xs font-semibold text-section-primary">
                {challenge.streak}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-section-gradient"
                style={{ width: `${challenge.progress * 100}%` }}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="relative h-40 bg-[radial-gradient(circle_at_top,_rgba(0,201,255,0.2),_transparent_60%)]">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,_rgba(0,102,255,0.15),_rgba(123,97,255,0.1))]" />
          <div className="absolute left-8 top-10 h-4 w-4 rounded-full bg-section-primary shadow-[0_0_12px_rgba(0,201,255,0.8)]" />
          <div className="absolute left-1/2 top-16 h-4 w-4 rounded-full bg-vfit-accent shadow-[0_0_12px_rgba(123,97,255,0.8)]" />
          <div className="absolute right-12 bottom-12 h-5 w-5 rounded-full bg-section-secondary shadow-[0_0_12px_rgba(0,102,255,0.8)]" />
          <div className="absolute right-6 top-6 rounded-full bg-background-dark/80 px-3 py-1 text-xs text-text-inverse">
            +12 location
          </div>
          <div className="absolute left-5 bottom-5 flex items-center gap-2 text-xs text-text-inverse">
            <MapPin className="h-4 w-4 text-section-primary" />
            Milano
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-text-inverse">Mappa VFit</p>
            <p className="text-xs text-text-tertiary">Scopri le sedi vicine</p>
          </div>
          <Link
            href="/fit/gyms"
            className="text-sm font-semibold text-section-primary"
          >
            Apri
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function HomePage() {
  const { section } = useSection();

  if (section === 'fit') {
    return <VFitHome />;
  }

  const content = sectionContent[section];
  const Icon = content.icon;

  return (
    <div className="container-mobile py-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-section-gradient flex items-center justify-center">
            <Icon size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold gradient-text">
              {content.title}
            </h1>
            <p className="text-text-secondary text-sm">{content.subtitle}</p>
          </div>
        </div>
        <p className="text-text-tertiary mt-4 leading-relaxed">
          {content.description}
        </p>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-semibold text-text-inverse mb-4">
          What you can do
        </h2>
        <div className="space-y-3">
          {content.features.map((feature, index) => (
            <div
              key={feature}
              className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10"
            >
              <div className="w-8 h-8 rounded-full bg-section-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-section-primary text-sm font-bold">
                  {index + 1}
                </span>
              </div>
              <span className="text-text-inverse">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-semibold text-text-inverse mb-4">
          Featured
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="aspect-square rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center"
            >
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-section-primary/20 animate-pulse" />
                <div className="h-3 w-16 mx-auto rounded bg-white/10 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-inverse mb-4">
          Quick Actions
        </h2>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
          {['Book a Class', 'Find Nearby', 'View Schedule', 'My Progress'].map(
            (action) => (
              <button
                key={action}
                className="flex-shrink-0 px-5 py-3 rounded-full bg-section-primary/20 border border-section-primary/30 text-section-primary font-medium text-sm whitespace-nowrap transition-all duration-200 hover:bg-section-primary/30 active:scale-95 touch-target"
              >
                {action}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

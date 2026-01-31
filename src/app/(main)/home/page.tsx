'use client';

import Link from 'next/link';
import { useSection, type Section } from '@/contexts/SectionContext';
import {
  ArrowUpRight,
  Briefcase,
  Calendar,
  ChevronRight,
  Clock,
  Dumbbell,
  Gamepad2,
  Glasses,
  Home as HomeIcon,
  MapPin,
  PartyPopper,
  Play,
  Radio,
  Sparkles,
  Star,
  Ticket,
  Tv,
  Trophy,
  Users,
  Zap,
  Bone,
  Activity,
  Brain,
  HeartHandshake,
  Scissors,
  Hand,
  Flower2,
  Quote,
  Phone,
  Wind,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { usePullToRefresh } from 'use-pull-to-refresh';
import { SectionSwitcher } from '@/components/ui/section-switcher';

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

// VFun mock data
const vfunQuickActions = [
  { label: 'Eventi', icon: Ticket, href: '/fun/events' },
  { label: 'VR', icon: Glasses, href: '/fun/vr' },
  { label: 'Party', icon: PartyPopper, href: '/fun/parties' },
  { label: 'TV', icon: Tv, href: '/fun/tv' },
];

const vfunFeaturedEvent = {
  id: 'summer-festival-2026',
  title: 'Summer Festival 2026',
  subtitle: 'La notte più attesa dell\'anno',
  date: '15 Feb 2026',
  location: 'V Arena Milano',
  price: 'Da €45',
  tag: 'Sold Out 80%',
  attendees: 2450,
};

const vfunUpcomingEvents = [
  {
    id: 'pool-party',
    title: 'Pool Party Deluxe',
    date: '8 Feb',
    time: '14:00',
    location: 'V Club Rooftop',
    price: '€35',
    image: null,
    tag: 'Hot',
  },
  {
    id: 'dj-night',
    title: 'DJ Night w/ Marco Carola',
    date: '10 Feb',
    time: '23:00',
    location: 'V Arena',
    price: '€50',
    image: null,
    tag: 'VIP',
  },
  {
    id: 'fitness-rave',
    title: 'Fitness Rave',
    date: '12 Feb',
    time: '20:00',
    location: 'V Fit Central',
    price: '€25',
    image: null,
    tag: 'Nuovo',
  },
];

const vfunVRExperiences = [
  {
    id: 'beat-saber',
    title: 'Beat Saber Challenge',
    duration: '30 min',
    level: 'Principiante',
    rating: 4.9,
    price: '€15',
  },
  {
    id: 'boxing-vr',
    title: 'VR Boxing Pro',
    duration: '45 min',
    level: 'Avanzato',
    rating: 4.8,
    price: '€20',
  },
  {
    id: 'dance-vr',
    title: 'Dance Revolution VR',
    duration: '30 min',
    level: 'Tutti',
    rating: 4.7,
    price: '€12',
  },
];

const vfunTVSchedule = [
  {
    time: '10:00',
    title: 'Morning Yoga Flow',
    channel: 'V Wellness',
    isLive: false,
  },
  {
    time: '14:30',
    title: 'HIIT Workout Live',
    channel: 'V Fit',
    isLive: true,
  },
  {
    time: '18:00',
    title: 'Cooking Healthy',
    channel: 'V Life',
    isLive: false,
  },
  {
    time: '21:00',
    title: 'DJ Set Live',
    channel: 'V Fun',
    isLive: false,
  },
];

const vfunIsStreamingLive = true;

// VLife Mock Data
const vlifeWellnessActions = [
  { label: 'Osteopatia', icon: Bone, href: '/life/osteopatia' },
  { label: 'Fisioterapia', icon: Activity, href: '/life/fisioterapia' },
  { label: 'Mental Coach', icon: Brain, href: '/life/mental-coach' },
  { label: 'Psicologo', icon: HeartHandshake, href: '/life/psicologo' },
];

const vlifeEsteticaActions = [
  { label: 'Estetista', icon: Sparkles, href: '/life/estetista' },
  { label: 'Parrucchiere', icon: Scissors, href: '/life/parrucchiere' },
  { label: 'Unghie', icon: Hand, href: '/life/unghie' },
  { label: 'Massaggi', icon: Flower2, href: '/life/massaggi' },
];

const vlifeWellnessCenters = [
  {
    id: 'wellness-spa-milano',
    name: 'Wellness Spa Milano',
    city: 'Centro Storico',
    rating: 4.9,
    reviews: 256,
    distance: '0.8 km',
    specialties: ['Spa', 'Massaggi', 'Estetica'],
    partner: true,
  },
  {
    id: 'centro-benessere-navigli',
    name: 'Centro Benessere Navigli',
    city: 'Navigli',
    rating: 4.7,
    reviews: 189,
    distance: '1.5 km',
    specialties: ['Fisioterapia', 'Osteopatia'],
    partner: false,
  },
  {
    id: 'beauty-wellness-hub',
    name: 'Beauty & Wellness Hub',
    city: 'Porta Venezia',
    rating: 4.8,
    reviews: 312,
    distance: '2.1 km',
    specialties: ['Parrucchiere', 'Estetista', 'Unghie'],
    partner: true,
  },
  {
    id: 'oasi-del-relax',
    name: 'Oasi del Relax',
    city: 'Brera',
    rating: 4.6,
    reviews: 145,
    distance: '2.8 km',
    specialties: ['Massaggi', 'Mental Coach'],
    partner: false,
  },
];

const vlifeTestimonials = [
  {
    id: 1,
    name: 'Francesca M.',
    service: 'Massaggio Decontratturante',
    rating: 5,
    text: 'Esperienza fantastica! Il massaggio ha risolto il mio mal di schiena cronico. Staff professionale e ambiente rilassante.',
    date: '2 giorni fa',
  },
  {
    id: 2,
    name: 'Giovanni P.',
    service: 'Seduta di Osteopatia',
    rating: 5,
    text: 'Dopo anni di dolori cervicali, finalmente ho trovato sollievo. Il dottore e molto competente e attento.',
    date: '1 settimana fa',
  },
  {
    id: 3,
    name: 'Laura B.',
    service: 'Trattamento Viso',
    rating: 4,
    text: 'Pelle luminosa e idratata dopo il trattamento. Consigliatissimo per chi vuole prendersi cura di se.',
    date: '3 giorni fa',
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
          {vfitClasses.map((session, index) => (
            <div
              key={`class-${session.name}-${index}`}
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
          {vfitTrainers.map((trainer, index) => (
            <div
              key={`trainer-${trainer.name}-${index}`}
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
        {vfitChallenges.map((challenge, index) => (
          <div
            key={`challenge-${challenge.title}-${index}`}
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
  const { isRefreshing, pullPosition } = usePullToRefresh({
    onRefresh: () => new Promise(resolve => setTimeout(resolve, 2000)),
  });

  return (
    <>
      <header className="sticky top-0 z-40 bg-background-dark/80 backdrop-blur-md">
        <div className="container-mobile flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold text-white">V</h1>
          <SectionSwitcher />
          <Avatar name="User" size="sm" />
        </div>
      </header>
      <main
        style={{
          transform: `translateY(${isRefreshing ? 60 : pullPosition}px)`,
          transition: 'transform 0.3s',
        }}
      >
        <div
          style={{
            position: 'fixed',
            top: '-60px',
            left: 0,
            right: 0,
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isRefreshing ? (
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          ) : (
            <div style={{ transform: `rotate(${pullPosition}deg)` }}>⬇️</div>
          )}
        </div>
        {section === 'fit' && <VFitHome />}
        {section === 'fun' && <VFunHome />}
        {section === 'life' && <VLifeHome />}
      </main>
    </>
  );
}

function VFunHome() {
  const content = sectionContent['fun'];
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
  )
}

function VLifeHome() {
  return (
    <div className="container-mobile py-6 space-y-8 pb-24">
      {/* VIP Banner - Wellness Discount */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-pink-500/25 via-purple-500/20 to-indigo-500/20 p-5">
        <div className="absolute -top-16 -right-10 h-32 w-32 rounded-full bg-pink-500/20 blur-2xl" />
        <div className="absolute -bottom-20 left-0 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-vip-gold/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-vip-gold">
              Offerta Esclusiva
            </span>
            <h2 className="mt-3 text-xl font-bold text-text-inverse">
              -30% su tutti i trattamenti
            </h2>
            <p className="mt-1 text-sm text-text-tertiary">
              Valido per i membri VIP su massaggi, estetica e servizi wellness.
            </p>
          </div>
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-background-dark shadow-lg shadow-white/10"
          >
            Scopri
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Quick Actions - Wellness */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Wellness</h3>
          <span className="text-xs text-text-tertiary">Salute & Benessere</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {vlifeWellnessActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className={cn(
                  'group rounded-2xl border border-white/10 bg-white/5 p-4 transition-all',
                  'hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-xl bg-section-primary/20 text-section-primary flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-4 text-sm font-semibold text-text-inverse">
                  {action.label}
                </p>
                <p className="mt-1 text-xs text-text-tertiary">Prenota ora</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Quick Actions - Estetica */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Estetica</h3>
          <span className="text-xs text-text-tertiary">Beauty & Care</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {vlifeEsteticaActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className={cn(
                  'group rounded-2xl border border-white/10 bg-white/5 p-4 transition-all',
                  'hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-4 text-sm font-semibold text-text-inverse">
                  {action.label}
                </p>
                <p className="mt-1 text-xs text-text-tertiary">Prenota ora</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Servizi a Domicilio Highlight */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/20 via-teal-500/15 to-cyan-500/10 p-5">
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/30 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/30 flex items-center justify-center">
              <HomeIcon className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-inverse">Servizi a Domicilio</h3>
              <p className="text-sm text-text-tertiary">Comodamente a casa tua</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-text-secondary leading-relaxed">
            Massaggi, estetista, parrucchiere e molto altro direttamente a domicilio. Professionisti certificati con tutta l&apos;attrezzatura necessaria.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-text-inverse">Massaggi</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-text-inverse">Estetista</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-text-inverse">Manicure</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-text-inverse">Fisioterapia</span>
          </div>
          <Link
            href="/life/home-services"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-400"
          >
            Scopri i servizi
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Centri Vicini - Horizontal Carousel */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Centri Vicini</h3>
          <Link
            href="/life/centers"
            className="text-sm font-medium text-section-primary"
          >
            Vedi tutti
          </Link>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {vlifeWellnessCenters.map((center) => (
            <Link
              key={center.id}
              href={`/venue/${center.id}`}
              className="min-w-[240px] rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="relative h-28 bg-gradient-to-br from-pink-500/30 via-purple-500/20 to-indigo-500/10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.15),_transparent_60%)]" />
                {center.partner && (
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase text-background-dark">
                    Partner
                  </span>
                )}
                <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background-dark/80 px-2 py-1">
                  <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                  <span className="text-[11px] font-semibold text-white">
                    {center.rating.toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="p-3">
                <h4 className="text-sm font-semibold text-text-inverse">
                  {center.name}
                </h4>
                <p className="text-xs text-text-tertiary">{center.city}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {center.specialties.slice(0, 2).map((spec) => (
                    <span key={spec} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-text-tertiary">
                      {spec}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {center.distance}
                  </span>
                  <span>{center.reviews} recensioni</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recensioni - Testimonials Carousel */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Recensioni</h3>
          <Quote className="h-5 w-5 text-section-primary" />
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {vlifeTestimonials.map((testimonial) => (
            <div
              key={testimonial.id}
              className="min-w-[280px] rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar name={testimonial.name} size="md" />
                <div>
                  <p className="text-sm font-semibold text-text-inverse">
                    {testimonial.name}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {testimonial.service}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'h-3.5 w-3.5',
                      i < testimonial.rating
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-white/20'
                    )}
                  />
                ))}
              </div>
              <p className="mt-3 text-sm text-text-secondary line-clamp-3">
                &quot;{testimonial.text}&quot;
              </p>
              <p className="mt-2 text-xs text-text-tertiary">{testimonial.date}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Camera Iperbarica Feature Card */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-blue-600/20 via-cyan-500/15 to-teal-500/10">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-cyan-500/30 blur-3xl" />
        <div className="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-blue-500/30 blur-2xl" />
        <div className="relative p-5">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-cyan-500/30 flex items-center justify-center flex-shrink-0">
              <Wind className="h-7 w-7 text-cyan-400" />
            </div>
            <div className="flex-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-400">
                Novita
              </span>
              <h3 className="mt-2 text-lg font-bold text-text-inverse">
                Camera Iperbarica
              </h3>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                La terapia con ossigeno iperbarico favorisce la rigenerazione cellulare, accelera il recupero muscolare e migliora la circolazione.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <p className="text-lg font-bold text-cyan-400">90</p>
              <p className="text-[10px] text-text-tertiary">Minuti</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <p className="text-lg font-bold text-cyan-400">2.0</p>
              <p className="text-[10px] text-text-tertiary">ATA Pressione</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <p className="text-lg font-bold text-cyan-400">100%</p>
              <p className="text-[10px] text-text-tertiary">O2 Puro</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-text-inverse">Benefici:</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-text-tertiary">Recupero Sportivo</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-text-tertiary">Anti-Age</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-text-tertiary">Energia</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-text-tertiary">Detox</span>
            </div>
          </div>
          <Link
            href="/life/hyperbaric"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-500/20 border border-cyan-500/30 py-3 text-sm font-semibold text-cyan-400 transition-all hover:bg-cyan-500/30"
          >
            Prenota una sessione
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Floating CTA Button */}
      <div className="fixed bottom-24 left-0 right-0 flex justify-center px-4 z-30">
        <button
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition-all hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-95"
        >
          <Phone className="h-4 w-4" />
          Contatta per Preventivo
        </button>
      </div>
    </div>
  );
}


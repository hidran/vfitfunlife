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
import { useEffect, useState } from 'react';
import { collection, collectionGroup, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Spinner } from '@/components/ui/Spinner';

// Types
interface Provider {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  specialties: string[];
  rating: number;
  reviewCount: number;
  yearsOfExperience: number;
  isVerified: boolean;
}

interface Venue {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviews: number;
  distance: string;
  partner: boolean;
  specialties?: string[];
}

interface ClassSession {
  id: string;
  time: string;
  name: string;
  instructor: string;
  spots: number;
  tag: string;
}

// Static quick actions
const vfitQuickActions = [
  { label: 'Palestre', icon: Dumbbell, href: '/fit/gyms' },
  { label: 'Corsi', icon: Calendar },
  { label: 'A Domicilio', icon: HomeIcon },
  { label: 'Virtual', icon: Tv },
];

const vfunQuickActions = [
  { label: 'Eventi', icon: Ticket, href: '/fun/events' },
  { label: 'VR', icon: Glasses, href: '/fun/vr' },
  { label: 'Party', icon: PartyPopper, href: '/fun/party-mode' },
  { label: 'TV', icon: Tv, href: '/fun/tv' },
];

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

// Static challenges
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

// Static VFun content
const vfunFeaturedEvent = {
  id: 'summer-festival-2026',
  title: 'Summer Festival 2026',
  subtitle: 'La notte piu attesa dell\'anno',
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

// Firestore data fetching hooks
function useTopProviders(limitCount: number = 6) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        // Query public instructor profiles to avoid restricted user documents
        const q = query(
          collection(db, 'instructors'),
          where('providerProfile.isVerified', '==', true),
          limit(limitCount * 2) // Fetch more to filter locally
        );
        
        const snapshot = await getDocs(q);
        let providersData = snapshot.docs
          .map(doc => {
            const data = doc.data();
            const profile = data.providerProfile || {};
            return {
              id: doc.id,
              fullName: data.fullName || data.name || 'Unknown',
              avatarUrl: data.avatarUrl || null,
              specialties: data.specialties || profile.specialties || [],
              rating: data.ratingAvg || profile.rating || 0,
              reviewCount: data.reviewCount || profile.reviewCount || 0,
              yearsOfExperience: data.experienceYears || profile.yearsOfExperience || 0,
              isVerified: profile.isVerified ?? true,
              isActive: data.isActive ?? profile.isActive ?? true,
            };
          })
          .filter(p => p.isActive)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, limitCount);
        
        setProviders(providersData);
      } catch (error) {
        console.error('Error fetching providers:', error);
        setProviders([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

    fetchProviders();
    return () => clearTimeout(timeoutId);
  }, [limitCount]);

  return { providers, isLoading };
}

function useVenuesByType(type: 'fitness' | 'wellness', limitCount: number = 4) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        // Simpler query without composite index requirement
        const q = query(
          collection(db, 'venues'),
          where('type', '==', type),
          limit(limitCount * 2)
        );
        
        const snapshot = await getDocs(q);
        const venuesData = snapshot.docs
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || 'Unknown Venue',
              city: data.city || data.address?.city || 'Unknown',
              rating: data.rating || 0,
              reviews: data.reviewCount || 0,
              distance: `${(Math.random() * 3 + 0.5).toFixed(1)} km`,
              partner: data.isPartner || false,
              specialties: data.specialties || [],
              isActive: data.isActive !== false,
            };
          })
          .filter(v => v.isActive)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, limitCount);
        
        setVenues(venuesData);
      } catch (error) {
        console.error('Error fetching venues:', error);
        setVenues([]);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

    fetchVenues();
    return () => clearTimeout(timeoutId);
  }, [type, limitCount]);

  return { venues, isLoading };
}

function useTodayClasses(limitCount: number = 3) {
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        // fitnessClasses is public-read in firestore.rules
        const q = query(
          collection(db, 'fitnessClasses'),
          limit(limitCount * 3)
        );
        
        const snapshot = await getDocs(q);
        const now = new Date();
        const classesData = snapshot.docs
          .map(doc => {
            const data = doc.data();
            const startTime = data.startTime?.toDate?.() || new Date();
            return {
              id: doc.id,
              time: startTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
              name: data.name || 'Unnamed Class',
              instructor: data.instructorName || data.instructor?.fullName || 'Unknown',
              spots: (data.maxParticipants || data.maxCapacity || 20) - (data.bookedCount || 0),
              tag: data.level || 'All Levels',
              startTime,
              isActive: data.isActive !== false,
            };
          })
          .filter(c => c.isActive && c.startTime >= now)
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
          .slice(0, limitCount);
        
        setClasses(classesData);
      } catch (error) {
        console.error('Error fetching classes:', error);
        setClasses([]);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

    fetchClasses();
    return () => clearTimeout(timeoutId);
  }, [limitCount]);

  return { classes, isLoading };
}

function VFitHome() {
  const { providers: trainers, isLoading: loadingTrainers } = useTopProviders(6);
  const { venues: gyms, isLoading: loadingGyms } = useVenuesByType('fitness', 4);
  const { classes: classSessions, isLoading: loadingClasses } = useTodayClasses(3);

  // Fallback data while loading
  const displayTrainers = trainers.length > 0 ? trainers.slice(0, 3) : [];
  const displayGyms = gyms.length > 0 ? gyms : [];
  const displayClasses = classSessions.length > 0 ? classSessions : [];

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
          <h3 className="text-lg font-semibold text-text-inverse">
            {loadingGyms ? 'Caricamento...' : displayGyms.length > 0 ? 'Palestre vicine' : 'Palestre Partner'}
          </h3>
          <Link
            href="/fit/gyms"
            className="text-sm font-medium text-section-primary"
          >
            Vedi tutte
          </Link>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {loadingGyms ? (
            <div className="min-w-[220px] h-40 flex items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : displayGyms.length > 0 ? (
            displayGyms.map((gym) => (
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
            ))
          ) : (
            <div className="min-w-[220px] rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-sm text-text-tertiary">Nessuna palestra disponibile</p>
              <Link href="/booking" className="text-sm text-section-primary mt-2 inline-block">
                Trova un trainer
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">
            {loadingClasses ? 'Caricamento...' : displayClasses.length > 0 ? 'Corsi oggi' : 'Corsi disponibili'}
          </h3>
          <button className="text-sm font-medium text-section-primary">Calendario</button>
        </div>
        <div className="space-y-3">
          {loadingClasses ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : displayClasses.length > 0 ? (
            displayClasses.map((session) => (
              <div
                key={session.id}
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
            ))
          ) : (
            <div className="text-center py-6 border border-white/10 rounded-2xl">
              <p className="text-sm text-text-tertiary">Nessun corso oggi</p>
              <Link href="/booking" className="text-sm text-section-primary mt-2 inline-block">
                Prenota un trainer personale
              </Link>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">
            {loadingTrainers ? 'Caricamento...' : 'Istruttori top'}
          </h3>
          <Link href="/booking" className="text-sm font-medium text-section-primary">
            Scopri
          </Link>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {loadingTrainers ? (
            <div className="min-w-[200px] h-32 flex items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : displayTrainers.length > 0 ? (
            displayTrainers.map((trainer) => (
              <Link
                key={trainer.id}
                href={`/provider/${trainer.id}`}
                className="min-w-[200px] rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={trainer.fullName} size="md" src={trainer.avatarUrl} />
                  <div>
                    <p className="text-sm font-semibold text-text-inverse">
                      {trainer.fullName}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {trainer.specialties[0] || 'Trainer'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-text-tertiary">
                  <Star className="h-4 w-4 text-yellow-400" />
                  <span className="text-text-inverse font-semibold">
                    {trainer.rating.toFixed(1)}
                  </span>
                  <span>({trainer.reviewCount})</span>
                  {trainer.isVerified && (
                    <span className="ml-auto text-success-DEFAULT">Verificato</span>
                  )}
                </div>
                <button className="mt-4 w-full rounded-full bg-section-primary/20 py-2 text-xs font-semibold text-section-primary">
                  Prenota
                </button>
              </Link>
            ))
          ) : (
            <div className="min-w-[200px] rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-sm text-text-tertiary">Nessun trainer disponibile</p>
              <Link href="/booking" className="text-sm text-section-primary mt-2 inline-block">
                Cerca trainer
              </Link>
            </div>
          )}
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

function VFunHome() {
  return (
    <div className="container-mobile py-6 space-y-8 pb-24">
      {/* Featured Event Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl">
        <div className="relative h-64 bg-gradient-to-br from-purple-600/40 via-pink-500/30 to-orange-400/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(236,72,153,0.3),_transparent_50%)]" />
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-pink-500/30 blur-3xl" />
          <div className="absolute -bottom-10 left-0 h-32 w-32 rounded-full bg-purple-500/30 blur-2xl" />
          
          {/* Content */}
          <div className="absolute inset-0 p-6 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="rounded-full bg-red-500/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg">
                {vfunFeaturedEvent.tag}
              </span>
              <div className="flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1.5">
                <Users className="h-3.5 w-3.5 text-white/80" />
                <span className="text-[11px] font-medium text-white">
                  {vfunFeaturedEvent.attendees.toLocaleString()}
                </span>
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium text-pink-300">
                {vfunFeaturedEvent.date} · {vfunFeaturedEvent.location}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-white leading-tight">
                {vfunFeaturedEvent.title}
              </h2>
              <p className="mt-1 text-sm text-white/70">
                {vfunFeaturedEvent.subtitle}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-lg font-bold text-white">
                  {vfunFeaturedEvent.price}
                </span>
                <button className="flex-1 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-purple-900 shadow-lg shadow-white/20 transition-all hover:scale-[1.02] active:scale-95">
                  Prenota ora
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Dots Indicator */}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          <div className="h-1.5 w-6 rounded-full bg-white" />
          <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
        </div>
      </section>

      {/* Live Now Indicator */}
      {vfunIsStreamingLive && (
        <section className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent p-4">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 rounded-xl bg-red-500/30 flex items-center justify-center">
              <Radio className="h-7 w-7 text-red-400" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-red-400">
                  Live Now
                </span>
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                  V Fun
                </span>
              </div>
              <h3 className="text-base font-bold text-text-inverse">
                DJ Set Live - Saturday Vibes
              </h3>
              <p className="text-xs text-text-tertiary">
                Con Marco Carola · 2.4k spettatori
              </p>
            </div>
            <button className="rounded-full bg-red-500/20 p-2.5 text-red-400 transition-all hover:bg-red-500/30">
              <Play className="h-5 w-5 fill-current" />
            </button>
          </div>
        </section>
      )}

      {/* Quick Actions Grid */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Esplora</h3>
          <span className="text-xs text-text-tertiary">VFun</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {vfunQuickActions.map((action) => {
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

      {/* Prossimi Eventi - Upcoming Events Carousel */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Prossimi Eventi</h3>
          <Link
            href="/fun/events"
            className="text-sm font-medium text-section-primary"
          >
            Vedi tutti
          </Link>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {vfunUpcomingEvents.map((event) => (
            <div
              key={event.id}
              className="min-w-[240px] rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="relative h-28 bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-orange-400/10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.15),_transparent_60%)]" />
                {event.tag && (
                  <span className={cn(
                    "absolute left-3 top-3 rounded-full px-2 py-1 text-[10px] font-semibold uppercase",
                    event.tag === 'Hot' && "bg-orange-500/90 text-white",
                    event.tag === 'VIP' && "bg-vip-gold/90 text-background-dark",
                    event.tag === 'Nuovo' && "bg-section-primary/90 text-white",
                  )}>
                    {event.tag}
                  </span>
                )}
                <div className="absolute right-3 top-3 rounded-full bg-background-dark/80 px-2 py-1 text-[11px] font-semibold text-white">
                  {event.date}
                </div>
              </div>
              <div className="p-3">
                <h4 className="text-sm font-semibold text-text-inverse">
                  {event.title}
                </h4>
                <div className="mt-2 flex items-center gap-2 text-xs text-text-tertiary">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{event.time}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{event.location}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-section-primary">
                    {event.price}
                  </span>
                  <button className="rounded-full bg-section-primary/20 px-3 py-1 text-xs font-semibold text-section-primary">
                    Prenota
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* VR Experiences Carousel */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">VR Experiences</h3>
          <Link
            href="/fun/vr"
            className="text-sm font-medium text-section-primary"
          >
            Esplora
          </Link>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {vfunVRExperiences.map((vr) => (
            <div
              key={vr.id}
              className="min-w-[200px] rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                  <Glasses className="h-5 w-5 text-indigo-400" />
                </div>
                <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                  <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                  <span className="text-[11px] font-semibold text-text-inverse">
                    {vr.rating}
                  </span>
                </div>
              </div>
              <h4 className="mt-3 text-sm font-semibold text-text-inverse">
                {vr.title}
              </h4>
              <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {vr.duration}
                </span>
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-indigo-300">
                  {vr.level}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-text-inverse">
                  {vr.price}
                </span>
                <button className="rounded-full bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-400">
                  Prenota
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Palinsesto TV Schedule */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Palinsesto TV</h3>
          <Link
            href="/fun/tv"
            className="text-sm font-medium text-section-primary"
          >
            Guida TV
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {vfunTVSchedule.map((show, index) => (
            <div
              key={`${show.title}-${index}`}
              className={cn(
                "flex items-center gap-4 rounded-2xl border p-3 transition-all",
                show.isLive
                  ? "border-red-500/30 bg-red-500/10"
                  : "border-white/10 bg-white/5"
              )}
            >
              <div className={cn(
                "flex h-12 w-12 flex-col items-center justify-center rounded-xl",
                show.isLive ? "bg-red-500/20 text-red-400" : "bg-white/10 text-text-tertiary"
              )}>
                <span className="text-xs font-bold">{show.time}</span>
                {show.isLive && (
                  <span className="mt-0.5 flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-semibold truncate",
                  show.isLive ? "text-text-inverse" : "text-text-inverse"
                )}>
                  {show.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn(
                    "text-[11px] font-medium",
                    show.channel === 'V Fit' && "text-emerald-400",
                    show.channel === 'V Life' && "text-pink-400",
                    show.channel === 'V Fun' && "text-purple-400",
                    show.channel === 'V Wellness' && "text-cyan-400",
                  )}>
                    {show.channel}
                  </span>
                  {show.isLive && (
                    <span className="text-[10px] font-bold uppercase text-red-400">
                      In onda
                    </span>
                  )}
                </div>
              </div>
              <button className={cn(
                "rounded-full p-2 transition-all",
                show.isLive
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : "bg-white/10 text-text-tertiary hover:bg-white/20"
              )}>
                <Play className="h-4 w-4 fill-current" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Party Mode CTA */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-pink-500/25 via-purple-500/20 to-indigo-500/15 p-5">
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-pink-500/30 blur-2xl" />
        <div className="absolute -left-4 -bottom-4 h-20 w-20 rounded-full bg-purple-500/30 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-pink-500/30 flex items-center justify-center">
              <PartyPopper className="h-6 w-6 text-pink-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-inverse">Party Mode</h3>
              <p className="text-sm text-text-tertiary">Organizza il tuo evento</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-text-secondary leading-relaxed">
            Vuoi organizzare una festa privata o un evento aziendale? Scegli location esclusive, catering e intrattenimento su misura.
          </p>
          <Link
            href="/fun/party-mode"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-pink-400"
          >
            Richiedi preventivo
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

// Testimonials from Firestore
function useTestimonials(limitCount: number = 3) {
  const [testimonials, setTestimonials] = useState<Array<{
    id: string;
    name: string;
    service: string;
    rating: number;
    text: string;
    date: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTestimonials = async () => {
      try {
        // Pull reviews from venue/instructor review subcollections
        const q = query(
          collectionGroup(db, 'reviews'),
          limit(limitCount * 3)
        );
        
        const snapshot = await getDocs(q);
        const reviewsData = snapshot.docs
          .map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt?.toDate?.() || new Date();
            const daysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
            return {
              id: doc.id,
              name: data.userName?.split(' ')[0] + ' ' + 
                (data.userName?.split(' ')[1]?.charAt(0) || '') + '.' || 'Anonymous',
              service: data.serviceName || 'Service',
              rating: data.rating || 5,
              text: data.comment || data.text || '',
              date: daysAgo === 0 ? 'Oggi' : daysAgo === 1 ? 'Ieri' : `${daysAgo} giorni fa`,
            };
          })
          .filter(r => r.rating >= 4)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, limitCount);
        
        setTestimonials(reviewsData);
      } catch (error) {
        console.error('Error fetching testimonials:', error);
        setTestimonials([]);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

    fetchTestimonials();
    return () => clearTimeout(timeoutId);
  }, [limitCount]);

  return { testimonials, isLoading };
}

function VLifeHome() {
  const { venues: centers, isLoading: loadingCenters } = useVenuesByType('wellness', 4);
  const { testimonials, isLoading: loadingTestimonials } = useTestimonials(3);

  // Fallback testimonials
  const fallbackTestimonials = [
    {
      id: '1',
      name: 'Francesca M.',
      service: 'Massaggio Decontratturante',
      rating: 5,
      text: 'Esperienza fantastica! Il massaggio ha risolto il mio mal di schiena cronico. Staff professionale e ambiente rilassante.',
      date: '2 giorni fa',
    },
    {
      id: '2',
      name: 'Giovanni P.',
      service: 'Seduta di Osteopatia',
      rating: 5,
      text: 'Dopo anni di dolori cervicali, finalmente ho trovato sollievo. Il dottore e molto competente e attento.',
      date: '1 settimana fa',
    },
    {
      id: '3',
      name: 'Laura B.',
      service: 'Trattamento Viso',
      rating: 4,
      text: 'Pelle luminosa e idratata dopo il trattamento. Consigliatissimo per chi vuole prendersi cura di se.',
      date: '3 giorni fa',
    },
  ];

  const displayTestimonials = testimonials.length > 0 ? testimonials : fallbackTestimonials;
  const displayCenters = centers.length > 0 ? centers : [];

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
          <h3 className="text-lg font-semibold text-text-inverse">
            {loadingCenters ? 'Caricamento...' : displayCenters.length > 0 ? 'Centri Vicini' : 'Centri Partner'}
          </h3>
          <Link
            href="/life/centers"
            className="text-sm font-medium text-section-primary"
          >
            Vedi tutti
          </Link>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {loadingCenters ? (
            <div className="min-w-[240px] h-40 flex items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : displayCenters.length > 0 ? (
            displayCenters.map((center) => (
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
                    {(center.specialties || []).slice(0, 2).map((spec) => (
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
            ))
          ) : (
            <div className="min-w-[240px] rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-sm text-text-tertiary">Nessun centro disponibile</p>
              <Link href="/booking" className="text-sm text-section-primary mt-2 inline-block">
                Trova un professionista
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Recensioni - Testimonials Carousel */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-inverse">Recensioni</h3>
          <Quote className="h-5 w-5 text-section-primary" />
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {loadingTestimonials ? (
            <div className="min-w-[280px] h-40 flex items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : displayTestimonials.map((testimonial) => (
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

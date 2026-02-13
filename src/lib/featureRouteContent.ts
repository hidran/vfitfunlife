import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bell,
  Bone,
  Brain,
  CreditCard,
  Flower2,
  Glasses,
  Hand,
  HeartHandshake,
  Home,
  MapPin,
  PartyPopper,
  Scissors,
  Settings,
  Sparkles,
  Ticket,
  Tv,
  Wind,
} from 'lucide-react';
import type { PlaceholderAction } from '@/components/screens/FeaturePlaceholderPage';

export interface FeatureRouteContent {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  notes?: string[];
  primaryAction?: PlaceholderAction;
  secondaryAction?: PlaceholderAction;
}

export type FunRouteSlug = 'events' | 'vr' | 'parties' | 'party-mode' | 'tv';

export const FUN_ROUTE_CONTENT: Record<FunRouteSlug, FeatureRouteContent> = {
  events: {
    title: 'Eventi VFun',
    description:
      'Stiamo completando il calendario eventi con filtri avanzati, dettagli location e acquisto ticket integrato.',
    icon: Ticket,
    primaryAction: { href: '/home', label: 'Torna alla Home' },
  },
  vr: {
    title: 'VR Experiences',
    description:
      'Questa area includera esperienze VR prenotabili con disponibilita, livelli e durata in tempo reale.',
    icon: Glasses,
    primaryAction: { href: '/booking', label: 'Prenota un servizio' },
    secondaryAction: { href: '/home', label: 'Torna alla Home' },
  },
  parties: {
    title: 'Party Mode',
    description:
      'Stiamo preparando la richiesta preventivo per party privati e aziendali con configurazione completa.',
    icon: PartyPopper,
    primaryAction: { href: '/fun/party-mode', label: 'Apri Party Mode' },
    secondaryAction: { href: '/home', label: 'Torna alla Home' },
  },
  'party-mode': {
    title: 'Party Mode',
    description:
      'Stiamo preparando la richiesta preventivo per party privati e aziendali con configurazione completa.',
    icon: PartyPopper,
    primaryAction: { href: '/home', label: 'Torna alla Home' },
  },
  tv: {
    title: 'Guida TV VFun',
    description:
      'Questa sezione mostrera palinsesto live, canali e contenuti on-demand personalizzati.',
    icon: Tv,
    primaryAction: { href: '/home', label: 'Torna alla Home' },
  },
};

export type LifeRouteSlug =
  | 'osteopatia'
  | 'fisioterapia'
  | 'mental-coach'
  | 'psicologo'
  | 'estetista'
  | 'parrucchiere'
  | 'unghie'
  | 'massaggi'
  | 'home-services'
  | 'centers'
  | 'hyperbaric';

export const LIFE_ROUTE_CONTENT: Record<LifeRouteSlug, FeatureRouteContent> = {
  osteopatia: {
    title: 'Osteopatia',
    description: 'Stiamo preparando la lista professionisti e la prenotazione per trattamenti osteopatici.',
    icon: Bone,
  },
  fisioterapia: {
    title: 'Fisioterapia',
    description: 'Presto disponibile con ricerca terapisti, disponibilita e prenotazione rapida.',
    icon: Activity,
  },
  'mental-coach': {
    title: 'Mental Coach',
    description: 'Stiamo finalizzando il percorso mental coaching con sessioni individuali e follow-up.',
    icon: Brain,
  },
  psicologo: {
    title: 'Psicologo',
    description: 'La sezione psicologia includera profili verificati e prenotazioni sicure.',
    icon: HeartHandshake,
  },
  estetista: {
    title: 'Estetista',
    description: 'In arrivo il catalogo servizi estetici con prezzi, recensioni e disponibilita.',
    icon: Sparkles,
  },
  parrucchiere: {
    title: 'Parrucchiere',
    description: 'Stiamo completando la prenotazione capelli con servizi e pacchetti dedicati.',
    icon: Scissors,
  },
  unghie: {
    title: 'Nail Services',
    description: 'Questa area ospitera servizi manicure e pedicure con prenotazione immediata.',
    icon: Hand,
  },
  massaggi: {
    title: 'Massaggi',
    description: 'Stiamo completando i percorsi massaggio benessere e sportivo con booking online.',
    icon: Flower2,
  },
  'home-services': {
    title: 'Servizi a Domicilio',
    description: 'In sviluppo il flusso completo per prenotare professionisti VLife a domicilio.',
    icon: Home,
  },
  centers: {
    title: 'Centri VLife',
    description: 'Presto disponibile la mappa completa centri wellness ed estetica con filtri reali.',
    icon: MapPin,
  },
  hyperbaric: {
    title: 'Camera Iperbarica',
    description: 'Stiamo finalizzando il percorso prenotazione per sessioni in camera iperbarica.',
    icon: Wind,
  },
};

export type ProfileRouteSection = 'addresses' | 'payment' | 'notifications' | 'settings';

export const PROFILE_ROUTE_CONTENT: Record<ProfileRouteSection, FeatureRouteContent> = {
  addresses: {
    title: 'I Miei Indirizzi',
    description: 'Gestione indirizzi in arrivo: casa, lavoro e preferenze per servizi a domicilio.',
    icon: MapPin,
    primaryAction: { href: '/profile/edit', label: 'Modifica Profilo' },
    secondaryAction: { href: '/profile', label: 'Torna al Profilo' },
  },
  payment: {
    title: 'Metodi di Pagamento',
    description: 'Questa sezione conterra carte salvate, wallet e metodi di pagamento preferiti.',
    icon: CreditCard,
    primaryAction: { href: '/booking/confirm', label: 'Vai al Checkout' },
    secondaryAction: { href: '/profile', label: 'Torna al Profilo' },
  },
  notifications: {
    title: 'Preferenze Notifiche',
    description: 'Impostazioni granulari per push, email e promemoria prenotazioni in corso di sviluppo.',
    icon: Bell,
    primaryAction: { href: '/notifications', label: 'Apri Notifiche' },
    secondaryAction: { href: '/profile', label: 'Torna al Profilo' },
  },
  settings: {
    title: 'Impostazioni Account',
    description: 'Qui arriveranno opzioni account, privacy, lingua e gestione sessioni.',
    icon: Settings,
    primaryAction: { href: '/profile', label: 'Torna al Profilo' },
  },
};

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
import type { MessageKey } from '@/i18n/messages';
import type { PlaceholderAction } from '@/components/screens/FeaturePlaceholderPage';

interface PlaceholderActionContent {
  href: string;
  labelKey: MessageKey;
}

export interface FeatureRouteContent {
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  icon: LucideIcon;
  badgeKey?: MessageKey;
  notesKeys?: MessageKey[];
  primaryAction?: PlaceholderActionContent;
  secondaryAction?: PlaceholderActionContent;
}

export function toPlaceholderAction(action?: PlaceholderActionContent): PlaceholderAction | undefined {
  if (!action) return undefined;
  return {
    href: action.href,
    labelKey: action.labelKey,
  };
}

export type FunRouteSlug = 'events' | 'vr' | 'parties' | 'party-mode' | 'tv';

export const FUN_ROUTE_CONTENT: Record<FunRouteSlug, FeatureRouteContent> = {
  events: {
    titleKey: 'route.fun.events.title',
    descriptionKey: 'route.fun.events.description',
    icon: Ticket,
    primaryAction: { href: '/home', labelKey: 'route.fun.events.primary' },
  },
  vr: {
    titleKey: 'route.fun.vr.title',
    descriptionKey: 'route.fun.vr.description',
    icon: Glasses,
    primaryAction: { href: '/booking', labelKey: 'route.fun.vr.primary' },
    secondaryAction: { href: '/home', labelKey: 'route.fun.vr.secondary' },
  },
  parties: {
    titleKey: 'route.fun.parties.title',
    descriptionKey: 'route.fun.parties.description',
    icon: PartyPopper,
    primaryAction: { href: '/fun/party-mode', labelKey: 'route.fun.parties.primary' },
    secondaryAction: { href: '/home', labelKey: 'route.fun.parties.secondary' },
  },
  'party-mode': {
    titleKey: 'route.fun.partyMode.title',
    descriptionKey: 'route.fun.partyMode.description',
    icon: PartyPopper,
    primaryAction: { href: '/home', labelKey: 'route.fun.partyMode.primary' },
  },
  tv: {
    titleKey: 'route.fun.tv.title',
    descriptionKey: 'route.fun.tv.description',
    icon: Tv,
    primaryAction: { href: '/home', labelKey: 'route.fun.tv.primary' },
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
    titleKey: 'route.life.osteopatia.title',
    descriptionKey: 'route.life.osteopatia.description',
    icon: Bone,
  },
  fisioterapia: {
    titleKey: 'route.life.fisioterapia.title',
    descriptionKey: 'route.life.fisioterapia.description',
    icon: Activity,
  },
  'mental-coach': {
    titleKey: 'route.life.mentalCoach.title',
    descriptionKey: 'route.life.mentalCoach.description',
    icon: Brain,
  },
  psicologo: {
    titleKey: 'route.life.psicologo.title',
    descriptionKey: 'route.life.psicologo.description',
    icon: HeartHandshake,
  },
  estetista: {
    titleKey: 'route.life.estetista.title',
    descriptionKey: 'route.life.estetista.description',
    icon: Sparkles,
  },
  parrucchiere: {
    titleKey: 'route.life.parrucchiere.title',
    descriptionKey: 'route.life.parrucchiere.description',
    icon: Scissors,
  },
  unghie: {
    titleKey: 'route.life.unghie.title',
    descriptionKey: 'route.life.unghie.description',
    icon: Hand,
  },
  massaggi: {
    titleKey: 'route.life.massaggi.title',
    descriptionKey: 'route.life.massaggi.description',
    icon: Flower2,
  },
  'home-services': {
    titleKey: 'route.life.homeServices.title',
    descriptionKey: 'route.life.homeServices.description',
    icon: Home,
  },
  centers: {
    titleKey: 'route.life.centers.title',
    descriptionKey: 'route.life.centers.description',
    icon: MapPin,
  },
  hyperbaric: {
    titleKey: 'route.life.hyperbaric.title',
    descriptionKey: 'route.life.hyperbaric.description',
    icon: Wind,
  },
};

export type ProfileRouteSection = 'addresses' | 'payment' | 'notifications' | 'settings';

export const PROFILE_ROUTE_CONTENT: Record<ProfileRouteSection, FeatureRouteContent> = {
  addresses: {
    titleKey: 'route.profile.addresses.title',
    descriptionKey: 'route.profile.addresses.description',
    icon: MapPin,
    primaryAction: { href: '/profile/edit', labelKey: 'route.profile.addresses.primary' },
    secondaryAction: { href: '/profile', labelKey: 'route.profile.addresses.secondary' },
  },
  payment: {
    titleKey: 'route.profile.payment.title',
    descriptionKey: 'route.profile.payment.description',
    icon: CreditCard,
    primaryAction: { href: '/booking/confirm', labelKey: 'route.profile.payment.primary' },
    secondaryAction: { href: '/profile', labelKey: 'route.profile.payment.secondary' },
  },
  notifications: {
    titleKey: 'route.profile.notifications.title',
    descriptionKey: 'route.profile.notifications.description',
    icon: Bell,
    primaryAction: { href: '/notifications', labelKey: 'route.profile.notifications.primary' },
    secondaryAction: { href: '/profile', labelKey: 'route.profile.notifications.secondary' },
  },
  settings: {
    titleKey: 'route.profile.settings.title',
    descriptionKey: 'route.profile.settings.description',
    icon: Settings,
    primaryAction: { href: '/profile', labelKey: 'route.profile.settings.primary' },
  },
};

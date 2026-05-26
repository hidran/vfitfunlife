export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
}

// Single source of truth for service categories shown in booking search,
// the registration provider opt-in, and the profile "become a provider" card.
// `name` is the Italian label stored on instructors.providerProfile.specialties
// (booking search matches specialties by this name).
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: 'personal_training', name: 'Personal Training', icon: '💪' },
  { id: 'yoga', name: 'Yoga', icon: '🧘' },
  { id: 'pilates', name: 'Pilates', icon: '🤸' },
  { id: 'massage', name: 'Massaggio', icon: '💆' },
  { id: 'nutrition', name: 'Nutrizione', icon: '🥗' },
  { id: 'physio', name: 'Fisioterapia', icon: '🏥' },
];

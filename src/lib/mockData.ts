// Mock data for VFit (Fitness) section

export interface Venue {
  id: string;
  name: string;
  image: string;
  rating: number;
  reviewCount: number;
  distance: number; // in km
  address: string;
  isPartner: boolean;
  amenities: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface FitnessClass {
  id: string;
  name: string;
  instructor: string;
  instructorImage: string;
  time: string;
  duration: number; // in minutes
  totalSpots: number;
  availableSpots: number;
  venue: string;
  venueId: string;
  category: 'yoga' | 'pilates' | 'hiit' | 'spinning' | 'crossfit' | 'functional' | 'dance';
}

export interface Instructor {
  id: string;
  name: string;
  image: string;
  specialty: string;
  rating: number;
  reviewCount: number;
  yearsExperience: number;
  isAvailable: boolean;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  image: string;
  progress: number; // 0-100
  daysLeft: number;
  participants: number;
  reward: string;
  type: 'steps' | 'workouts' | 'calories' | 'streak';
}

// Mock Venues (Palestre)
export const mockVenues: Venue[] = [
  {
    id: '1',
    name: 'FitLife Centro',
    image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop',
    rating: 4.8,
    reviewCount: 324,
    distance: 0.8,
    address: 'Via Roma 42, Milano',
    isPartner: true,
    amenities: ['pool', 'sauna', 'parking', 'spa'],
    coordinates: { lat: 45.4642, lng: 9.1900 },
  },
  {
    id: '2',
    name: 'Gym Factory',
    image: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=400&h=300&fit=crop',
    rating: 4.6,
    reviewCount: 189,
    distance: 1.2,
    address: 'Corso Buenos Aires 15, Milano',
    isPartner: false,
    amenities: ['weights', 'cardio', 'classes'],
    coordinates: { lat: 45.4773, lng: 9.2122 },
  },
  {
    id: '3',
    name: 'Urban Fitness Club',
    image: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400&h=300&fit=crop',
    rating: 4.9,
    reviewCount: 412,
    distance: 1.5,
    address: 'Via Torino 88, Milano',
    isPartner: true,
    amenities: ['pool', 'crossfit', 'boxing', 'spa'],
    coordinates: { lat: 45.4605, lng: 9.1820 },
  },
  {
    id: '4',
    name: 'Power House Gym',
    image: 'https://images.unsplash.com/photo-1593079831268-3381b0db4a77?w=400&h=300&fit=crop',
    rating: 4.5,
    reviewCount: 156,
    distance: 2.1,
    address: 'Via Dante 23, Milano',
    isPartner: false,
    amenities: ['weights', 'cardio', 'personal training'],
    coordinates: { lat: 45.4668, lng: 9.1851 },
  },
  {
    id: '5',
    name: 'Elite Sport Center',
    image: 'https://images.unsplash.com/photo-1558611848-73f7eb4001a1?w=400&h=300&fit=crop',
    rating: 4.7,
    reviewCount: 278,
    distance: 2.8,
    address: 'Viale Monza 140, Milano',
    isPartner: true,
    amenities: ['pool', 'tennis', 'padel', 'spa', 'restaurant'],
    coordinates: { lat: 45.4890, lng: 9.2230 },
  },
];

// Mock Classes (Corsi)
export const mockClasses: FitnessClass[] = [
  {
    id: '1',
    name: 'Power Yoga',
    instructor: 'Maria Rossi',
    instructorImage: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=100&h=100&fit=crop',
    time: '09:00',
    duration: 60,
    totalSpots: 20,
    availableSpots: 5,
    venue: 'FitLife Centro',
    venueId: '1',
    category: 'yoga',
  },
  {
    id: '2',
    name: 'HIIT Blast',
    instructor: 'Marco Bianchi',
    instructorImage: 'https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=100&h=100&fit=crop',
    time: '10:30',
    duration: 45,
    totalSpots: 15,
    availableSpots: 3,
    venue: 'Gym Factory',
    venueId: '2',
    category: 'hiit',
  },
  {
    id: '3',
    name: 'Spinning Energy',
    instructor: 'Laura Verdi',
    instructorImage: 'https://images.unsplash.com/photo-1548690312-e3b507d8c110?w=100&h=100&fit=crop',
    time: '12:00',
    duration: 50,
    totalSpots: 25,
    availableSpots: 8,
    venue: 'Urban Fitness Club',
    venueId: '3',
    category: 'spinning',
  },
  {
    id: '4',
    name: 'CrossFit WOD',
    instructor: 'Andrea Ferrari',
    instructorImage: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=100&h=100&fit=crop',
    time: '14:00',
    duration: 60,
    totalSpots: 12,
    availableSpots: 2,
    venue: 'Power House Gym',
    venueId: '4',
    category: 'crossfit',
  },
  {
    id: '5',
    name: 'Pilates Core',
    instructor: 'Sofia Russo',
    instructorImage: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=100&h=100&fit=crop',
    time: '17:30',
    duration: 55,
    totalSpots: 18,
    availableSpots: 6,
    venue: 'Elite Sport Center',
    venueId: '5',
    category: 'pilates',
  },
  {
    id: '6',
    name: 'Zumba Party',
    instructor: 'Chiara Conti',
    instructorImage: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=100&h=100&fit=crop',
    time: '19:00',
    duration: 60,
    totalSpots: 30,
    availableSpots: 12,
    venue: 'FitLife Centro',
    venueId: '1',
    category: 'dance',
  },
];

// Mock Instructors
export const mockInstructors: Instructor[] = [
  {
    id: '1',
    name: 'Maria Rossi',
    image: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=200&h=200&fit=crop',
    specialty: 'Yoga & Pilates',
    rating: 4.9,
    reviewCount: 256,
    yearsExperience: 8,
    isAvailable: true,
  },
  {
    id: '2',
    name: 'Marco Bianchi',
    image: 'https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=200&h=200&fit=crop',
    specialty: 'HIIT & Functional',
    rating: 4.8,
    reviewCount: 189,
    yearsExperience: 6,
    isAvailable: true,
  },
  {
    id: '3',
    name: 'Laura Verdi',
    image: 'https://images.unsplash.com/photo-1548690312-e3b507d8c110?w=200&h=200&fit=crop',
    specialty: 'Spinning & Cardio',
    rating: 4.7,
    reviewCount: 312,
    yearsExperience: 10,
    isAvailable: false,
  },
  {
    id: '4',
    name: 'Andrea Ferrari',
    image: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200&h=200&fit=crop',
    specialty: 'CrossFit & Strength',
    rating: 4.9,
    reviewCount: 178,
    yearsExperience: 7,
    isAvailable: true,
  },
  {
    id: '5',
    name: 'Sofia Russo',
    image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=200&h=200&fit=crop',
    specialty: 'Pilates & Stretching',
    rating: 4.8,
    reviewCount: 234,
    yearsExperience: 9,
    isAvailable: true,
  },
];

// Mock Challenges
export const mockChallenges: Challenge[] = [
  {
    id: '1',
    title: '10K Steps Challenge',
    description: 'Walk 10,000 steps every day for 30 days',
    image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=400&h=200&fit=crop',
    progress: 65,
    daysLeft: 12,
    participants: 1247,
    reward: '50 V-Points',
    type: 'steps',
  },
  {
    id: '2',
    title: 'Workout Warrior',
    description: 'Complete 20 workouts this month',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&h=200&fit=crop',
    progress: 40,
    daysLeft: 18,
    participants: 892,
    reward: '100 V-Points',
    type: 'workouts',
  },
  {
    id: '3',
    title: '7-Day Streak',
    description: 'Train 7 days in a row',
    image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=200&fit=crop',
    progress: 85,
    daysLeft: 2,
    participants: 2341,
    reward: '25 V-Points',
    type: 'streak',
  },
];

// Quick actions for VFit section
export const vfitQuickActions = [
  {
    id: 'gyms',
    label: 'Palestre',
    icon: 'MapPin',
    href: '/fit/gyms',
  },
  {
    id: 'classes',
    label: 'Corsi',
    icon: 'Dumbbell',
    href: '/fit/classes',
  },
  {
    id: 'home',
    label: 'A Domicilio',
    icon: 'Home',
    href: '/fit/home-training',
  },
  {
    id: 'virtual',
    label: 'Virtual',
    icon: 'Video',
    href: '/fit/virtual',
  },
];

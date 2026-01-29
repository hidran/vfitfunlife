import {
  Car,
  Dumbbell,
  Wifi,
  Droplet,
} from 'lucide-react';

export const venues = [
  {
    id: 'carosello',
    name: 'Carosello Fitness',
    rating: 4.8,
    reviews: 124,
    partner: true,
    address: 'Via Torino 21, Milano',
    description:
      'Un centro fitness moderno con spazi ampi, area functional e sale corsi dedicate. Ideale per allenamenti completi e personalizzati.',
    hours: [
      { day: 'Lun - Ven', time: '06:00 - 22:00' },
      { day: 'Sabato', time: '08:00 - 20:00' },
      { day: 'Domenica', time: '09:00 - 18:00' },
    ],
    amenities: [
      { label: 'Sala pesi', icon: Dumbbell },
      { label: 'Wi-Fi', icon: Wifi },
      { label: 'Parcheggio', icon: Car },
      { label: 'Docce', icon: Droplet },
    ],
    services: [
      { name: 'Accesso giornaliero', price: 18 },
      { name: 'Abbonamento mensile', price: 59 },
      { name: 'Personal training', price: 45 },
    ],
    courses: [
      { time: '07:30', name: 'HIIT Power', coach: 'Marco R.', spots: 3 },
      { time: '12:15', name: 'Pilates Flow', coach: 'Elena B.', spots: 6 },
      { time: '19:00', name: 'Functional 360', coach: 'Luca S.', spots: 2 },
    ],
    hero: [
      'from-vfit-secondary/40 via-vfit-primary/30 to-transparent',
      'from-vfit-primary/35 via-vfit-accent/25 to-transparent',
      'from-vfit-secondary/30 via-vfit-accent/25 to-transparent',
    ],
  },
  {
    id: 'urban-core',
    name: 'Urban Core Gym',
    rating: 4.9,
    reviews: 98,
    partner: false,
    address: 'Viale Liberazione 12, Milano',
    description:
      'Allenamenti ad alta intensita in un ambiente urbano con coach dedicati e attrezzatura premium.',
    hours: [
      { day: 'Lun - Ven', time: '06:30 - 23:00' },
      { day: 'Sabato', time: '08:00 - 21:00' },
      { day: 'Domenica', time: '09:00 - 17:00' },
    ],
    amenities: [
      { label: 'Sala pesi', icon: Dumbbell },
      { label: 'Wi-Fi', icon: Wifi },
      { label: 'Parcheggio', icon: Car },
      { label: 'Docce', icon: Droplet },
    ],
    services: [
      { name: 'Day pass', price: 20 },
      { name: 'Abbonamento mensile', price: 69 },
      { name: 'Boxing class', price: 35 },
    ],
    courses: [
      { time: '08:00', name: 'Boxing Burn', coach: 'Daniele M.', spots: 4 },
      { time: '18:15', name: 'CrossFit Core', coach: 'Sara C.', spots: 5 },
      { time: '20:00', name: 'Mobility Flow', coach: 'Giulia L.', spots: 7 },
    ],
    hero: [
      'from-vfit-secondary/35 via-vfit-primary/25 to-transparent',
      'from-vfit-primary/35 via-vfit-accent/30 to-transparent',
      'from-vfit-secondary/30 via-vfit-accent/20 to-transparent',
    ],
  },
];

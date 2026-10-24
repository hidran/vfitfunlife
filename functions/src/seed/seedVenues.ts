/**
 * The venue documents the seeders write, built here as pure functions so seedVenues.test.ts can
 * hold every one of them against the canonical shape (venues/venueSchema.ts). seedData.ts only
 * writes what these return.
 *
 * No Firestore import on purpose: the test runs without an app or an emulator. `now` is the
 * caller's Timestamp.
 */
import type { VenueType } from "../types";
import type { VenueDoc } from "../venues/venueSchema";

export const GYM_NAMES = [
  "Carosello Fitness", "Urban Core Gym", "Village Fit Club",
  "Olympic Gym", "Body Center", "Fit Space", "Wellness Hub",
  "Energy Fitness", "Power Gym", "FitLab",
];
export const WELLNESS_CENTER_NAMES = [
  "Wellness Spa Milano", "Centro Benessere Navigli",
  "Beauty & Wellness Hub", "Oasi del Relax",
  "Spa Metropolitan", "Centro Armonia", "Benessere & Co",
];
const SPA_NAMES = ["Oasi Spa", "Zen Spa", "Aurora Spa", "Lumina Spa", "Pure Spa"];
const BEAUTY_NAMES = ["Belle Beauty", "Glow Studio", "Lumiere Beauty", "Charme Salon"];

export interface DemoCity {
  name: string;
  lat: number;
  lng: number;
}

/** The cities every demo seed spreads its data over (venues, trainers, coordinates). */
export const DEMO_CITIES: readonly DemoCity[] = [
  { name: "Milano", lat: 45.4642, lng: 9.19 },
  { name: "Roma", lat: 41.9028, lng: 12.4964 },
  { name: "Torino", lat: 45.0703, lng: 7.6869 },
  { name: "Bologna", lat: 44.4949, lng: 11.3426 },
  { name: "Firenze", lat: 43.7696, lng: 11.2558 },
  { name: "Napoli", lat: 40.8518, lng: 14.2681 },
  { name: "Venezia", lat: 45.4408, lng: 12.3155 },
  { name: "Verona", lat: 45.4384, lng: 10.9916 },
  { name: "Genova", lat: 44.4056, lng: 8.9463 },
  { name: "Bari", lat: 41.1171, lng: 16.8719 },
  { name: "Palermo", lat: 38.1157, lng: 13.3615 },
  { name: "Catania", lat: 37.5079, lng: 15.083 },
];

const STREETS = [
  "Via Roma", "Via Garibaldi", "Corso Italia", "Via Mazzini",
  "Viale della Liberta", "Via Dante", "Corso Vittorio", "Via Cavour",
];

const HERO_GRADIENTS = [
  "from-vfit-secondary/40 via-vfit-primary/30 to-transparent",
  "from-vfit-primary/35 via-vfit-accent/25 to-transparent",
  "from-vfit-secondary/30 via-vfit-accent/25 to-transparent",
  "from-vfit-accent/30 via-vfit-primary/20 to-transparent",
];

type AmenityKind =
  | "weights" | "wifi" | "parking" | "showers" | "lockers"
  | "bar" | "sauna" | "pool" | "crossfit" | "boxing" | "yoga"
  | "pilates" | "spa" | "tennis" | "cardio";

const GYM_AMENITIES: AmenityKind[] = [
  "weights", "cardio", "crossfit", "showers", "lockers", "wifi", "parking", "boxing",
];
const WELLNESS_AMENITIES: AmenityKind[] = ["sauna", "pool", "yoga", "pilates", "showers", "wifi", "parking", "spa"];
const SPA_AMENITIES: AmenityKind[] = ["sauna", "pool", "spa", "showers", "wifi", "parking", "bar"];
const BEAUTY_AMENITIES: AmenityKind[] = ["wifi", "parking", "lockers"];

const GYM_DESCRIPTIONS = [
  "Centro fitness moderno con spazi ampi, area functional e sale corsi dedicate.",
  "Palestra di ultima generazione con attrezzatura premium e staff qualificato.",
  "Ambiente dinamico per allenamenti efficaci, dal cardio alla forza.",
  "Spazio fitness curato, ideale per chi vuole allenarsi con serietà.",
  "Palestra urban con coach dedicati e programmi personalizzati.",
];
const WELLNESS_DESCRIPTIONS = [
  "Centro benessere con trattamenti olistici e spazi relax di alto livello.",
  "Oasi di equilibrio tra corpo e mente con programmi wellness integrati.",
  "Ambiente armonioso dedicato al benessere fisico e mentale.",
  "Centro specializzato in trattamenti rigenerativi e attività mindfulness.",
];
const SPA_DESCRIPTIONS = [
  "Spa esclusiva con cabine trattamento, sauna e area relax.",
  "Rifugio di lusso per rituali benessere e massaggi professionali.",
  "Centro termale urbano con piscina, sauna e percorsi relax.",
  "Spa boutique con trattamenti personalizzati e atmosfera unica.",
];
const BEAUTY_DESCRIPTIONS = [
  "Salone di bellezza specializzato in trattamenti viso e corpo.",
  "Studio estetico con le ultime tecnologie per la cura della persona.",
  "Centro estetico professionale con trattamenti su misura.",
];

export interface VenueServiceTemplate {
  name: string;
  price: number;
  durationMinutes?: number;
  isActive: boolean;
}

const GYM_SERVICES: VenueServiceTemplate[] = [
  { name: "Accesso giornaliero", price: 18, isActive: true },
  { name: "Abbonamento mensile", price: 59, isActive: true },
  { name: "Abbonamento trimestrale", price: 149, isActive: true },
  { name: "Personal training", price: 50, durationMinutes: 60, isActive: true },
  { name: "Lezione di gruppo", price: 20, durationMinutes: 55, isActive: true },
];
const WELLNESS_SERVICES: VenueServiceTemplate[] = [
  { name: "Sessione Yoga", price: 25, durationMinutes: 60, isActive: true },
  { name: "Sessione Pilates", price: 30, durationMinutes: 55, isActive: true },
  { name: "Pacchetto wellness mensile", price: 90, isActive: true },
  { name: "Consulenza benessere", price: 45, durationMinutes: 45, isActive: true },
  { name: "Accesso giornaliero", price: 22, isActive: true },
];
const SPA_SERVICES: VenueServiceTemplate[] = [
  { name: "Massaggio rilassante 60min", price: 65, durationMinutes: 60, isActive: true },
  { name: "Massaggio decontratturante", price: 75, durationMinutes: 60, isActive: true },
  { name: "Pacchetto wellness coppia", price: 140, durationMinutes: 90, isActive: true },
  { name: "Percorso spa completo", price: 110, durationMinutes: 120, isActive: true },
  { name: "Trattamento viso premium", price: 80, durationMinutes: 75, isActive: true },
];
const BEAUTY_SERVICES: VenueServiceTemplate[] = [
  { name: "Manicure", price: 25, durationMinutes: 45, isActive: true },
  { name: "Pedicure", price: 30, durationMinutes: 50, isActive: true },
  { name: "Trattamento viso", price: 55, durationMinutes: 60, isActive: true },
  { name: "Colorazione capelli", price: 70, durationMinutes: 90, isActive: true },
  { name: "Ceretta completa", price: 40, durationMinutes: 60, isActive: true },
];

const HOURS_VARIANTS = [
  [
    { day: "Lun - Ven", time: "07:00 - 22:00" },
    { day: "Sabato", time: "08:00 - 21:00" },
    { day: "Domenica", time: "09:00 - 18:00" },
  ],
  [
    { day: "Lun - Ven", time: "06:30 - 23:00" },
    { day: "Sabato", time: "08:00 - 20:00" },
    { day: "Domenica", time: "09:00 - 17:00" },
  ],
  [
    { day: "Lun - Ven", time: "07:30 - 21:30" },
    { day: "Sabato", time: "09:00 - 21:00" },
    { day: "Domenica", time: "10:00 - 19:00" },
  ],
  [
    { day: "Lun - Dom", time: "07:00 - 22:00" },
  ],
];

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min: number, max: number, decimals = 1) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
const randomItem = <T>(array: readonly T[]): T => array[Math.floor(Math.random() * array.length)];
const randomItems = <T>(array: readonly T[], count: number) =>
  [...array].sort(() => 0.5 - Math.random()).slice(0, count);

/** URL-safe kebab-case ASCII slug: "Personal Training" → "personal-training". */
export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A plausible Italian postcode as a string (never a number: the admin form stores a string). */
const randomZipCode = () => String(randomInt(10000, 98999));

/** A point within about ±2 km of a city centre, rounded to 6 decimals. */
function jittered(city: DemoCity): { lat: number; lng: number } {
  return {
    lat: parseFloat((city.lat + (Math.random() - 0.5) * 0.04).toFixed(6)),
    lng: parseFloat((city.lng + (Math.random() - 0.5) * 0.04).toFixed(6)),
  };
}

/** The timestamp a seeder stamps; opaque here so this module needs no Firestore import. */
export type SeedTimestamp = unknown;

/**
 * One venue of the generic `seedVenues(count)` seeder (the admin "seed data" endpoint). Gyms
 * and wellness centres, spread over the demo cities with the canonical flat address fields.
 */
export function randomVenueDoc(id: string, now: SeedTimestamp): VenueDoc {
  const isGym = Math.random() > 0.4;
  const city = randomItem(DEMO_CITIES);
  const name = isGym ?
    `${randomItem(GYM_NAMES)} ${city.name}` :
    `${randomItem(WELLNESS_CENTER_NAMES).split(" ")[0]} Wellness ${city.name}`;
  const amenityPool = isGym ? GYM_AMENITIES : WELLNESS_AMENITIES;
  return {
    id,
    name,
    slug: toSlug(name),
    type: isGym ? "gym" : "wellness_center",
    description: `${name} offre servizi professionali ${
      isGym ? "di fitness e allenamento" : "di benessere e bellezza"
    } nel cuore della città.`,
    address: `${randomItem(STREETS)} ${randomInt(1, 200)}`,
    city: city.name,
    zipCode: randomZipCode(),
    country: "IT",
    ...jittered(city),
    phone: `+39 02 ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`,
    email: `info@${toSlug(name).replace(/-/g, "")}.it`,
    website: `https://www.${toSlug(name).replace(/-/g, "")}.it`,
    rating: randomFloat(3.5, 5.0),
    reviewCount: randomInt(10, 300),
    isActive: true,
    isPartner: Math.random() > 0.3,
    amenities: randomItems(amenityPool, randomInt(3, 6)).map((kind) => ({ kind })),
    hours: randomItem(HOURS_VARIANTS),
    heroGradients: randomItems(HERO_GRADIENTS, randomInt(1, 3)),
    photoUrls: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ===== Sample venue seed data (deterministic, used by the app's seeded demo flows) =====

export interface SampleVenueData {
  id: string;
  name: string;
  slug: string;
  type: VenueType;
  city: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  isPartner: boolean;
  isActive: boolean;
  description: string;
  heroGradients: string[];
  amenities: { kind: string }[];
  hours: { day: string; time: string }[];
  services: { id: string; name: string; price: number; durationMinutes?: number; isActive: boolean }[];
}

export const SAMPLE_VENUES: SampleVenueData[] = [
  {
    id: "carosello",
    name: "Carosello Fitness",
    slug: "carosello-fitness",
    type: "gym",
    city: "Milano",
    address: "Via Torino 21",
    lat: 45.4642,
    lng: 9.19,
    rating: 4.8,
    reviewCount: 124,
    isPartner: true,
    isActive: true,
    description:
      "Un centro fitness moderno con spazi ampi, area functional e sale corsi dedicate.",
    heroGradients: [
      "from-vfit-secondary/40 via-vfit-primary/30 to-transparent",
      "from-vfit-primary/35 via-vfit-accent/25 to-transparent",
      "from-vfit-secondary/30 via-vfit-accent/25 to-transparent",
    ],
    amenities: [
      { kind: "weights" }, { kind: "wifi" }, { kind: "parking" }, { kind: "showers" },
    ],
    hours: [
      { day: "Lun - Ven", time: "06:00 - 22:00" },
      { day: "Sabato", time: "08:00 - 20:00" },
      { day: "Domenica", time: "09:00 - 18:00" },
    ],
    services: [
      { id: "svc-1", name: "Accesso giornaliero", price: 18, isActive: true },
      { id: "svc-2", name: "Abbonamento mensile", price: 59, isActive: true },
      { id: "svc-3", name: "Personal training", price: 45, durationMinutes: 60, isActive: true },
    ],
  },
  {
    id: "urban-core",
    name: "Urban Core Gym",
    slug: "urban-core-gym",
    type: "gym",
    city: "Milano",
    address: "Viale Liberazione 12",
    lat: 45.4789,
    lng: 9.1965,
    rating: 4.9,
    reviewCount: 98,
    isPartner: false,
    isActive: true,
    description:
      "Allenamenti ad alta intensita in un ambiente urbano con coach dedicati e attrezzatura premium.",
    heroGradients: [
      "from-vfit-primary/40 via-vfit-secondary/30 to-transparent",
      "from-vfit-accent/35 via-vfit-primary/25 to-transparent",
    ],
    amenities: [{ kind: "weights" }, { kind: "wifi" }, { kind: "showers" }],
    hours: [
      { day: "Lun - Ven", time: "06:30 - 23:00" },
      { day: "Sabato", time: "08:00 - 21:00" },
      { day: "Domenica", time: "09:00 - 17:00" },
    ],
    services: [
      { id: "svc-1", name: "Accesso giornaliero", price: 22, isActive: true },
      { id: "svc-2", name: "Mensile All-in", price: 75, isActive: true },
    ],
  },
  {
    id: "village-fit",
    name: "Village Fit Club",
    slug: "village-fit-club",
    type: "gym",
    city: "Milano",
    address: "Navigli",
    lat: 45.4523,
    lng: 9.1756,
    rating: 4.7,
    reviewCount: 142,
    isPartner: true,
    isActive: true,
    description: "Club fitness con focus su yoga e spa.",
    heroGradients: ["from-vfit-secondary/30 via-vfit-primary/20 to-transparent"],
    amenities: [{ kind: "yoga" }, { kind: "spa" }],
    hours: [{ day: "Lun - Dom", time: "07:00 - 22:00" }],
    services: [{ id: "svc-1", name: "Drop-in", price: 20, isActive: true }],
  },
  {
    id: "pulse-studio",
    name: "Pulse Studio",
    slug: "pulse-studio",
    type: "gym",
    city: "Milano",
    address: "Isola",
    lat: 45.4834,
    lng: 9.1856,
    rating: 4.6,
    reviewCount: 67,
    isPartner: false,
    isActive: true,
    description: "Studio specializzato in Pilates e HIIT.",
    heroGradients: ["from-vfit-accent/30 via-vfit-primary/20 to-transparent"],
    amenities: [{ kind: "pilates" }, { kind: "cardio" }],
    hours: [{ day: "Lun - Sab", time: "08:00 - 21:00" }],
    services: [{ id: "svc-1", name: "Lezione Pilates", price: 25, durationMinutes: 55, isActive: true }],
  },
  {
    id: "elite-fitness",
    name: "Elite Fitness Center",
    slug: "elite-fitness-center",
    type: "gym",
    city: "Milano",
    address: "Brera",
    lat: 45.4701,
    lng: 9.1854,
    rating: 4.9,
    reviewCount: 215,
    isPartner: true,
    isActive: true,
    description: "Centro premium con piscina e campi da tennis.",
    heroGradients: ["from-vfit-secondary/40 via-vfit-accent/30 to-transparent"],
    amenities: [{ kind: "pool" }, { kind: "tennis" }, { kind: "spa" }],
    hours: [{ day: "Lun - Dom", time: "06:00 - 23:00" }],
    services: [{ id: "svc-1", name: "Day pass", price: 35, isActive: true }],
  },
  {
    id: "power-gym",
    name: "Power Gym Milano",
    slug: "power-gym-milano",
    type: "gym",
    city: "Milano",
    address: "Porta Romana",
    lat: 45.4456,
    lng: 9.2056,
    rating: 4.5,
    reviewCount: 89,
    isPartner: false,
    isActive: true,
    description: "Sala pesi essenziale con focus su forza e cardio.",
    heroGradients: ["from-vfit-primary/30 via-vfit-accent/20 to-transparent"],
    amenities: [{ kind: "weights" }, { kind: "cardio" }],
    hours: [{ day: "Lun - Dom", time: "06:00 - 22:00" }],
    services: [{ id: "svc-1", name: "Mensile", price: 39, isActive: true }],
  },
];

/** The `venues/{id}` document of a sample venue (its services go in the subcollection). */
export function sampleVenueDoc(v: SampleVenueData, now: SeedTimestamp): VenueDoc {
  const venue: Partial<SampleVenueData> = { ...v };
  delete venue.services;
  return { ...(venue as Omit<SampleVenueData, "services">), photoUrls: [], createdAt: now, updatedAt: now };
}

// ===== generateDemoData venues: 10 per city, deterministic ids =====

export type DemoVenueType = "gym" | "wellness_center" | "spa" | "beauty_salon";

export interface DemoVenueSlot {
  type: DemoVenueType;
  /** Within this type for this city, 1-based. */
  index: number;
}

/** 5 gyms, 2 wellness centres, 2 spas and a beauty salon per city. */
export const DEMO_VENUE_SLOTS: readonly DemoVenueSlot[] = [
  ...Array.from({ length: 5 }, (_, i) => ({ type: "gym" as const, index: i + 1 })),
  ...Array.from({ length: 2 }, (_, i) => ({ type: "wellness_center" as const, index: i + 1 })),
  ...Array.from({ length: 2 }, (_, i) => ({ type: "spa" as const, index: i + 1 })),
  { type: "beauty_salon", index: 1 },
];

const byType = <T>(type: DemoVenueType, gym: T, wellness: T, spa: T, beauty: T): T => {
  if (type === "gym") return gym;
  if (type === "wellness_center") return wellness;
  if (type === "spa") return spa;
  return beauty;
};

/** The `venues/{id}/services` templates for one demo venue type. */
export function demoVenueServiceTemplates(type: DemoVenueType): VenueServiceTemplate[] {
  return byType(type, GYM_SERVICES, WELLNESS_SERVICES, SPA_SERVICES, BEAUTY_SERVICES);
}

/** The id of one demo venue slot: `demo-venue-<city>-<type>-<n>`. */
export function demoVenueId(city: DemoCity, slot: DemoVenueSlot): string {
  return `demo-venue-${toSlug(city.name)}-${slot.type.replace("_", "-")}-${slot.index}`;
}

/**
 * One venue of generateDemoData. `cityIndex` is the city's position in DEMO_CITIES (it only
 * varies the street). Random within the slot's bounds: jittered coordinates, amenities, rating.
 */
export function demoVenueDoc(city: DemoCity, cityIndex: number, slot: DemoVenueSlot, now: SeedTimestamp): VenueDoc {
  const { type, index } = slot;
  const name = byType(
    type,
    () => `${GYM_NAMES[(index - 1) % GYM_NAMES.length]} ${city.name}`,
    () => `${WELLNESS_CENTER_NAMES[(index - 1) % WELLNESS_CENTER_NAMES.length].split(" ")[0]} Wellness ${city.name}`,
    () => `${SPA_NAMES[(index - 1) % SPA_NAMES.length]} ${city.name}`,
    () => `${BEAUTY_NAMES[(index - 1) % BEAUTY_NAMES.length]} ${city.name}`,
  )();
  const amenityPool = byType(type, GYM_AMENITIES, WELLNESS_AMENITIES, SPA_AMENITIES, BEAUTY_AMENITIES);
  const amenityCount = type === "beauty_salon" ?
    Math.min(randomInt(2, 3), amenityPool.length) :
    randomInt(3, 6);
  const description = randomItem(
    byType(type, GYM_DESCRIPTIONS, WELLNESS_DESCRIPTIONS, SPA_DESCRIPTIONS, BEAUTY_DESCRIPTIONS),
  );

  return {
    name,
    slug: toSlug(name),
    type,
    city: city.name,
    // The street line alone: `city` is its own field (the old seed appended ", <city>").
    address: `${STREETS[(index + cityIndex) % STREETS.length]} ${randomInt(1, 150)}`,
    country: "IT",
    ...jittered(city),
    rating: randomFloat(4.2, 5.0, 1),
    reviewCount: randomInt(20, 280),
    isPartner: Math.random() < 0.35,
    isActive: true,
    description,
    heroGradients: randomItems(HERO_GRADIENTS, randomInt(1, 3)),
    amenities: randomItems(amenityPool, amenityCount).map((kind) => ({ kind })),
    hours: HOURS_VARIANTS[(index - 1) % HOURS_VARIANTS.length],
    photoUrls: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** A random 2–5 of the type's service templates, as `{ id, data }` for `venues/{id}/services`. */
export function demoVenueServices(type: DemoVenueType): { id: string; data: VenueServiceTemplate }[] {
  const templates = demoVenueServiceTemplates(type);
  const count = randomInt(2, Math.min(5, templates.length));
  return randomItems(templates, count).map((svc, i) => ({ id: `svc-${i + 1}`, data: { ...svc } }));
}

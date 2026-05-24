/**
 * VFit Demo Data Seeding
 *
 * HTTP-triggered functions to seed Firestore with demo data.
 * These functions are restricted to admin/superadmin users only.
 */

import * as functions from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

// Demo data constants
const FIRST_NAMES = [
  "Marco", "Elena", "Luca", "Giulia", "Francesco", "Sofia",
  "Alessandro", "Chiara", "Matteo", "Anna", "Davide", "Laura",
  "Andrea", "Valentina", "Simone", "Roberta", "Paolo", "Martina",
];
const LAST_NAMES = [
  "Rossi", "Bianchi", "Ferrari", "Romano", "Galli", "Costa",
  "Fontana", "Conti", "Esposito", "Ricci", "Marino", "Greco",
  "Bruno", "Moretti", "Marchetti", "Rinaldi",
];
const FITNESS_SPECIALTIES = [
  "Personal Training", "Yoga", "Pilates", "HIIT", "CrossFit",
  "Functional Training", "Strength Training", "Cardio", "Boxe", "Nutrizione",
];
const WELLNESS_SPECIALTIES = [
  "Massaggio", "Fisioterapia", "Osteopatia", "Mental Coaching",
  "Psicologia", "Nutrizione", "Yoga Therapy",
];
const GYM_NAMES = [
  "Carosello Fitness", "Urban Core Gym", "Village Fit Club",
  "Olympic Gym", "Body Center", "Fit Space", "Wellness Hub",
  "Energy Fitness", "Power Gym", "FitLab",
];
const WELLNESS_CENTER_NAMES = [
  "Wellness Spa Milano", "Centro Benessere Navigli",
  "Beauty & Wellness Hub", "Oasi del Relax",
  "Spa Metropolitan", "Centro Armonia", "Benessere & Co",
];
const CLASS_NAMES = [
  "HIIT Power", "Pilates Flow", "Yoga Morning",
  "Functional 360", "Boxe Fit", "Spinning Class",
  "Body Pump", "Zumba Dance", "Core Blast", "Stretch & Relax",
];
const CITIES = ["Milano", "Roma", "Torino", "Bologna", "Firenze", "Napoli"];
const NEIGHBORHOODS = [
  "Centro", "Navigli", "Porta Nuova", "Brera", "Isola",
  "Porta Venezia", "Garibaldi", "Loreto", "Corso Como", "Ticinese",
];

// Helper functions
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min: number, max: number, decimals = 1) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
const randomItem = <T>(array: T[]): T => array[Math.floor(Math.random() * array.length)];
const randomItems = <T>(array: T[], count: number) => [...array].sort(() => 0.5 - Math.random()).slice(0, count);

interface SeedingResult {
  success: boolean;
  collection: string;
  count: number;
  error?: string;
}

/**
 * Check if user is admin/superadmin
 */
async function isAdmin(uid: string): Promise<boolean> {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) return false;
  const role = userDoc.data()?.role;
  return role === "admin" || role === "superadmin";
}

/**
 * Clear all collections
 */
async function clearAllCollections(): Promise<SeedingResult[]> {
  const collections = ["users", "venues", "classes", "bookings", "reviews", "providers", "clients", "earnings"];
  const results: SeedingResult[] = [];

  for (const collectionName of collections) {
    try {
      const snapshot = await db.collection(collectionName).limit(500).get();
      const batch = db.batch();

      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      results.push({ success: true, collection: collectionName, count: snapshot.size });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      results.push({ success: false, collection: collectionName, count: 0, error: errorMessage });
    }
  }

  return results;
}

/**
 * Seed providers
 */
async function seedProviders(count: number): Promise<SeedingResult> {
  try {
    const batch = db.batch();

    for (let i = 0; i < count; i++) {
      const firstName = randomItem(FIRST_NAMES);
      const lastName = randomItem(LAST_NAMES);
      const fullName = `${firstName} ${lastName}`;
      const specialty = randomItem([...FITNESS_SPECIALTIES, ...WELLNESS_SPECIALTIES]);
      const isVerified = Math.random() > 0.3;

      const providerId = `provider_${Date.now()}_${i}`;
      const userRef = db.collection("users").doc(providerId);

      const userData = {
        id: providerId,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1, 99)}@demo.vfit`,
        phone: `+39 3${randomInt(0, 9)}${randomInt(0, 9)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`,
        fullName,
        firstName,
        lastName,
        avatarUrl: null,
        role: "provider",
        isEmailVerified: true,
        isPhoneVerified: Math.random() > 0.2,
        createdAt: Timestamp.fromDate(new Date(Date.now() - randomInt(30, 500) * 24 * 60 * 60 * 1000)),
        updatedAt: Timestamp.now(),
        lastLoginAt: Timestamp.fromDate(new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000)),
        bio: `Professionista specializzato in ${specialty} con anni di esperienza nel settore.`,
        pointsBalance: randomInt(0, 500),
        isVip: Math.random() > 0.8,
        addresses: [],
        notificationSettings: {
          emailNotifications: true,
          pushNotifications: true,
          smsNotifications: false,
          marketingEmails: Math.random() > 0.5,
        },
        socialLinks: {
          instagram: Math.random() > 0.5 ? `@${firstName.toLowerCase()}_trainer` : null,
          facebook: null,
          linkedin: Math.random() > 0.7 ? `linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}` : null,
          website: null,
        },
        providerProfile: {
          isActive: true,
          isVerified,
          specialties: [specialty, ...randomItems(FITNESS_SPECIALTIES, randomInt(0, 2))].slice(0, 3),
          professionalBio: `Specializzato in ${specialty} con approccio personalizzato per ogni cliente.`,
          yearsOfExperience: randomInt(1, 15),
          languages: ["Italiano", Math.random() > 0.5 ? "English" : null].filter(Boolean),
          licenseNumber: isVerified ? `LIC-${randomInt(10000, 99999)}` : null,
          rating: randomFloat(3.5, 5.0),
          reviewCount: randomInt(0, 150),
          servicePricing: [
            {
              id: `service_${providerId}_1`,
              serviceName: "Sessione Individuale",
              description: "Sessione one-to-one di 60 minuti",
              durationMinutes: 60,
              price: randomInt(50, 120),
              isActive: true,
            },
            {
              id: `service_${providerId}_2`,
              serviceName: "Pacchetto 5 Sessioni",
              description: "5 sessioni individuali con sconto",
              durationMinutes: 60,
              price: randomInt(200, 500),
              isActive: true,
            },
            {
              id: `service_${providerId}_3`,
              serviceName: "Consulenza Online",
              description: "Video call di 30 minuti",
              durationMinutes: 30,
              price: randomInt(30, 60),
              isActive: Math.random() > 0.3,
            },
          ].filter(() => Math.random() > 0.2),
          availabilitySchedule: {
            monday: {
              isAvailable: true,
              slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
            },
            tuesday: {
              isAvailable: true,
              slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
            },
            wednesday: {
              isAvailable: true,
              slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
            },
            thursday: {
              isAvailable: true,
              slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
            },
            friday: { isAvailable: true, slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "17:00" }] },
            saturday: { isAvailable: Math.random() > 0.5, slots: [{ start: "09:00", end: "13:00" }] },
            sunday: { isAvailable: false, slots: [] },
          },
          certifications: isVerified ? [
            {
              id: `cert_${providerId}_1`,
              name: `Certificazione ${specialty} Professional`,
              issuingOrganization: randomItem(["CONI", "FIF", "FISAF", "Yoga Alliance", "ANP"]),
              issueDate: Timestamp.fromDate(new Date(Date.now() -
                randomInt(365, 1000) * 24 * 60 * 60 * 1000)),
              expiryDate: Math.random() > 0.7 ?
                Timestamp.fromDate(new Date(Date.now() +
                  randomInt(100, 365) * 24 * 60 * 60 * 1000)) : null,
              documentUrl: null,
              isVerified: true,
            },
          ] : [],
          education: Math.random() > 0.5 ? [
            {
              id: `edu_${providerId}_1`,
              institution: randomItem(["Universita di Milano", "Universita di Bologna", "ISEF", "Scuola dello Sport"]),
              degree: randomItem(["Laurea", "Diploma", "Master"]),
              fieldOfStudy: specialty,
              startDate: Timestamp.fromDate(new Date(Date.now() - randomInt(2000, 3000) * 24 * 60 * 60 * 1000)),
              endDate: Timestamp.fromDate(new Date(Date.now() - randomInt(1500, 2000) * 24 * 60 * 60 * 1000)),
              isOngoing: false,
            },
          ] : [],
          portfolioImages: [],
          cancellationPolicy: "Cancellazione gratuita fino a 24 ore prima dell'appuntamento.",
        },
        performanceMetrics: {
          totalBookings: randomInt(10, 200),
          totalRevenue: randomInt(500, 15000),
          completionRate: randomFloat(80, 100),
          responseTimeMinutes: randomInt(5, 120),
        },
      };

      batch.set(userRef, userData);
    }

    await batch.commit();
    return { success: true, collection: "providers", count };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, collection: "providers", count: 0, error: errorMessage };
  }
}

/**
 * Seed customers
 */
async function seedCustomers(count: number): Promise<SeedingResult> {
  try {
    const batch = db.batch();

    for (let i = 0; i < count; i++) {
      const firstName = randomItem(FIRST_NAMES);
      const lastName = randomItem(LAST_NAMES);
      const fullName = `${firstName} ${lastName}`;

      const customerId = `customer_${Date.now()}_${i}`;
      const userRef = db.collection("users").doc(customerId);

      const userData = {
        id: customerId,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1, 99)}@demo.vfit`,
        phone: `+39 3${randomInt(0, 9)}${randomInt(0, 9)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`,
        fullName,
        firstName,
        lastName,
        avatarUrl: null,
        role: "customer",
        isEmailVerified: Math.random() > 0.1,
        isPhoneVerified: Math.random() > 0.3,
        createdAt: Timestamp.fromDate(new Date(Date.now() - randomInt(30, 400) * 24 * 60 * 60 * 1000)),
        updatedAt: Timestamp.now(),
        lastLoginAt: Timestamp.fromDate(new Date(Date.now() - randomInt(1, 60) * 24 * 60 * 60 * 1000)),
        bio: null,
        pointsBalance: randomInt(0, 1000),
        isVip: Math.random() > 0.85,
        addresses: [
          {
            id: `addr_${customerId}_1`,
            label: "Casa",
            street: `Via ${randomItem(["Roma", "Milano", "Torino", "Garibaldi", "Mazzini"])}, ${randomInt(1, 100)}`,
            city: randomItem(CITIES),
            zipCode: `${randomInt(10000, 99999)}`,
            isDefault: true,
          },
        ],
        notificationSettings: {
          emailNotifications: true,
          pushNotifications: true,
          smsNotifications: Math.random() > 0.5,
          marketingEmails: Math.random() > 0.6,
        },
        socialLinks: {},
        favoriteProviders: [],
      };

      batch.set(userRef, userData);
    }

    await batch.commit();
    return { success: true, collection: "customers", count };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, collection: "customers", count: 0, error: errorMessage };
  }
}

/**
 * Seed venues
 */
async function seedVenues(count: number): Promise<SeedingResult> {
  try {
    const batch = db.batch();

    for (let i = 0; i < count; i++) {
      const isFitness = Math.random() > 0.4;
      const name = isFitness ?
        randomItem(GYM_NAMES) + (Math.random() > 0.5 ?
          "" : ` ${randomItem(NEIGHBORHOODS)}`) :
        randomItem(WELLNESS_CENTER_NAMES);

      const venueId = `venue_${Date.now()}_${i}`;
      const venueRef = db.collection("venues").doc(venueId);

      const venueData = {
        id: venueId,
        name,
        type: isFitness ? "fitness" : "wellness",
        description: `${name} offre servizi professionali ${
          isFitness ? "di fitness e allenamento" : "di benessere e bellezza"
        } nel cuore della città.`,
        address: {
          street: `Via ${randomItem(["Roma", "Milano", "Torino", "Napoli", "Firenze"])}, ${randomInt(1, 200)}`,
          city: randomItem(CITIES),
          neighborhood: randomItem(NEIGHBORHOODS),
          zipCode: `${randomInt(10000, 99999)}`,
          country: "Italia",
          latitude: randomFloat(45.4, 45.5, 6),
          longitude: randomFloat(9.1, 9.3, 6),
        },
        phone: `+39 02 ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`,
        email: `info@${name.toLowerCase().replace(/\s+/g, "")}.it`,
        website: `https://www.${name.toLowerCase().replace(/\s+/g, "")}.it`,
        rating: randomFloat(3.5, 5.0),
        reviewCount: randomInt(10, 300),
        isActive: true,
        isPartner: Math.random() > 0.3,
        amenities: isFitness ?
          ["WiFi", "Spogliatoi", "Docce", "Aria Condizionata",
            "Parcheggio", "Sauna"].filter(() => Math.random() > 0.3) :
          ["WiFi", "Spogliatoi", "Docce", "Aria Condizionata",
            "Relax Area", "Tisane"],
        openingHours: {
          monday: { open: "07:00", close: "22:00" },
          tuesday: { open: "07:00", close: "22:00" },
          wednesday: { open: "07:00", close: "22:00" },
          thursday: { open: "07:00", close: "22:00" },
          friday: { open: "07:00", close: "22:00" },
          saturday: { open: "08:00", close: "20:00" },
          sunday: { open: "09:00", close: "14:00" },
        },
        images: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      batch.set(venueRef, venueData);
    }

    await batch.commit();
    return { success: true, collection: "venues", count };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, collection: "venues", count: 0, error: errorMessage };
  }
}

/**
 * Seed classes
 */
async function seedClasses(count: number): Promise<SeedingResult> {
  try {
    // Get fitness venues
    const venuesSnapshot = await db.collection("venues").where("type", "==", "fitness").limit(10).get();
    const venueIds = venuesSnapshot.docs.map((d) => d.id);

    // Get providers
    const providersSnapshot = await db.collection("users").where("role", "==", "provider").limit(10).get();
    const providers = providersSnapshot.docs.map((d) =>
      ({ id: d.id, ...d.data() }) as Record<string, unknown>);

    const batch = db.batch();

    for (let i = 0; i < count; i++) {
      const className = randomItem(CLASS_NAMES);
      const classId = `class_${Date.now()}_${i}`;
      const classRef = db.collection("classes").doc(classId);

      // Generate date within next 7 days
      const date = new Date();
      date.setDate(date.getDate() + randomInt(0, 7));
      date.setHours(randomInt(7, 20), [0, 30][randomInt(0, 1)], 0, 0);

      const duration = randomItem([45, 60, 90]);
      const maxCapacity = randomInt(8, 25);
      const provider = randomItem(providers);

      const classData = {
        id: classId,
        name: className,
        description: `Lezione di ${className} adatta a tutti i livelli.`,
        level: randomItem(["Principiante", "Intermedio", "Avanzato", "Tutti i livelli"]),
        category: randomItem(["Cardio", "Forza", "Flessibilita", "Danza", "Martial Arts"]),
        durationMinutes: duration,
        maxCapacity,
        bookedCount: randomInt(0, maxCapacity),
        price: randomInt(15, 35),
        instructorId: provider?.id || "unknown",
        instructorName: (provider?.fullName as string)?.split(" ")[0] || "Istruttore",
        venueId: randomItem(venueIds),
        venueName: randomItem(GYM_NAMES),
        startTime: Timestamp.fromDate(date),
        endTime: Timestamp.fromDate(new Date(date.getTime() + duration * 60000)),
        isRecurring: Math.random() > 0.7,
        recurringPattern: Math.random() > 0.7 ? { frequency: "weekly", days: [date.getDay()] } : null,
        isActive: true,
        requiresBooking: true,
        equipment: ["Tappetino", "Acqua"].filter(() => Math.random() > 0.3),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      batch.set(classRef, classData);
    }

    await batch.commit();
    return { success: true, collection: "classes", count };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, collection: "classes", count: 0, error: errorMessage };
  }
}

/**
 * Seed bookings
 */
async function seedBookings(count: number): Promise<SeedingResult> {
  try {
    // Get customers and providers
    const customersSnapshot = await db.collection("users").where("role", "==", "customer").limit(20).get();
    const providersSnapshot = await db.collection("users").where("role", "==", "provider").limit(15).get();

    const customers = customersSnapshot.docs.map((d) =>
      ({ id: d.id, ...d.data() }) as Record<string, unknown>);
    const providers = providersSnapshot.docs.map((d) =>
      ({ id: d.id, ...d.data() }) as Record<string, unknown>);

    const batch = db.batch();

    for (let i = 0; i < count; i++) {
      const customer = randomItem(customers);
      const provider = randomItem(providers);
      const services = (provider.providerProfile as Record<string, unknown>)?.servicePricing ||
        [{ serviceName: "Sessione", durationMinutes: 60, price: 70, id: `default_${i}` }];
      const service = randomItem(services as Array<Record<string, unknown>>);

      const bookingId = `booking_${Date.now()}_${i}`;
      const bookingRef = db.collection("bookings").doc(bookingId);

      // Generate date within last 30 days or next 30 days
      const isPast = Math.random() > 0.4;
      const date = new Date();
      if (isPast) {
        date.setDate(date.getDate() - randomInt(1, 30));
      } else {
        date.setDate(date.getDate() + randomInt(1, 30));
      }
      date.setHours(randomInt(8, 19), [0, 30][randomInt(0, 1)], 0, 0);

      const status = isPast ?
        randomItem(["completed", "completed", "completed", "cancelled", "no_show"]) :
        randomItem(["confirmed", "confirmed", "confirmed", "pending"]);

      const servicePrice = (service.price as number) || 70;
      const platformFee = servicePrice * 0.05;

      const bookingData = {
        id: bookingId,
        userId: customer.id,
        userName: customer.fullName,
        userEmail: customer.email,
        userPhone: customer.phone,
        providerId: provider.id,
        providerName: provider.fullName,
        providerAvatar: provider.avatarUrl,
        serviceId: (service.id as string) || `service_${i}`,
        serviceName: (service.serviceName as string) || "Sessione",
        scheduledAt: Timestamp.fromDate(date),
        scheduledEndAt: Timestamp.fromDate(new Date(date.getTime() +
          ((service.durationMinutes as number) || 60) * 60000)),
        duration: (service.durationMinutes as number) || 60,
        locationType: randomItem(["provider_location", "client_location", "virtual"]),
        location: (customer.addresses as unknown[])?.[0] || null,
        servicePrice,
        platformFee,
        discountAmount: Math.random() > 0.8 ? servicePrice * 0.1 : 0,
        pointsUsed: 0,
        pointsValue: 0,
        totalPrice: servicePrice + platformFee,
        finalPrice: servicePrice + platformFee - (Math.random() > 0.8 ? servicePrice * 0.1 : 0),
        promotionCode: Math.random() > 0.9 ? "WELCOME10" : null,
        status,
        paymentStatus: status === "completed" || status === "confirmed" ? "paid" : "pending",
        paymentMethod: randomItem(["card", "paypal", "bank_transfer"]),
        userNotes: Math.random() > 0.7 ? "Ho qualche dolore alla schiena, preferirei esercizi leggeri." : null,
        providerNotes: null,
        hasReviewed: status === "completed" && Math.random() > 0.4,
        createdAt: Timestamp.fromDate(new Date(Date.now() -
          randomInt(1, 60) * 24 * 60 * 60 * 1000)),
        updatedAt: Timestamp.now(),
        confirmedAt: status !== "pending" ?
          Timestamp.fromDate(new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000)) : null,
        completedAt: status === "completed" ? Timestamp.fromDate(date) : null,
        cancelledAt: status === "cancelled" ?
          Timestamp.fromDate(new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000)) : null,
        cancellationReason: status === "cancelled" ? randomItem(["Cliente", "Provider", "Meteo"]) : null,
      };

      batch.set(bookingRef, bookingData);
    }

    await batch.commit();
    return { success: true, collection: "bookings", count };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, collection: "bookings", count: 0, error: errorMessage };
  }
}

/**
 * Seed reviews
 */
async function seedReviews(count: number): Promise<SeedingResult> {
  try {
    // Get completed bookings
    const bookingsSnapshot = await db
      .collection("bookings")
      .where("status", "==", "completed")
      .limit(count)
      .get();

    const batch = db.batch();

    const reviewTexts = [
      "Esperienza fantastica! Professionale e preparato.",
      "Ottima sessione, ho imparato molto. Consigliatissimo!",
      "Molto professionale e puntuale. Tornero sicuramente.",
      "Grande competenza e attenzione alle esigenze.",
      "Sessione molto utile, spiegazioni chiare.",
      "Ambiente accogliente e professionale.",
      "Ho riscontrato miglioramenti fin dalla prima seduta.",
      "Servizio impeccabile, staff cordiale.",
      "Esperienza positiva, consiglio a tutti.",
      "Professionista molto qualificato e disponibile.",
    ];

    bookingsSnapshot.docs.forEach((bookingDoc, index) => {
      const booking = bookingDoc.data();
      const reviewId = `review_${Date.now()}_${index}`;
      const reviewRef = db.collection("reviews").doc(reviewId);

      const rating = randomItem([5, 5, 5, 4, 4, 5, 3]);

      const reviewData = {
        id: reviewId,
        bookingId: bookingDoc.id,
        userId: booking.userId,
        userName: booking.userName,
        providerId: booking.providerId,
        providerName: booking.providerName,
        serviceName: booking.serviceName,
        rating,
        comment: rating >= 4 ? randomItem(reviewTexts) : "Potrebbe migliorare in alcuni aspetti.",
        isPublic: true,
        isVerified: true,
        helpful: randomInt(0, 20),
        createdAt: booking.completedAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      batch.set(reviewRef, reviewData);
    });

    await batch.commit();
    return { success: true, collection: "reviews", count: bookingsSnapshot.size };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, collection: "reviews", count: 0, error: errorMessage };
  }
}

// ===== Sample venue seed data =====

interface SampleVenueData {
  id: string;
  name: string;
  slug: string;
  type: "gym" | "wellness_center" | "spa" | "beauty_salon";
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
  courses: { id: string; name: string; time: string; coach: string; spots: number }[];
}

const SAMPLE_VENUES: SampleVenueData[] = [
  {
    id: "carosello",
    name: "Carosello Fitness",
    slug: "carosello-fitness",
    type: "gym",
    city: "Milano",
    address: "Via Torino 21, Milano",
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
    courses: [
      { id: "course-1", name: "HIIT Power", time: "07:30", coach: "Marco R.", spots: 3 },
      { id: "course-2", name: "Pilates Flow", time: "12:15", coach: "Elena B.", spots: 6 },
      { id: "course-3", name: "Functional 360", time: "19:00", coach: "Luca S.", spots: 2 },
    ],
  },
  {
    id: "urban-core",
    name: "Urban Core Gym",
    slug: "urban-core-gym",
    type: "gym",
    city: "Milano",
    address: "Viale Liberazione 12, Milano",
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
    courses: [
      { id: "course-1", name: "CrossFit AM", time: "07:00", coach: "Anna T.", spots: 4 },
      { id: "course-2", name: "Boxe Tecnica", time: "20:00", coach: "Davide M.", spots: 5 },
    ],
  },
  {
    id: "village-fit",
    name: "Village Fit Club",
    slug: "village-fit-club",
    type: "gym",
    city: "Milano",
    address: "Navigli, Milano",
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
    courses: [],
  },
  {
    id: "pulse-studio",
    name: "Pulse Studio",
    slug: "pulse-studio",
    type: "gym",
    city: "Milano",
    address: "Isola, Milano",
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
    courses: [],
  },
  {
    id: "elite-fitness",
    name: "Elite Fitness Center",
    slug: "elite-fitness-center",
    type: "gym",
    city: "Milano",
    address: "Brera, Milano",
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
    courses: [],
  },
  {
    id: "power-gym",
    name: "Power Gym Milano",
    slug: "power-gym-milano",
    type: "gym",
    city: "Milano",
    address: "Porta Romana, Milano",
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
    courses: [],
  },
];

/**
 * Seeds the deterministic sample venues used by the app's seeded demo flows.
 * Idempotent via merge: safe to run repeatedly.
 */
export async function seedSampleVenues(): Promise<SeedingResult> {
  try {
    const batch = db.batch();
    const now = Timestamp.now();

    for (const v of SAMPLE_VENUES) {
      const venueRef = db.collection("venues").doc(v.id);
      const { services, courses, ...venueDoc } = v;
      batch.set(
        venueRef,
        { ...venueDoc, createdAt: now, updatedAt: now },
        { merge: true }
      );
      for (const s of services) {
        batch.set(venueRef.collection("services").doc(s.id), s, { merge: true });
      }
      for (const c of courses) {
        batch.set(venueRef.collection("courses").doc(c.id), c, { merge: true });
      }
    }

    await batch.commit();
    return { success: true, collection: "venues (sample)", count: SAMPLE_VENUES.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, collection: "venues (sample)", count: 0, error: errorMessage };
  }
}

// ===== Sample instructor seed data =====

interface SampleInstructorData {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  isActive: boolean;
  providerProfile: {
    isVerified: boolean;
    isActive: boolean;
    rating: number;
    reviewCount: number;
    specialties: string[];
    yearsOfExperience: number;
    languages: string[];
  };
  services: {
    id: string;
    name: string;
    description: string;
    durationMinutes: number;
    price: number;
    isActive: boolean;
  }[];
}

const SAMPLE_INSTRUCTORS: SampleInstructorData[] = [
  {
    id: "provider-1",
    fullName: "Marco Rossi",
    avatarUrl: null,
    isActive: true,
    providerProfile: {
      isVerified: true,
      isActive: true,
      rating: 4.8,
      reviewCount: 127,
      specialties: ["Personal Training", "Nutrizione", "Bodybuilding"],
      yearsOfExperience: 8,
      languages: ["Italiano", "English"],
    },
    services: [
      {
        id: "svc-1",
        name: "Personal Training 1-to-1",
        description: "Sessione di allenamento personalizzata in palestra o all'aperto",
        durationMinutes: 60,
        price: 60,
        isActive: true,
      },
      {
        id: "svc-2",
        name: "Consulenza Nutrizionale",
        description: "Piano alimentare personalizzato e follow-up mensile",
        durationMinutes: 45,
        price: 45,
        isActive: true,
      },
    ],
  },
];

export async function seedSampleInstructors(): Promise<SeedingResult> {
  try {
    const batch = db.batch();
    const now = Timestamp.now();
    for (const i of SAMPLE_INSTRUCTORS) {
      const ref = db.collection("instructors").doc(i.id);
      const { services, ...doc } = i;
      batch.set(
        ref,
        { ...doc, uid: i.id, createdAt: now, updatedAt: now },
        { merge: true }
      );
      for (const s of services) {
        batch.set(ref.collection("services").doc(s.id), s, { merge: true });
      }
    }
    await batch.commit();
    return { success: true, collection: "instructors (sample)", count: SAMPLE_INSTRUCTORS.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, collection: "instructors (sample)", count: 0, error: errorMessage };
  }
}

// ============================================================================
// HTTP Cloud Functions
// ============================================================================

/**
 * HTTP endpoint to seed all demo data
 * POST /seedAll
 * Body: { providers?: number, customers?: number, venues?: number,
 *         classes?: number, bookings?: number, reviews?: number }
 * Requires: Authentication + Admin role
 */
export const seedAllData = functions.onRequest(
  {
    cors: true,
    region: "europe-west1",
    maxInstances: 1,
    timeoutSeconds: 300,
  },
  async (request, response) => {
    try {
      // Only allow POST
      if (request.method !== "POST") {
        response.status(405).json({ error: "Method not allowed" });
        return;
      }

      // Verify authentication
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        response.status(401).json({ error: "Unauthorized - Missing token" });
        return;
      }

      const token = authHeader.split("Bearer ")[1];
      let decodedToken;

      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (error) {
        response.status(401).json({ error: "Unauthorized - Invalid token" });
        return;
      }

      // Check admin role
      const isUserAdmin = await isAdmin(decodedToken.uid);
      if (!isUserAdmin) {
        response.status(403).json({ error: "Forbidden - Admin access required" });
        return;
      }

      // Get counts from body (with defaults)
      const {
        providers = 10,
        customers = 15,
        venues = 8,
        classes = 20,
        bookings = 30,
        reviews = 20,
      } = request.body;

      console.log(`🚀 Starting demo data seeding by user ${decodedToken.uid}`);

      // Seed all collections
      const results = await Promise.all([
        seedProviders(providers),
        seedCustomers(customers),
        seedVenues(venues),
      ]);

      // Classes and bookings need providers/venues first
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const moreResults = await Promise.all([
        seedClasses(classes),
        seedBookings(bookings),
      ]);

      // Reviews need bookings first
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const reviewResult = await seedReviews(reviews);

      const allResults = [...results, ...moreResults, reviewResult];
      const successCount = allResults.filter((r) => r.success).length;
      const totalCount = allResults.reduce((sum, r) => sum + r.count, 0);

      response.json({
        success: true,
        summary: {
          totalCollections: allResults.length,
          successful: successCount,
          failed: allResults.length - successCount,
          totalRecords: totalCount,
        },
        details: allResults,
        seededBy: decodedToken.uid,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error seeding demo data:", error);
      response.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
);

/**
 * HTTP endpoint to clear all demo data
 * POST /clearAll
 * Requires: Authentication + Superadmin role
 */
export const clearAllData = functions.onRequest(
  {
    cors: true,
    region: "europe-west1",
    maxInstances: 1,
    timeoutSeconds: 300,
  },
  async (request, response) => {
    try {
      // Only allow POST
      if (request.method !== "POST") {
        response.status(405).json({ error: "Method not allowed" });
        return;
      }

      // Verify authentication
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        response.status(401).json({ error: "Unauthorized - Missing token" });
        return;
      }

      const token = authHeader.split("Bearer ")[1];
      let decodedToken;

      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (error) {
        response.status(401).json({ error: "Unauthorized - Invalid token" });
        return;
      }

      // Check superadmin role
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      const role = userDoc.data()?.role;

      if (role !== "superadmin") {
        response.status(403).json({ error: "Forbidden - Superadmin access required" });
        return;
      }

      console.log(`🧹 Clearing all demo data by superadmin ${decodedToken.uid}`);

      const results = await clearAllCollections();
      const successCount = results.filter((r) => r.success).length;
      const totalDeleted = results.reduce((sum, r) => sum + r.count, 0);

      response.json({
        success: true,
        summary: {
          totalCollections: results.length,
          successful: successCount,
          failed: results.length - successCount,
          totalDeleted,
        },
        details: results,
        clearedBy: decodedToken.uid,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error clearing demo data:", error);
      response.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
);

/**
 * HTTP endpoint to seed quick minimal data
 * POST /seedQuick
 * Requires: Authentication + Admin role
 */
export const seedQuickData = functions.onRequest(
  {
    cors: true,
    region: "europe-west1",
    maxInstances: 1,
    timeoutSeconds: 120,
  },
  async (request, response) => {
    try {
      if (request.method !== "POST") {
        response.status(405).json({ error: "Method not allowed" });
        return;
      }

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const token = authHeader.split("Bearer ")[1];
      let decodedToken;

      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (error) {
        response.status(401).json({ error: "Unauthorized - Invalid token" });
        return;
      }

      const isUserAdmin = await isAdmin(decodedToken.uid);
      if (!isUserAdmin) {
        response.status(403).json({ error: "Forbidden - Admin access required" });
        return;
      }

      console.log(`🚀 Starting quick seed by user ${decodedToken.uid}`);

      // Minimal seed: 3 providers, 2 customers, 3 venues, 5 classes, 5 bookings, 3 reviews
      const results = await Promise.all([
        seedProviders(3),
        seedCustomers(2),
        seedVenues(3),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const moreResults = await Promise.all([
        seedClasses(5),
        seedBookings(5),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const reviewResult = await seedReviews(3);

      const allResults = [...results, ...moreResults, reviewResult];

      response.json({
        success: true,
        message: "Quick seed completed - 3 providers, 2 customers, 3 venues, 5 classes, 5 bookings, 3 reviews",
        details: allResults,
        seededBy: decodedToken.uid,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in quick seed:", error);
      response.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
);

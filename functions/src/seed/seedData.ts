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
// Demo data seeder — 20 trainers per specialty + 120 venues across 12 cities
// ============================================================================

/**
 * Converts a string to a URL-safe kebab-case ASCII slug.
 * e.g. "Personal Training" → "personal-training"
 *      "Boxe" → "boxe"
 */
function toSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function generateDemoData(): Promise<SeedingResult[]> {
  const results: SeedingResult[] = [];

  // ── Inline constants (local only, don't pollute file scope) ──────────────

  const DEMO_CITIES: { name: string; lat: number; lng: number }[] = [
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

  const SPA_NAMES = ["Oasi Spa", "Zen Spa", "Aurora Spa", "Lumina Spa", "Pure Spa"];
  const BEAUTY_NAMES = ["Belle Beauty", "Glow Studio", "Lumiere Beauty", "Charme Salon"];

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

  // Per-type service templates
  const GYM_SERVICES = [
    { name: "Accesso giornaliero", price: 18, isActive: true },
    { name: "Abbonamento mensile", price: 59, isActive: true },
    { name: "Abbonamento trimestrale", price: 149, isActive: true },
    { name: "Personal training", price: 50, durationMinutes: 60, isActive: true },
    { name: "Lezione di gruppo", price: 20, durationMinutes: 55, isActive: true },
  ];
  const WELLNESS_SERVICES = [
    { name: "Sessione Yoga", price: 25, durationMinutes: 60, isActive: true },
    { name: "Sessione Pilates", price: 30, durationMinutes: 55, isActive: true },
    { name: "Pacchetto wellness mensile", price: 90, isActive: true },
    { name: "Consulenza benessere", price: 45, durationMinutes: 45, isActive: true },
    { name: "Accesso giornaliero", price: 22, isActive: true },
  ];
  const SPA_SERVICES = [
    { name: "Massaggio rilassante 60min", price: 65, durationMinutes: 60, isActive: true },
    { name: "Massaggio decontratturante", price: 75, durationMinutes: 60, isActive: true },
    { name: "Pacchetto wellness coppia", price: 140, durationMinutes: 90, isActive: true },
    { name: "Percorso spa completo", price: 110, durationMinutes: 120, isActive: true },
    { name: "Trattamento viso premium", price: 80, durationMinutes: 75, isActive: true },
  ];
  const BEAUTY_SERVICES = [
    { name: "Manicure", price: 25, durationMinutes: 45, isActive: true },
    { name: "Pedicure", price: 30, durationMinutes: 50, isActive: true },
    { name: "Trattamento viso", price: 55, durationMinutes: 60, isActive: true },
    { name: "Colorazione capelli", price: 70, durationMinutes: 90, isActive: true },
    { name: "Ceretta completa", price: 40, durationMinutes: 60, isActive: true },
  ];

  // Per-specialty service name library (name + description pairs)
  const SPECIALTY_SERVICES: Record<string, { name: string; description: string }[]> = {
    "Personal Training": [
      { name: "Sessione 1-to-1", description: "Sessione personalizzata con piano di allenamento dedicato." },
      { name: "Pacchetto 10 sessioni", description: "Dieci incontri con progressione monitorata." },
      { name: "Consulenza online", description: "Video call per pianificazione e analisi posturale." },
      { name: "Allenamento outdoor", description: "Sessione all'aperto con circuiti funzionali." },
    ],
    "Yoga": [
      { name: "Lezione Yoga individuale", description: "Pratica personalizzata per ogni livello." },
      { name: "Pacchetto 8 lezioni", description: "Percorso progressivo di otto sessioni di yoga." },
      { name: "Yoga Nidra", description: "Sessione guidata di rilassamento profondo." },
      { name: "Morning Flow", description: "Sequenza energizzante per iniziare la giornata." },
    ],
    "Pilates": [
      { name: "Pilates individuale", description: "Sessione one-to-one di Pilates riformer o mat." },
      { name: "Pacchetto 5 sessioni", description: "Cinque incontri con progressione sul core." },
      { name: "Pilates posturale", description: "Lavoro specifico su postura e allineamento." },
      { name: "Pilates & Stretching", description: "Combinazione di Pilates e allungamento profondo." },
    ],
    "HIIT": [
      { name: "HIIT 1-to-1", description: "Allenamento ad alta intensità personalizzato." },
      { name: "Pacchetto 8 sessioni HIIT", description: "Ciclo di allenamenti intervallati per dimagrire." },
      { name: "HIIT Online", description: "Sessione live via video con coaching in tempo reale." },
      { name: "Metabolic Blast", description: "Circuito brucia-grassi con esercizi composti." },
    ],
    "CrossFit": [
      { name: "Sessione CrossFit privata", description: "WOD personalizzato con coach dedicato." },
      { name: "Intro CrossFit", description: "Introduzione ai fondamentali del CrossFit." },
      { name: "Strength & Conditioning", description: "Lavoro di forza e condizionamento atletico." },
      { name: "Olympic Lifting", description: "Tecnica sui movimenti olimpici sotto supervisione." },
    ],
    "Functional Training": [
      { name: "Functional 1-to-1", description: "Allenamento funzionale adattato alle esigenze reali." },
      { name: "Pacchetto 6 sessioni", description: "Sei incontri progressivi con valutazione iniziale." },
      { name: "Mobility & Function", description: "Lavoro su mobilità, stabilità e schemi motori." },
      { name: "Sport Specific Training", description: "Preparazione atletica specifica per il tuo sport." },
    ],
    "Strength Training": [
      { name: "Forza 1-to-1", description: "Programmazione periodizzata per la crescita muscolare." },
      { name: "Powerlifting coaching", description: "Preparazione alla competizione o al test massimale." },
      { name: "Pacchetto 10 sessioni forza", description: "Ciclo completo di forza con tracking dei carichi." },
      { name: "Corpo libero avanzato", description: "Calisthenics e forza relativa senza attrezzi." },
    ],
    "Cardio": [
      { name: "Cardio coaching", description: "Piano di allenamento cardiovascolare progressivo." },
      { name: "Running coaching", description: "Programmazione per migliorare resistenza e tecnica." },
      { name: "Interval Training", description: "Sessione di interval training per aumentare la VO2max." },
      { name: "Cycling indoor", description: "Sessione bike ad intensità variabile." },
    ],
    "Boxe": [
      { name: "Boxe tecnica 1-to-1", description: "Fondamentali, guardia e combinazioni con mitts." },
      { name: "Boxe fitness", description: "Allenamento boxe orientato al fitness, no sparring." },
      { name: "Pacchetto 8 lezioni boxe", description: "Ciclo intensivo con progressione tecnica." },
      { name: "Sparring & Strategia", description: "Sessione avanzata con analisi tattica." },
    ],
    "Nutrizione": [
      { name: "Consulenza nutrizionale", description: "Analisi delle abitudini alimentari e piano personalizzato." },
      { name: "Piano alimentare mensile", description: "Piano settimanale con follow-up bisettimanale." },
      { name: "Nutrizione sportiva", description: "Strategie alimentari per performance e recupero." },
      { name: "Dieta e composizione corporea", description: "Protocollo per ricomposizione corporea guidata." },
    ],
    "Massaggio": [
      { name: "Massaggio rilassante", description: "Sessione di massaggio decontratturante e rilassante." },
      { name: "Massaggio sportivo", description: "Trattamento pre/post gara per atleti." },
      { name: "Massaggio ayurvedico", description: "Tecnica tradizionale con oli essenziali." },
      { name: "Pacchetto 5 massaggi", description: "Cinque sessioni a prezzo vantaggioso." },
    ],
    "Fisioterapia": [
      { name: "Valutazione fisioterapica", description: "Esame posturale e valutazione funzionale completa." },
      { name: "Rieducazione motoria", description: "Percorso di recupero post-infortunio o post-operatorio." },
      { name: "Terapia manuale", description: "Tecniche osteoarticolari e miofasciali." },
      { name: "Fisioterapia sportiva", description: "Recupero atletico rapido per sportivi." },
    ],
    "Osteopatia": [
      { name: "Seduta osteopatica", description: "Trattamento osteopatico globale con approccio cranio-sacrale." },
      { name: "Valutazione posturale", description: "Analisi posturale e piano di trattamento." },
      { name: "Osteopatia viscerale", description: "Approccio viscerale per equilibrio organico." },
      { name: "Pacchetto 4 sedute", description: "Ciclo di quattro trattamenti osteopatici." },
    ],
    "Mental Coaching": [
      { name: "Sessione mental coaching", description: "Seduta individuale per potenziamento personale." },
      { name: "Programma 8 settimane", description: "Percorso strutturato di mental training." },
      { name: "Coaching online", description: "Sessione via video per obiettivi di vita e sport." },
      { name: "Workshop mindset", description: "Workshop di gruppo su resilienza e focus." },
    ],
    "Psicologia": [
      { name: "Colloquio psicologico", description: "Seduta individuale di supporto psicologico." },
      { name: "Psicoterapia breve", description: "Percorso terapeutico orientato alla soluzione." },
      { name: "Psicologia dello sport", description: "Sostegno mentale per atleti e sportivi." },
      { name: "Consulenza di coppia", description: "Incontro di supporto per coppie." },
    ],
    "Yoga Therapy": [
      { name: "Yoga terapeutico individuale", description: "Pratica adattata a patologie e limitazioni fisiche." },
      { name: "Pranayama avanzato", description: "Tecniche respiratorie per equilibrio neuro-vegetativo." },
      { name: "Meditazione guidata", description: "Sessione di meditazione mindfulness o vipassana." },
      { name: "Yoga restorative", description: "Sequenza di recupero profondo con supporti." },
    ],
  };

  // Fallback service template for any specialty not found
  const defaultServices = (specialty: string) => [
    { name: `Sessione ${specialty}`, description: `Sessione personalizzata di ${specialty}.` },
    { name: `Pacchetto 5 sessioni ${specialty}`, description: "Cinque incontri con progressione monitorata." },
    { name: `Consulenza ${specialty}`, description: "Consulenza iniziale e definizione degli obiettivi." },
    { name: `${specialty} online`, description: "Sessione live via video con coaching in tempo reale." },
  ];

  // Course times to pick from
  const COURSE_TIMES = ["07:30", "09:00", "10:30", "12:15", "14:00", "17:00", "18:30", "19:30", "20:00", "20:30"];

  // Hours variants
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

  // ── Batched writer ────────────────────────────────────────────────────────

  let batch = db.batch();
  let opCount = 0;
  const MAX_BATCH_OPS = 400;

  const queueWrite = async (
    ref: FirebaseFirestore.DocumentReference,
    data: Record<string, unknown>
  ) => {
    batch.set(ref, data, { merge: true });
    opCount++;
    if (opCount >= MAX_BATCH_OPS) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  };

  // ── 1. Instructors ────────────────────────────────────────────────────────

  try {
    const allSpecialties = [...new Set([...FITNESS_SPECIALTIES, ...WELLNESS_SPECIALTIES])];
    const wellnessSet = new Set(WELLNESS_SPECIALTIES);

    let instructorCount = 0;
    let instructorServiceCount = 0;
    const now = Timestamp.now();

    for (const specialty of allSpecialties) {
      const specialtySlug = toSlug(specialty);
      const pool = wellnessSet.has(specialty) ? WELLNESS_SPECIALTIES : FITNESS_SPECIALTIES;
      const serviceDefs = SPECIALTY_SERVICES[specialty] ?? defaultServices(specialty);

      for (let i = 1; i <= 20; i++) {
        const pad = String(i).padStart(2, "0");
        const id = `demo-trainer-${specialtySlug}-${pad}`;
        const firstName = randomItem(FIRST_NAMES);
        const lastName = randomItem(LAST_NAMES);
        const city = DEMO_CITIES[(i - 1) % DEMO_CITIES.length].name;

        // Build secondary specialties from same pool, excluding primary
        const otherSpecialties = pool.filter((s) => s !== specialty);
        const secondaryCount = randomInt(1, 2);
        const secondaries = randomItems(otherSpecialties, Math.min(secondaryCount, otherSpecialties.length));

        const languages = Math.random() < 0.7 ? ["Italiano"] : ["Italiano", "English"];

        const instructorDoc: Record<string, unknown> = {
          fullName: `${firstName} ${lastName}`,
          avatarUrl: null,
          uid: id,
          isActive: true,
          city,
          providerProfile: {
            isVerified: true,
            isActive: true,
            rating: randomFloat(4.2, 5.0, 1),
            reviewCount: randomInt(15, 320),
            specialties: [specialty, ...secondaries],
            yearsOfExperience: randomInt(2, 18),
            languages,
          },
          createdAt: now,
          updatedAt: now,
        };

        const ref = db.collection("instructors").doc(id);
        await queueWrite(ref, instructorDoc);
        instructorCount++;

        // Services subcollection: 2–4 services
        const serviceCount = randomInt(2, 4);
        const shuffled = [...serviceDefs].sort(() => 0.5 - Math.random()).slice(0, serviceCount);
        for (let si = 0; si < shuffled.length; si++) {
          const svcId = `svc-${si + 1}`;
          const dur = randomItem([30, 45, 60, 90]);
          const price = Math.round(randomInt(30, 120) / 5) * 5;
          const svcData: Record<string, unknown> = {
            name: shuffled[si].name,
            description: shuffled[si].description,
            durationMinutes: dur,
            price,
            isActive: true,
          };
          await queueWrite(ref.collection("services").doc(svcId), svcData);
          instructorServiceCount++;
        }
      }
    }

    results.push({ success: true, collection: "instructors (demo)", count: instructorCount });
    results.push({ success: true, collection: "instructor services (demo)", count: instructorServiceCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    results.push({ success: false, collection: "instructors (demo)", count: 0, error: msg });
  }

  // ── 2. Venues ─────────────────────────────────────────────────────────────

  try {
    let venueCount = 0;
    let venueSvcCount = 0;
    let venueCourseCount = 0;
    const now = Timestamp.now();

    type VenueType = "gym" | "wellness_center" | "spa" | "beauty_salon";

    interface VenueSlot {
      type: VenueType;
      index: number; // within this type for this city
    }

    for (const city of DEMO_CITIES) {
      const citySlug = toSlug(city.name);

      const slots: VenueSlot[] = [
        ...Array.from({ length: 5 }, (_, i) => ({ type: "gym" as VenueType, index: i + 1 })),
        ...Array.from({ length: 2 }, (_, i) => ({ type: "wellness_center" as VenueType, index: i + 1 })),
        ...Array.from({ length: 2 }, (_, i) => ({ type: "spa" as VenueType, index: i + 1 })),
        { type: "beauty_salon" as VenueType, index: 1 },
      ];

      for (const slot of slots) {
        const { type, index } = slot;
        const id = `demo-venue-${citySlug}-${type.replace("_", "-")}-${index}`;

        // Resolve name
        let baseName: string;
        if (type === "gym") {
          baseName = `${GYM_NAMES[(index - 1) % GYM_NAMES.length]} ${city.name}`;
        } else if (type === "wellness_center") {
          const wcBaseName = WELLNESS_CENTER_NAMES[(index - 1) % WELLNESS_CENTER_NAMES.length].split(" ")[0];
          baseName = `${wcBaseName} Wellness ${city.name}`;
        } else if (type === "spa") {
          baseName = `${SPA_NAMES[(index - 1) % SPA_NAMES.length]} ${city.name}`;
        } else {
          baseName = `${BEAUTY_NAMES[(index - 1) % BEAUTY_NAMES.length]} ${city.name}`;
        }

        const slug = toSlug(baseName);

        // Address
        const street = `${STREETS[(index + DEMO_CITIES.indexOf(city)) % STREETS.length]} ${randomInt(1, 150)}`;
        const address = `${street}, ${city.name}`;

        // Coordinates with jitter
        const jitterLat = (Math.random() - 0.5) * 0.04; // ±0.02
        const jitterLng = (Math.random() - 0.5) * 0.04;
        const lat = parseFloat((city.lat + jitterLat).toFixed(6));
        const lng = parseFloat((city.lng + jitterLng).toFixed(6));

        // Amenities
        let amenityPool: AmenityKind[];
        if (type === "gym") amenityPool = GYM_AMENITIES;
        else if (type === "wellness_center") amenityPool = WELLNESS_AMENITIES;
        else if (type === "spa") amenityPool = SPA_AMENITIES;
        else amenityPool = BEAUTY_AMENITIES;

        const amenityCount = type === "beauty_salon" ? Math.min(randomInt(2, 3), amenityPool.length) : randomInt(3, 6);
        const amenities = randomItems(amenityPool, amenityCount).map((k) => ({ kind: k }));

        // Description
        let description: string;
        if (type === "gym") description = randomItem(GYM_DESCRIPTIONS);
        else if (type === "wellness_center") description = randomItem(WELLNESS_DESCRIPTIONS);
        else if (type === "spa") description = randomItem(SPA_DESCRIPTIONS);
        else description = randomItem(BEAUTY_DESCRIPTIONS);

        // heroGradients: 1-3
        const gradientCount = randomInt(1, 3);
        const heroGradients = randomItems(HERO_GRADIENTS, gradientCount);

        // Hours
        const hours = HOURS_VARIANTS[(index - 1) % HOURS_VARIANTS.length];

        // isPartner: 35% chance
        const isPartner = Math.random() < 0.35;

        const venueDoc: Record<string, unknown> = {
          name: baseName,
          slug,
          type,
          city: city.name,
          address,
          lat,
          lng,
          rating: randomFloat(4.2, 5.0, 1),
          reviewCount: randomInt(20, 280),
          isPartner,
          isActive: true,
          description,
          heroGradients,
          amenities,
          hours,
          createdAt: now,
          updatedAt: now,
        };

        const venueRef = db.collection("venues").doc(id);
        await queueWrite(venueRef, venueDoc);
        venueCount++;

        // Services subcollection: 2–5 services
        let serviceTemplates: { name: string; price: number; durationMinutes?: number; isActive: boolean }[];
        if (type === "gym") serviceTemplates = GYM_SERVICES;
        else if (type === "wellness_center") serviceTemplates = WELLNESS_SERVICES;
        else if (type === "spa") serviceTemplates = SPA_SERVICES;
        else serviceTemplates = BEAUTY_SERVICES;

        const svcCount = randomInt(2, Math.min(5, serviceTemplates.length));
        const selectedSvcs = randomItems(serviceTemplates, svcCount);
        for (let si = 0; si < selectedSvcs.length; si++) {
          const svc = selectedSvcs[si];
          const svcId = `svc-${si + 1}`;
          await queueWrite(venueRef.collection("services").doc(svcId), { ...svc } as Record<string, unknown>);
          venueSvcCount++;
        }

        // Courses subcollection: only gyms and wellness_centers, 2–4 courses
        if (type === "gym" || type === "wellness_center") {
          const courseCount = randomInt(2, 4);
          for (let ci = 0; ci < courseCount; ci++) {
            const cId = `course-${ci + 1}`;
            const coachFirst = randomItem(FIRST_NAMES);
            const coachLastInit = randomItem(LAST_NAMES)[0];
            const courseDoc: Record<string, unknown> = {
              name: randomItem(CLASS_NAMES),
              time: randomItem(COURSE_TIMES),
              coach: `${coachFirst} ${coachLastInit}.`,
              spots: randomInt(2, 10),
            };
            await queueWrite(venueRef.collection("courses").doc(cId), courseDoc);
            venueCourseCount++;
          }
        }
      }
    }

    // Flush remaining ops
    if (opCount > 0) {
      await batch.commit();
      opCount = 0;
    }

    results.push({ success: true, collection: "venues (demo)", count: venueCount });
    results.push({ success: true, collection: "services + courses (demo)", count: venueSvcCount + venueCourseCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    results.push({ success: false, collection: "venues (demo)", count: 0, error: msg });
  }

  return results;
}

export async function generateDemoContent(): Promise<SeedingResult[]> {
  const results: SeedingResult[] = [];
  const now = Timestamp.now();

  // ===== fitnessClasses =====
  try {
    const FITNESS_CLASS_DATA = [
      {
        id: "class-yoga-01", title: "Morning Power Yoga",
        category: "yoga", trainer: "Elisa Serra", time: "08:30",
        durationMinutes: 60, spotsLeft: 6,
      },
      {
        id: "class-yoga-02", title: "Yoga Restorativo",
        category: "yoga", trainer: "Giulia Neri", time: "17:00",
        durationMinutes: 60, spotsLeft: 8,
      },
      {
        id: "class-hiit-01", title: "HIIT Burn",
        category: "hiit", trainer: "Marco Vitali", time: "12:15",
        durationMinutes: 45, spotsLeft: 4,
      },
      {
        id: "class-hiit-02", title: "HIIT Express",
        category: "hiit", trainer: "Andrea Rossi", time: "07:00",
        durationMinutes: 30, spotsLeft: 3,
      },
      {
        id: "class-pilates-01", title: "Pilates Core Flow",
        category: "pilates", trainer: "Giulia Neri", time: "17:30",
        durationMinutes: 50, spotsLeft: 8,
      },
      {
        id: "class-pilates-02", title: "Pilates Reformer",
        category: "pilates", trainer: "Sara Bianchi", time: "19:30",
        durationMinutes: 55, spotsLeft: 6,
      },
      {
        id: "class-functional-01", title: "Functional Circuit",
        category: "functional", trainer: "Andrea Rossi", time: "19:00",
        durationMinutes: 55, spotsLeft: 3,
      },
      {
        id: "class-functional-02", title: "Functional 360",
        category: "functional", trainer: "Luca Ferri", time: "12:00",
        durationMinutes: 60, spotsLeft: 5,
      },
      {
        id: "class-cardio-01", title: "Spinning Class",
        category: "cardio", trainer: "Davide Marino", time: "18:30",
        durationMinutes: 45, spotsLeft: 4,
      },
      {
        id: "class-cardio-02", title: "Zumba Dance",
        category: "cardio", trainer: "Valentina Esposito", time: "20:00",
        durationMinutes: 60, spotsLeft: 12,
      },
      {
        id: "class-strength-01", title: "Body Pump",
        category: "strength", trainer: "Marco Vitali", time: "18:00",
        durationMinutes: 55, spotsLeft: 5,
      },
      {
        id: "class-strength-02", title: "Strength & Power",
        category: "strength", trainer: "Anna Conti", time: "06:30",
        durationMinutes: 60, spotsLeft: 4,
      },
    ];
    const batch = db.batch();
    for (const c of FITNESS_CLASS_DATA) {
      batch.set(
        db.collection("fitnessClasses").doc(c.id),
        { ...c, rating: 4.7, isActive: true, createdAt: now, updatedAt: now },
        { merge: true }
      );
    }
    await batch.commit();
    results.push({
      success: true,
      collection: "fitnessClasses",
      count: FITNESS_CLASS_DATA.length,
    });
  } catch (error) {
    results.push({
      success: false,
      collection: "fitnessClasses",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  // ===== homeTrainingServices =====
  try {
    const HOME_SERVICES = [
      {
        id: "home-1", title: "Personal Training 1:1",
        coach: "Luca Ferri", eta: "Disponibile oggi 18:00",
        rating: 4.9, fromPrice: "Da EUR 55",
      },
      {
        id: "home-2", title: "Mobility & Recovery",
        coach: "Giulia Neri", eta: "Disponibile domani 09:30",
        rating: 4.8, fromPrice: "Da EUR 49",
      },
      {
        id: "home-3", title: "Functional Duo Session",
        coach: "Andrea Rossi", eta: "Disponibile domani 19:00",
        rating: 4.7, fromPrice: "Da EUR 62",
      },
      {
        id: "home-4", title: "Personal Training Outdoor",
        coach: "Marco Vitali", eta: "Disponibile sabato 10:00",
        rating: 4.8, fromPrice: "Da EUR 60",
      },
      {
        id: "home-5", title: "Recupero Posturale",
        coach: "Sara Bianchi", eta: "Disponibile lunedi 17:30",
        rating: 4.9, fromPrice: "Da EUR 70",
      },
      {
        id: "home-6", title: "Coaching Online Live",
        coach: "Valentina Esposito", eta: "Disponibile stasera 21:00",
        rating: 4.6, fromPrice: "Da EUR 35",
      },
    ];
    const batch = db.batch();
    for (const s of HOME_SERVICES) {
      batch.set(
        db.collection("homeTrainingServices").doc(s.id),
        { ...s, isActive: true, createdAt: now, updatedAt: now },
        { merge: true }
      );
    }
    await batch.commit();
    results.push({
      success: true,
      collection: "homeTrainingServices",
      count: HOME_SERVICES.length,
    });
  } catch (error) {
    results.push({
      success: false,
      collection: "homeTrainingServices",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  // ===== virtualPrograms =====
  try {
    const VIRTUAL_PROGRAMS = [
      {
        id: "virtual-1", title: "Live HIIT Express",
        level: "Intermedio", durationMinutes: 30, rating: 4.8, live: true,
      },
      {
        id: "virtual-2", title: "Yoga Mobility Flow",
        level: "Tutti", durationMinutes: 40, rating: 4.7, live: false,
      },
      {
        id: "virtual-3", title: "Strength at Home",
        level: "Avanzato", durationMinutes: 50, rating: 4.9, live: false,
      },
      {
        id: "virtual-4", title: "Cardio Dance Live",
        level: "Tutti", durationMinutes: 35, rating: 4.6, live: true,
      },
      {
        id: "virtual-5", title: "Pilates Foundations",
        level: "Principiante", durationMinutes: 45, rating: 4.8, live: false,
      },
      {
        id: "virtual-6", title: "Functional Express",
        level: "Intermedio", durationMinutes: 25, rating: 4.7, live: false,
      },
    ];
    const batch = db.batch();
    for (const p of VIRTUAL_PROGRAMS) {
      batch.set(
        db.collection("virtualPrograms").doc(p.id),
        { ...p, isActive: true, createdAt: now, updatedAt: now },
        { merge: true }
      );
    }
    await batch.commit();
    results.push({
      success: true,
      collection: "virtualPrograms",
      count: VIRTUAL_PROGRAMS.length,
    });
  } catch (error) {
    results.push({
      success: false,
      collection: "virtualPrograms",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  // ===== testimonials =====
  try {
    const TESTIMONIALS = [
      {
        id: "test-1", userName: "Sofia M.", rating: 5,
        text: "Esperienza fantastica! Lo staff e super professionale.",
        serviceLabel: "Personal Training", date: "2 giorni fa",
      },
      {
        id: "test-2", userName: "Andrea L.", rating: 5,
        text: "Risultati visibili gia dopo il primo mese.",
        serviceLabel: "Personal Training", date: "1 settimana fa",
      },
      {
        id: "test-3", userName: "Chiara F.", rating: 4,
        text: "Le lezioni di yoga sono rilassanti e ben strutturate.",
        serviceLabel: "Yoga", date: "3 giorni fa",
      },
      {
        id: "test-4", userName: "Marco P.", rating: 5,
        text: "Coach Marco e davvero motivante. Lo consiglio!",
        serviceLabel: "Personal Training", date: "2 settimane fa",
      },
      {
        id: "test-5", userName: "Elena R.", rating: 5,
        text: "Centro pulito, attrezzature nuove, prezzi onesti.",
        serviceLabel: "Abbonamento mensile", date: "5 giorni fa",
      },
      {
        id: "test-6", userName: "Davide S.", rating: 4,
        text: "Ambiente accogliente e personale qualificato.",
        serviceLabel: "Functional", date: "1 mese fa",
      },
    ];
    const batch = db.batch();
    for (const t of TESTIMONIALS) {
      batch.set(
        db.collection("testimonials").doc(t.id),
        { ...t, avatarUrl: null, createdAt: now },
        { merge: true }
      );
    }
    await batch.commit();
    results.push({
      success: true,
      collection: "testimonials",
      count: TESTIMONIALS.length,
    });
  } catch (error) {
    results.push({
      success: false,
      collection: "testimonials",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  // ===== transactions (admin/payments) =====
  try {
    const TRANSACTIONS = [
      {
        id: "tx-1", type: "booking_payment", amount: 150, status: "completed",
        description: "Personal Training Session",
        customerName: "Marco Rossi", providerName: "Luca Ferri",
      },
      {
        id: "tx-2", type: "commission", amount: 22.5, status: "completed",
        description: "Platform commission (15%)",
        customerName: "-", providerName: "Luca Ferri",
      },
      {
        id: "tx-3", type: "payout", amount: 127.5, status: "pending",
        description: "Provider payout",
        customerName: "-", providerName: "Luca Ferri",
      },
      {
        id: "tx-4", type: "refund", amount: 150, status: "completed",
        description: "Refund for cancelled booking",
        customerName: "Anna Bianchi", providerName: "Sara Bianchi",
      },
      {
        id: "tx-5", type: "booking_payment", amount: 70, status: "completed",
        description: "Pilates Reformer",
        customerName: "Chiara Fontana", providerName: "Sara Bianchi",
      },
      {
        id: "tx-6", type: "booking_payment", amount: 90, status: "completed",
        description: "Mobility & Recovery",
        customerName: "Davide Marino", providerName: "Giulia Neri",
      },
      {
        id: "tx-7", type: "commission", amount: 13.5, status: "completed",
        description: "Platform commission (15%)",
        customerName: "-", providerName: "Giulia Neri",
      },
      {
        id: "tx-8", type: "payout", amount: 76.5, status: "completed",
        description: "Provider payout",
        customerName: "-", providerName: "Giulia Neri",
      },
      {
        id: "tx-9", type: "booking_payment", amount: 60, status: "pending",
        description: "Yoga Flow Session",
        customerName: "Elena Romano", providerName: "Elisa Serra",
      },
      {
        id: "tx-10", type: "booking_payment", amount: 55, status: "failed",
        description: "HIIT Class",
        customerName: "Paolo Greco", providerName: "Marco Vitali",
      },
    ];
    const batch = db.batch();
    const baseTime = Date.now();
    for (let i = 0; i < TRANSACTIONS.length; i++) {
      const t = TRANSACTIONS[i];
      // one per day going back
      const created = Timestamp.fromMillis(baseTime - i * 24 * 60 * 60 * 1000);
      batch.set(
        db.collection("transactions").doc(t.id),
        { ...t, createdAt: created },
        { merge: true }
      );
    }
    await batch.commit();
    results.push({
      success: true,
      collection: "transactions",
      count: TRANSACTIONS.length,
    });
  } catch (error) {
    results.push({
      success: false,
      collection: "transactions",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  // ===== reviews on a few instructors =====
  try {
    const SAMPLE_REVIEWS = [
      { userName: "Sofia M.", rating: 5, text: "Allenamento perfetto, motivante e ben strutturato." },
      { userName: "Andrea L.", rating: 5, text: "Marco e davvero preparato. Consigliato!" },
      { userName: "Chiara F.", rating: 4, text: "Buon coach, sempre disponibile." },
      { userName: "Marco P.", rating: 5, text: "Risultati visibili dopo poche settimane." },
      { userName: "Elena R.", rating: 4, text: "Sessioni intense ma personalizzate." },
    ];
    const targetInstructors = [
      "provider-1",
      "demo-trainer-yoga-01",
      "demo-trainer-personal-training-01",
      "demo-trainer-pilates-01",
    ];
    const batch = db.batch();
    let count = 0;
    for (const instructorId of targetInstructors) {
      for (let i = 0; i < SAMPLE_REVIEWS.length; i++) {
        const r = SAMPLE_REVIEWS[i];
        batch.set(
          db.collection("instructors")
            .doc(instructorId)
            .collection("reviews")
            .doc(`review-${i + 1}`),
          { ...r, avatarUrl: null, createdAt: now },
          { merge: true }
        );
        count++;
      }
    }
    await batch.commit();
    results.push({ success: true, collection: "instructor reviews", count });
  } catch (error) {
    results.push({
      success: false,
      collection: "instructor reviews",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  return results;
}

export async function generateDemoClients(): Promise<SeedingResult[]> {
  const results: SeedingResult[] = [];
  const now = Timestamp.now();
  const PROVIDER_ID = "provider-1";

  const CLIENTS = [
    {
      id: "demo-client-1",
      userId: "demo-user-1",
      name: "Marco Bianchi",
      email: "marco.bianchi@example.com",
      phone: "+39 333 1234567",
      photoUrl: "",
      totalBookings: 12,
      totalSpent: 720,
      notes: "Preferisce sessioni mattutine. Obiettivi: postura e core.",
      tags: ["Mattino", "Postura", "Core"],
      lastVisitDaysAgo: 4,
      firstVisitDaysAgo: 220,
    },
    {
      id: "demo-client-2",
      userId: "demo-user-2",
      name: "Anna Esposito",
      email: "anna.esposito@example.com",
      phone: "+39 333 7654321",
      photoUrl: "",
      totalBookings: 8,
      totalSpent: 480,
      notes: "Focalizzata su forza e mobilita. Disponibile mercoledi e venerdi.",
      tags: ["Forza", "Mobilita"],
      lastVisitDaysAgo: 10,
      firstVisitDaysAgo: 150,
    },
    {
      id: "demo-client-3",
      userId: "demo-user-3",
      name: "Sofia Greco",
      email: "sofia.greco@example.com",
      phone: "+39 333 9876543",
      photoUrl: "",
      totalBookings: 5,
      totalSpent: 300,
      notes: "Nuova cliente, preferenza per allenamento HIIT pomeridiano.",
      tags: ["HIIT", "Pomeriggio"],
      lastVisitDaysAgo: 2,
      firstVisitDaysAgo: 75,
    },
    {
      id: "demo-client-4",
      userId: "demo-user-4",
      name: "Davide Conti",
      email: "davide.conti@example.com",
      phone: "+39 333 5556677",
      photoUrl: "",
      totalBookings: 20,
      totalSpent: 1200,
      notes: "Cliente di lunga data, sessioni regolari due volte a settimana.",
      tags: ["Veterano", "Settimanale"],
      lastVisitDaysAgo: 1,
      firstVisitDaysAgo: 540,
    },
  ];

  // Write clients
  try {
    const batch = db.batch();
    const dayMs = 24 * 60 * 60 * 1000;
    const nowMs = now.toMillis();
    for (const c of CLIENTS) {
      const { lastVisitDaysAgo, firstVisitDaysAgo, ...rest } = c;
      batch.set(
        db.collection("clients").doc(c.id),
        {
          ...rest,
          providerId: PROVIDER_ID,
          lastVisit: Timestamp.fromMillis(nowMs - lastVisitDaysAgo * dayMs),
          firstVisit: Timestamp.fromMillis(nowMs - firstVisitDaysAgo * dayMs),
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }
    await batch.commit();
    results.push({ success: true, collection: "clients", count: CLIENTS.length });
  } catch (error) {
    results.push({
      success: false,
      collection: "clients",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  // Write a small booking history per client. Mix of completed/upcoming/cancelled.
  try {
    const SERVICE_TEMPLATES = [
      { id: "svc-1", name: "Personal Training 1-to-1", price: 60, durationMinutes: 60 },
      { id: "svc-2", name: "Consulenza Nutrizionale", price: 45, durationMinutes: 45 },
    ];
    const batch = db.batch();
    const dayMs = 24 * 60 * 60 * 1000;
    const nowMs = now.toMillis();
    let bookingsCount = 0;
    for (const c of CLIENTS) {
      // 4 bookings per client: 2 past (completed), 1 recent (completed), 1 upcoming
      const offsets = [-30, -14, -7, 7];
      for (let i = 0; i < offsets.length; i++) {
        const svc = SERVICE_TEMPLATES[i % SERVICE_TEMPLATES.length];
        const scheduled = Timestamp.fromMillis(nowMs + offsets[i] * dayMs);
        const status = offsets[i] > 0 ? "confirmed" : "completed";
        const bookingId = `demo-booking-${c.id}-${i + 1}`;
        batch.set(
          db.collection("bookings").doc(bookingId),
          {
            id: bookingId,
            userId: c.userId,
            providerId: PROVIDER_ID,
            serviceId: svc.id,
            serviceName: svc.name,
            providerName: "Marco Rossi",
            providerAvatar: null,
            scheduledAt: scheduled,
            scheduledEndAt: Timestamp.fromMillis(
              scheduled.toMillis() + svc.durationMinutes * 60 * 1000
            ),
            duration: svc.durationMinutes,
            locationType: "in_person",
            location: null,
            servicePrice: svc.price,
            platformFee: svc.price * 0.05,
            discountAmount: 0,
            pointsUsed: 0,
            pointsValue: 0,
            totalPrice: svc.price * 1.05,
            finalPrice: svc.price,
            status,
            paymentStatus: status === "completed" ? "paid" : "pending",
            paymentMethod: "card",
            userNotes: null,
            hasReviewed: false,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
        bookingsCount++;
      }
    }
    await batch.commit();
    results.push({ success: true, collection: "bookings (demo)", count: bookingsCount });
  } catch (error) {
    results.push({
      success: false,
      collection: "bookings (demo)",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  return results;
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

      const sampleVenuesResult = await seedSampleVenues();
      const sampleInstructorsResult = await seedSampleInstructors();

      const allResults = [...results, ...moreResults, reviewResult, sampleVenuesResult, sampleInstructorsResult];

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

/**
 * HTTP endpoint to seed demo-ready data for presentations.
 * POST /seedDemoData
 * Generates ~340 trainers (20 per specialty) + 120 venues across 12 Italian cities,
 * each with services and courses subcollections.
 * Idempotent (merge: true with deterministic IDs).
 * Requires: Authentication + Admin role
 */
export const seedDemoData = functions.onRequest(
  {
    cors: true,
    region: "europe-west1",
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MiB",
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

      console.log(`Starting demo data seed by user ${decodedToken.uid}`);

      const results = await generateDemoData();

      const totalCount = results.reduce((sum, r) => sum + r.count, 0);
      const successCount = results.filter((r) => r.success).length;

      response.json({
        success: true,
        summary: {
          totalCollections: results.length,
          successful: successCount,
          failed: results.length - successCount,
          totalRecords: totalCount,
        },
        details: results,
        seededBy: decodedToken.uid,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in demo seed:", error);
      response.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
);

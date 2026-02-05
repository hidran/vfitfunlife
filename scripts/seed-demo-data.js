/**
 * VFit Demo Data Seeding Script
 * 
 * This script populates Firestore with realistic demo data for testing.
 * Run with: node scripts/seed-demo-data.js
 */

const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  writeBatch,
  Timestamp,
  query,
  where,
  getDocs,
  deleteDoc
} = require('firebase/firestore');

// Firebase configuration - uses same env vars as the app
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Demo data generators
const FIRST_NAMES = ['Marco', 'Elena', 'Luca', 'Giulia', 'Francesco', 'Sofia', 'Alessandro', 'Chiara', 'Matteo', 'Anna', 'Davide', 'Laura', 'Andrea', 'Valentina', 'Simone'];
const LAST_NAMES = ['Rossi', 'Bianchi', 'Ferrari', 'Romano', 'Galli', 'Costa', 'Fontana', 'Conti', 'Esposito', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Moretti', 'Marchetti'];
const FITNESS_SPECIALTIES = ['Personal Training', 'Yoga', 'Pilates', 'HIIT', 'CrossFit', 'Functional Training', 'Strength Training', 'Cardio', 'Boxe', 'Nutrizione'];
const WELLNESS_SPECIALTIES = ['Massaggio', 'Fisioterapia', 'Osteopatia', 'Mental Coaching', 'Psicologia', 'Nutrizione', 'Yoga Therapy'];
const BEAUTY_SPECIALTIES = ['Estetista', 'Parrucchiere', 'Manicure', 'Pedicure', 'Trucco', 'Depilazione'];
const GYM_NAMES = ['Carosello Fitness', 'Urban Core Gym', 'Village Fit Club', 'Olympic Gym', 'Body Center', 'Fit Space', 'Wellness Hub', 'Energy Fitness'];
const WELLNESS_CENTER_NAMES = ['Wellness Spa Milano', 'Centro Benessere Navigli', 'Beauty & Wellness Hub', 'Oasi del Relax', 'Spa Metropolitan', 'Centro Armonia'];
const CLASS_NAMES = ['HIIT Power', 'Pilates Flow', 'Yoga Morning', 'Functional 360', 'Boxe Fit', 'Spinning Class', 'Body Pump', 'Zumba Dance'];
const CITIES = ['Milano', 'Roma', 'Torino', 'Bologna', 'Firenze', 'Napoli'];
const NEIGHBORHOODS = ['Centro', 'Navigli', 'Porta Nuova', 'Brera', 'Isola', 'Porta Venezia', 'Garibaldi', 'Loreto'];

// Helper functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomItems(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function generateName() {
  return `${randomItem(FIRST_NAMES)} ${randomItem(LAST_NAMES)}`;
}

function generateEmail(firstName, lastName) {
  const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.it', 'libero.it'];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1, 99)}@${randomItem(domains)}`;
}

function generatePhone() {
  return `+39 3${randomInt(0, 9)}${randomInt(0, 9)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`;
}

function generateDate(daysAgo = 365) {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, daysAgo));
  date.setHours(randomInt(8, 20), randomInt(0, 59), 0, 0);
  return Timestamp.fromDate(date);
}

function generateBio(specialty) {
  const bios = {
    'Personal Training': 'Specializzato in allenamento funzionale e trasformazione fisica. Aiuto i clienti a raggiungere i loro obiettivi fitness con programmi personalizzati.',
    'Yoga': 'Insegnante di yoga certificata con 10 anni di esperienza. Specializzata in Hatha Yoga e Yoga per principianti.',
    'Pilates': 'Istruttrice Pilates Method certificata. Focalizzata sulla postura, core stability e recupero infortuni.',
    'HIIT': 'Allenatore HIIT specializzato in workout ad alta intensità per massimizzare i risultati in tempi brevi.',
    'Nutrizione': 'Nutrizionista specializzata in alimentazione sportiva e piani alimentari personalizzati per obiettivi specifici.',
    'Massaggio': 'Massoterapista qualificata con specializzazione in massaggio decontratturante e linfodrenante.',
    'Fisioterapia': 'Fisioterapista con esperienza in riabilitazione sportiva e terapia del dolore.',
    'Psicologia': 'Psicologa specializzata in benessere psicologico, gestione dello stress e performance sportiva.',
  };
  return bios[specialty] || `Professionista specializzato in ${specialty} con anni di esperienza nel settore.`;
}

// Seeding functions
async function seedProviders(count = 15) {
  console.log(`📝 Seeding ${count} providers...`);
  const batch = writeBatch(db);
  
  for (let i = 0; i < count; i++) {
    const firstName = randomItem(FIRST_NAMES);
    const lastName = randomItem(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    const specialty = randomItem([...FITNESS_SPECIALTIES, ...WELLNESS_SPECIALTIES]);
    const isVerified = Math.random() > 0.3;
    
    const providerId = `provider_${i + 1}`;
    const userRef = doc(db, 'users', providerId);
    
    const userData = {
      id: providerId,
      email: generateEmail(firstName, lastName),
      phone: generatePhone(),
      fullName,
      firstName,
      lastName,
      avatarUrl: null,
      role: 'provider',
      isEmailVerified: true,
      isPhoneVerified: Math.random() > 0.2,
      createdAt: generateDate(500),
      updatedAt: Timestamp.now(),
      lastLoginAt: generateDate(30),
      bio: generateBio(specialty),
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
        professionalBio: generateBio(specialty),
        yearsOfExperience: randomInt(1, 15),
        languages: ['Italiano', Math.random() > 0.5 ? 'English' : null].filter(Boolean),
        licenseNumber: isVerified ? `LIC-${randomInt(10000, 99999)}` : null,
        rating: randomFloat(3.5, 5.0),
        reviewCount: randomInt(0, 150),
        servicePricing: [
          {
            id: `service_${providerId}_1`,
            serviceName: 'Sessione Individuale',
            description: 'Sessione one-to-one di 60 minuti',
            durationMinutes: 60,
            price: randomInt(50, 120),
            isActive: true,
          },
          {
            id: `service_${providerId}_2`,
            serviceName: 'Pacchetto 5 Sessioni',
            description: '5 sessioni individuali con sconto',
            durationMinutes: 60,
            price: randomInt(200, 500),
            isActive: true,
          },
          {
            id: `service_${providerId}_3`,
            serviceName: 'Consulenza Online',
            description: 'Video call di 30 minuti',
            durationMinutes: 30,
            price: randomInt(30, 60),
            isActive: Math.random() > 0.3,
          },
        ].filter(() => Math.random() > 0.2),
        availabilitySchedule: {
          monday: { isAvailable: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
          tuesday: { isAvailable: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
          wednesday: { isAvailable: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
          thursday: { isAvailable: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
          friday: { isAvailable: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }] },
          saturday: { isAvailable: Math.random() > 0.5, slots: [{ start: '09:00', end: '13:00' }] },
          sunday: { isAvailable: false, slots: [] },
        },
        certifications: isVerified ? [
          {
            id: `cert_${providerId}_1`,
            name: `Certificazione ${specialty} Professional`,
            issuingOrganization: randomItem(['CONI', 'FIF', 'FISAF', 'Yoga Alliance', 'ANP']),
            issueDate: generateDate(1000),
            expiryDate: Math.random() > 0.7 ? generateDate(-365) : null,
            documentUrl: null,
            isVerified: true,
          }
        ] : [],
        education: Math.random() > 0.5 ? [
          {
            id: `edu_${providerId}_1`,
            institution: randomItem(['Universita di Milano', 'Universita di Bologna', 'ISEF', 'Scuola dello Sport']),
            degree: randomItem(['Laurea', 'Diploma', 'Master']),
            fieldOfStudy: specialty,
            startDate: generateDate(2000),
            endDate: generateDate(1500),
            isOngoing: false,
          }
        ] : [],
        portfolioImages: [],
        cancellationPolicy: 'Cancellazione gratuita fino a 24 ore prima dell\'appuntamento.',
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
  console.log(`✅ Seeded ${count} providers`);
}

async function seedCustomers(count = 20) {
  console.log(`📝 Seeding ${count} customers...`);
  const batch = writeBatch(db);
  
  for (let i = 0; i < count; i++) {
    const firstName = randomItem(FIRST_NAMES);
    const lastName = randomItem(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    
    const customerId = `customer_${i + 1}`;
    const userRef = doc(db, 'users', customerId);
    
    const userData = {
      id: customerId,
      email: generateEmail(firstName, lastName),
      phone: generatePhone(),
      fullName,
      firstName,
      lastName,
      avatarUrl: null,
      role: 'customer',
      isEmailVerified: Math.random() > 0.1,
      isPhoneVerified: Math.random() > 0.3,
      createdAt: generateDate(400),
      updatedAt: Timestamp.now(),
      lastLoginAt: generateDate(60),
      bio: null,
      pointsBalance: randomInt(0, 1000),
      isVip: Math.random() > 0.85,
      addresses: [
        {
          id: `addr_${customerId}_1`,
          label: 'Casa',
          street: `Via ${randomItem(['Roma', 'Milano', 'Torino', 'Garibaldi', 'Mazzini'])}, ${randomInt(1, 100)}`,
          city: randomItem(CITIES),
          zipCode: `${randomInt(10000, 99999)}`,
          isDefault: true,
        }
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
  console.log(`✅ Seeded ${count} customers`);
}

async function seedVenues(count = 10) {
  console.log(`📝 Seeding ${count} venues...`);
  const batch = writeBatch(db);
  
  for (let i = 0; i < count; i++) {
    const isFitness = Math.random() > 0.4;
    const name = isFitness 
      ? randomItem(GYM_NAMES) + (Math.random() > 0.5 ? '' : ` ${randomItem(NEIGHBORHOODS)}`)
      : randomItem(WELLNESS_CENTER_NAMES);
    
    const venueId = `venue_${i + 1}`;
    const venueRef = doc(db, 'venues', venueId);
    
    const venueData = {
      id: venueId,
      name,
      type: isFitness ? 'fitness' : 'wellness',
      description: `${name} offre servizi professionali ${isFitness ? 'di fitness e allenamento' : 'di benessere e bellezza'} nel cuore della città.`,
      address: {
        street: `Via ${randomItem(['Roma', 'Milano', 'Torino', 'Napoli', 'Firenze'])}, ${randomInt(1, 200)}`,
        city: randomItem(CITIES),
        neighborhood: randomItem(NEIGHBORHOODS),
        zipCode: `${randomInt(10000, 99999)}`,
        country: 'Italia',
        latitude: randomFloat(45.4, 45.5, 6),
        longitude: randomFloat(9.1, 9.3, 6),
      },
      phone: generatePhone(),
      email: `info@${name.toLowerCase().replace(/\s+/g, '')}.it`,
      website: `https://www.${name.toLowerCase().replace(/\s+/g, '')}.it`,
      rating: randomFloat(3.5, 5.0),
      reviewCount: randomInt(10, 300),
      isActive: true,
      isPartner: Math.random() > 0.3,
      amenities: isFitness 
        ? ['WiFi', 'Spogliatoi', 'Docce', 'Aria Condizionata', 'Parcheggio', 'Sauna'].filter(() => Math.random() > 0.3)
        : ['WiFi', 'Spogliatoi', 'Docce', 'Aria Condizionata', 'Relax Area', 'Tisane'],
      openingHours: {
        monday: { open: '07:00', close: '22:00' },
        tuesday: { open: '07:00', close: '22:00' },
        wednesday: { open: '07:00', close: '22:00' },
        thursday: { open: '07:00', close: '22:00' },
        friday: { open: '07:00', close: '22:00' },
        saturday: { open: '08:00', close: '20:00' },
        sunday: { open: '09:00', close: '14:00' },
      },
      images: [],
      createdAt: generateDate(600),
      updatedAt: Timestamp.now(),
    };
    
    batch.set(venueRef, venueData);
  }
  
  await batch.commit();
  console.log(`✅ Seeded ${count} venues`);
}

async function seedClasses(count = 30) {
  console.log(`📝 Seeding ${count} classes...`);
  const batch = writeBatch(db);
  
  // Get venues
  const venuesSnapshot = await getDocs(collection(db, 'venues'));
  const venueIds = venuesSnapshot.docs.filter(d => d.data().type === 'fitness').map(d => d.id);
  
  // Get providers
  const providersSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'provider')));
  const providerIds = providersSnapshot.docs.slice(0, 10).map(d => d.id);
  
  for (let i = 0; i < count; i++) {
    const className = randomItem(CLASS_NAMES);
    const classId = `class_${i + 1}`;
    const classRef = doc(db, 'classes', classId);
    
    // Generate date within next 7 days
    const date = new Date();
    date.setDate(date.getDate() + randomInt(0, 7));
    date.setHours(randomInt(7, 20), [0, 30][randomInt(0, 1)], 0, 0);
    
    const duration = randomItem([45, 60, 90]);
    const maxCapacity = randomInt(8, 25);
    
    const classData = {
      id: classId,
      name: className,
      description: `Lezione di ${className} adatta a tutti i livelli.`,
      level: randomItem(['Principiante', 'Intermedio', 'Avanzato', 'Tutti i livelli']),
      category: randomItem(['Cardio', 'Forza', 'Flessibilita', 'Danza', 'Martial Arts']),
      durationMinutes: duration,
      maxCapacity,
      bookedCount: randomInt(0, maxCapacity),
      price: randomInt(15, 35),
      instructorId: randomItem(providerIds),
      instructorName: randomItem(FIRST_NAMES),
      venueId: randomItem(venueIds),
      venueName: randomItem(GYM_NAMES),
      startTime: Timestamp.fromDate(date),
      endTime: Timestamp.fromDate(new Date(date.getTime() + duration * 60000)),
      isRecurring: Math.random() > 0.7,
      recurringPattern: Math.random() > 0.7 ? { frequency: 'weekly', days: [date.getDay()] } : null,
      isActive: true,
      requiresBooking: true,
      equipment: ['Tappetino', 'Acqua'].filter(() => Math.random() > 0.3),
      createdAt: generateDate(100),
      updatedAt: Timestamp.now(),
    };
    
    batch.set(classRef, classData);
  }
  
  await batch.commit();
  console.log(`✅ Seeded ${count} classes`);
}

async function seedBookings(count = 50) {
  console.log(`📝 Seeding ${count} bookings...`);
  
  // Get customers and providers
  const customersSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'customer')));
  const providersSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'provider')));
  
  const customers = customersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const providers = providersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const batch = writeBatch(db);
  
  for (let i = 0; i < count; i++) {
    const customer = randomItem(customers);
    const provider = randomItem(providers);
    const service = randomItem(provider.providerProfile?.servicePricing || [{ serviceName: 'Sessione', durationMinutes: 60, price: 70 }]);
    
    const bookingId = `booking_${i + 1}`;
    const bookingRef = doc(db, 'bookings', bookingId);
    
    // Generate date within last 30 days or next 30 days
    const isPast = Math.random() > 0.4;
    const date = new Date();
    if (isPast) {
      date.setDate(date.getDate() - randomInt(1, 30));
    } else {
      date.setDate(date.getDate() + randomInt(1, 30));
    }
    date.setHours(randomInt(8, 19), [0, 30][randomInt(0, 1)], 0, 0);
    
    const status = isPast 
      ? randomItem(['completed', 'completed', 'completed', 'cancelled', 'no_show'])
      : randomItem(['confirmed', 'confirmed', 'confirmed', 'pending']);
    
    const servicePrice = service.price || 70;
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
      serviceId: service.id || `service_${i}`,
      serviceName: service.serviceName || 'Sessione',
      
      scheduledAt: Timestamp.fromDate(date),
      scheduledEndAt: Timestamp.fromDate(new Date(date.getTime() + (service.durationMinutes || 60) * 60000)),
      duration: service.durationMinutes || 60,
      
      locationType: randomItem(['provider_location', 'client_location', 'virtual']),
      location: customer.addresses?.[0] || null,
      
      servicePrice,
      platformFee,
      discountAmount: Math.random() > 0.8 ? servicePrice * 0.1 : 0,
      pointsUsed: 0,
      pointsValue: 0,
      totalPrice: servicePrice + platformFee,
      finalPrice: servicePrice + platformFee - (Math.random() > 0.8 ? servicePrice * 0.1 : 0),
      
      promotionCode: Math.random() > 0.9 ? 'WELCOME10' : null,
      
      status,
      paymentStatus: status === 'completed' || status === 'confirmed' ? 'paid' : 'pending',
      paymentMethod: randomItem(['card', 'paypal', 'bank_transfer']),
      
      userNotes: Math.random() > 0.7 ? 'Ho qualche dolore alla schiena, preferirei esercizi leggeri.' : null,
      providerNotes: null,
      
      hasReviewed: status === 'completed' && Math.random() > 0.4,
      
      createdAt: generateDate(60),
      updatedAt: Timestamp.now(),
      confirmedAt: status !== 'pending' ? generateDate(30) : null,
      completedAt: status === 'completed' ? Timestamp.fromDate(date) : null,
      cancelledAt: status === 'cancelled' ? generateDate(30) : null,
      cancellationReason: status === 'cancelled' ? randomItem(['Cliente', 'Provider', 'Meteo']) : null,
    };
    
    batch.set(bookingRef, bookingData);
  }
  
  await batch.commit();
  console.log(`✅ Seeded ${count} bookings`);
}

async function seedReviews(count = 30) {
  console.log(`📝 Seeding ${count} reviews...`);
  
  // Get bookings that are completed
  const bookingsSnapshot = await getDocs(
    query(collection(db, 'bookings'), where('status', '==', 'completed'))
  );
  const bookings = bookingsSnapshot.docs.slice(0, count);
  
  const batch = writeBatch(db);
  
  const reviewTexts = [
    'Esperienza fantastica! Professionale e preparato.',
    'Ottima sessione, ho imparato molto. Consigliatissimo!',
    'Molto professionale e puntuale. Tornero sicuramente.',
    'Grande competenza e attenzione alle esigenze.',
    'Sessione molto utile, spiegazioni chiare.',
    'Ambiente accogliente e professionale.',
    'Ho riscontrato miglioramenti fin dalla prima seduta.',
    'Servizio impeccabile, staff cordiale.',
    'Esperienza positiva, consiglio a tutti.',
    'Professionista molto qualificato e disponibile.',
  ];
  
  for (let i = 0; i < bookings.length; i++) {
    const booking = bookings[i].data();
    const reviewId = `review_${i + 1}`;
    const reviewRef = doc(db, 'reviews', reviewId);
    
    const rating = randomItem([5, 5, 5, 4, 4, 5, 3]);
    
    const reviewData = {
      id: reviewId,
      bookingId: bookings[i].id,
      userId: booking.userId,
      userName: booking.userName,
      providerId: booking.providerId,
      providerName: booking.providerName,
      serviceName: booking.serviceName,
      rating,
      comment: rating >= 4 ? randomItem(reviewTexts) : 'Potrebbe migliorare in alcuni aspetti.',
      isPublic: true,
      isVerified: true,
      helpful: randomInt(0, 20),
      createdAt: booking.completedAt || generateDate(30),
      updatedAt: Timestamp.now(),
    };
    
    batch.set(reviewRef, reviewData);
  }
  
  await batch.commit();
  console.log(`✅ Seeded ${bookings.length} reviews`);
}

async function clearCollection(collectionName) {
  console.log(`🧹 Clearing ${collectionName}...`);
  const snapshot = await getDocs(collection(db, collectionName));
  const batch = writeBatch(db);
  
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  console.log(`✅ Cleared ${snapshot.size} documents from ${collectionName}`);
}

async function seedAll() {
  console.log('🚀 Starting VFit demo data seeding...\n');
  
  try {
    // Clear existing data (optional - comment out if you want to keep existing)
    // await clearCollection('users');
    // await clearCollection('venues');
    // await clearCollection('classes');
    // await clearCollection('bookings');
    // await clearCollection('reviews');
    
    // Seed in order (respecting dependencies)
    await seedProviders(15);
    await seedCustomers(20);
    await seedVenues(10);
    await seedClasses(30);
    await seedBookings(50);
    await seedReviews(30);
    
    console.log('\n✨ Demo data seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   • 15 Providers (fitness & wellness professionals)');
    console.log('   • 20 Customers');
    console.log('   • 10 Venues (gyms & wellness centers)');
    console.log('   • 30 Fitness Classes');
    console.log('   • 50 Bookings');
    console.log('   • 30 Reviews');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding demo data:', error);
    process.exit(1);
  }
}

// Check for --clear flag
if (process.argv.includes('--clear')) {
  console.log('🧹 Clearing all collections...\n');
  Promise.all([
    clearCollection('users'),
    clearCollection('venues'),
    clearCollection('classes'),
    clearCollection('bookings'),
    clearCollection('reviews'),
  ]).then(() => {
    console.log('\n✅ All collections cleared');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Error clearing collections:', error);
    process.exit(1);
  });
} else {
  seedAll();
}

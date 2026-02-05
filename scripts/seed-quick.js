/**
 * Quick Seed Script for Local Development
 * 
 * This script seeds minimal demo data quickly for local testing.
 * Uses the Firebase JS SDK directly.
 * 
 * Usage:
 *   node scripts/seed-quick.js
 * 
 * Or with Firebase emulators:
 *   FIREBASE_EMULATOR=true node scripts/seed-quick.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, collection, Timestamp } = require('firebase/firestore');
const { getAuth, connectAuthEmulator } = require('firebase/auth');

// Minimal Firebase config for emulator mode
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Connect to emulators if flag is set
if (process.env.FIREBASE_EMULATOR === 'true') {
  console.log('🔌 Connecting to Firebase emulators...');
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099');
}

// Quick seed data
const seedData = {
  users: [
    // Providers
    {
      id: 'provider_demo_1',
      email: 'trainer@vfit.demo',
      fullName: 'Marco Rossi',
      role: 'provider',
      providerProfile: {
        isActive: true,
        isVerified: true,
        specialties: ['Personal Training', 'HIIT'],
        professionalBio: 'Personal trainer certificato CONI con 8 anni di esperienza. Specializzato in allenamento funzionale e dimagrimento.',
        yearsOfExperience: 8,
        rating: 4.8,
        reviewCount: 45,
        servicePricing: [
          { id: 'svc1', serviceName: 'Sessione Individuale', durationMinutes: 60, price: 70, isActive: true },
          { id: 'svc2', serviceName: 'Pacchetto 5 Sessioni', durationMinutes: 60, price: 300, isActive: true },
        ],
      },
      performanceMetrics: { totalBookings: 120, totalRevenue: 8500 },
    },
    {
      id: 'provider_demo_2',
      email: 'yoga@vfit.demo',
      fullName: 'Elena Bianchi',
      role: 'provider',
      providerProfile: {
        isActive: true,
        isVerified: true,
        specialties: ['Yoga', 'Pilates'],
        professionalBio: 'Insegnante di Yoga certificata Yoga Alliance. Amo aiutare le persone a trovare equilibrio e benessere.',
        yearsOfExperience: 10,
        rating: 4.9,
        reviewCount: 78,
        servicePricing: [
          { id: 'svc1', serviceName: 'Lezione Yoga', durationMinutes: 75, price: 60, isActive: true },
          { id: 'svc2', serviceName: 'Pilates 1-to-1', durationMinutes: 60, price: 65, isActive: true },
        ],
      },
      performanceMetrics: { totalBookings: 200, totalRevenue: 12000 },
    },
    {
      id: 'provider_demo_3',
      email: 'nutrition@vfit.demo',
      fullName: 'Giulia Romano',
      role: 'provider',
      providerProfile: {
        isActive: true,
        isVerified: true,
        specialties: ['Nutrizione', 'Benessere'],
        professionalBio: 'Nutrizionista specializzata in alimentazione sportiva e piani alimentari personalizzati.',
        yearsOfExperience: 5,
        rating: 4.7,
        reviewCount: 32,
        servicePricing: [
          { id: 'svc1', serviceName: 'Consulenza Nutrizionale', durationMinutes: 60, price: 80, isActive: true },
          { id: 'svc2', serviceName: 'Piano Alimentare', durationMinutes: 30, price: 120, isActive: true },
        ],
      },
      performanceMetrics: { totalBookings: 80, totalRevenue: 6500 },
    },
    // Customers
    {
      id: 'customer_demo_1',
      email: 'user1@test.com',
      fullName: 'Luca Verdi',
      role: 'customer',
      pointsBalance: 150,
      isVip: false,
    },
    {
      id: 'customer_demo_2',
      email: 'user2@test.com',
      fullName: 'Anna Neri',
      role: 'customer',
      pointsBalance: 500,
      isVip: true,
    },
  ],
  
  venues: [
    {
      id: 'venue_demo_1',
      name: 'Carosello Fitness',
      type: 'fitness',
      city: 'Milano',
      neighborhood: 'Centro',
      rating: 4.8,
      reviewCount: 124,
      isActive: true,
      isPartner: true,
    },
    {
      id: 'venue_demo_2',
      name: 'Urban Core Gym',
      type: 'fitness',
      city: 'Milano',
      neighborhood: 'Porta Nuova',
      rating: 4.6,
      reviewCount: 89,
      isActive: true,
      isPartner: false,
    },
    {
      id: 'venue_demo_3',
      name: 'Wellness Spa Milano',
      type: 'wellness',
      city: 'Milano',
      neighborhood: 'Brera',
      rating: 4.9,
      reviewCount: 256,
      isActive: true,
      isPartner: true,
    },
  ],
  
  classes: [
    {
      id: 'class_demo_1',
      name: 'HIIT Power',
      instructorName: 'Marco R.',
      maxCapacity: 15,
      bookedCount: 12,
      level: 'Intermedio',
      startTime: getTomorrowAt(7, 30),
    },
    {
      id: 'class_demo_2',
      name: 'Yoga Flow',
      instructorName: 'Elena B.',
      maxCapacity: 20,
      bookedCount: 18,
      level: 'Tutti i livelli',
      startTime: getTomorrowAt(9, 0),
    },
    {
      id: 'class_demo_3',
      name: 'Pilates Mat',
      instructorName: 'Elena B.',
      maxCapacity: 12,
      bookedCount: 8,
      level: 'Principiante',
      startTime: getTomorrowAt(18, 0),
    },
  ],
  
  bookings: [
    {
      id: 'booking_demo_1',
      userId: 'customer_demo_1',
      userName: 'Luca Verdi',
      providerId: 'provider_demo_1',
      providerName: 'Marco Rossi',
      serviceName: 'Sessione Individuale',
      status: 'confirmed',
      scheduledAt: getTomorrowAt(10, 0),
      totalPrice: 73.50,
    },
    {
      id: 'booking_demo_2',
      userId: 'customer_demo_2',
      userName: 'Anna Neri',
      providerId: 'provider_demo_2',
      providerName: 'Elena Bianchi',
      serviceName: 'Lezione Yoga',
      status: 'completed',
      scheduledAt: getDaysAgo(5),
      totalPrice: 63.00,
    },
    {
      id: 'booking_demo_3',
      userId: 'customer_demo_1',
      userName: 'Luca Verdi',
      providerId: 'provider_demo_3',
      providerName: 'Giulia Romano',
      serviceName: 'Consulenza Nutrizionale',
      status: 'pending',
      scheduledAt: getTomorrowAt(14, 30),
      totalPrice: 84.00,
    },
  ],
  
  reviews: [
    {
      id: 'review_demo_1',
      userId: 'customer_demo_2',
      userName: 'Anna Neri',
      providerId: 'provider_demo_2',
      providerName: 'Elena Bianchi',
      serviceName: 'Lezione Yoga',
      rating: 5,
      comment: 'Esperienza fantastica! Elena e molto professionale e attenta.',
    },
    {
      id: 'review_demo_2',
      userId: 'customer_demo_1',
      userName: 'Luca Verdi',
      providerId: 'provider_demo_1',
      providerName: 'Marco Rossi',
      serviceName: 'Sessione Individuale',
      rating: 5,
      comment: 'Allenamento intenso ma gratificante. Marco sa come motivarti!',
    },
  ],
};

// Helper functions
function getTomorrowAt(hour, minute) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  return Timestamp.fromDate(date);
}

function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(10, 0, 0, 0);
  return Timestamp.fromDate(date);
}

async function seedCollection(collectionName, documents) {
  console.log(`📝 Seeding ${documents.length} ${collectionName}...`);
  
  for (const docData of documents) {
    const { id, ...data } = docData;
    const docRef = doc(db, collectionName, id);
    await setDoc(docRef, {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
  
  console.log(`✅ Seeded ${documents.length} ${collectionName}`);
}

async function seedAll() {
  console.log('🚀 Starting quick seed...\n');
  
  try {
    await seedCollection('users', seedData.users);
    await seedCollection('venues', seedData.venues);
    await seedCollection('classes', seedData.classes);
    await seedCollection('bookings', seedData.bookings);
    await seedCollection('reviews', seedData.reviews);
    
    console.log('\n✨ Quick seed completed!');
    console.log('\n📊 Summary:');
    console.log('   • 3 Providers (Trainer, Yoga, Nutritionist)');
    console.log('   • 2 Customers (1 regular, 1 VIP)');
    console.log('   • 3 Venues (2 fitness, 1 wellness)');
    console.log('   • 3 Classes scheduled for tomorrow');
    console.log('   • 3 Bookings (confirmed, completed, pending)');
    console.log('   • 2 Reviews with 5-star ratings');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

seedAll();

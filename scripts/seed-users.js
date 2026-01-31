/**
 * Seed Sample Users Script
 * Run with: GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase/hidran_gmail_com_application_default_credentials.json node scripts/seed-users.js
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Initialize Firebase Admin
if (getApps().length === 0) {
  initializeApp({
    projectId: 'vfit-funlife',
  });
}

const auth = getAuth();
const db = getFirestore();

const users = [
  // Super Admin
  {
    email: 'admin@vfit.com',
    password: 'Test123456!',
    displayName: 'System Administrator',
    role: 'superadmin',
    userData: {
      fullName: 'System Administrator',
      preferredSection: 'fit',
      isVip: true,
      pointsBalance: 1000,
    }
  },
  // Admin
  {
    email: 'manager@vfit.com',
    password: 'Test123456!',
    displayName: 'Platform Manager',
    role: 'admin',
    userData: {
      fullName: 'Platform Manager',
      preferredSection: 'fit',
      isVip: false,
      pointsBalance: 500,
    }
  },
  // Providers
  {
    email: 'marco.rossi@vfit.com',
    password: 'Test123456!',
    displayName: 'Marco Rossi',
    role: 'provider',
    userType: 'personal_trainer',
    userData: {
      fullName: 'Marco Rossi',
      bio: 'Personal trainer certificato ISSA con 8 anni di esperienza nel fitness e bodybuilding. Specializzato in trasformazioni fisiche e allenamento funzionale.',
      preferredSection: 'fit',
      isVip: false,
      pointsBalance: 100,
      providerProfile: {
        professionalBio: 'Trainer professionista con esperienza internazionale. Aiuto i miei clienti a raggiungere i loro obiettivi fitness attraverso programmi personalizzati.',
        specialties: ['Weight Loss', 'Muscle Building', 'HIIT', 'Functional Training'],
        certifications: [
          { name: 'ISSA CPT', issuer: 'ISSA', year: 2016 },
          { name: 'NASM CES', issuer: 'NASM', year: 2018 }
        ],
        yearsOfExperience: 8,
        languages: ['it', 'en'],
        education: [
          { degree: 'Laurea in Scienze Motorie', institution: 'Università di Bologna', year: 2015 }
        ],
        isVerified: true,
        rating: 4.8,
        reviewCount: 47,
        licenseNumber: 'ISSA-CPT-2016-12345',
        cancellationPolicy: 'Cancellazione gratuita fino a 24 ore prima dell\'appuntamento'
      }
    }
  },
  {
    email: 'elena.bianchi@vfit.com',
    password: 'Test123456!',
    displayName: 'Elena Bianchi',
    role: 'provider',
    userType: 'yoga_teacher',
    userData: {
      fullName: 'Elena Bianchi',
      bio: 'Insegnante di yoga certificata Yoga Alliance RYT-500. Appassionata di mindfulness e benessere olistico.',
      preferredSection: 'wellness',
      isVip: false,
      pointsBalance: 100,
      providerProfile: {
        professionalBio: 'Insegno yoga da 5 anni con approccio olistico che integra asana, pranayama e meditazione.',
        specialties: ['Hatha Yoga', 'Vinyasa Flow', 'Meditation', 'Yin Yoga'],
        certifications: [
          { name: 'RYT-500', issuer: 'Yoga Alliance', year: 2019 },
          { name: 'Yin Yoga Certified', issuer: 'Yin Yoga Institute', year: 2020 }
        ],
        yearsOfExperience: 5,
        languages: ['it'],
        education: [
          { degree: 'Formazione Yoga 500h', institution: 'Yoga Alliance School', year: 2019 }
        ],
        isVerified: true,
        rating: 4.9,
        reviewCount: 32,
        cancellationPolicy: 'Cancellazione gratuita fino a 12 ore prima'
      }
    }
  },
  {
    email: 'giulia.neri@vfit.com',
    password: 'Test123456!',
    displayName: 'Giulia Neri',
    role: 'provider',
    userType: 'hairstylist',
    userData: {
      fullName: 'Giulia Neri',
      bio: 'Hair stylist professionale specializzata in tagli moderni, colorazione creativa e trattamenti ristrutturanti.',
      preferredSection: 'fun',
      isVip: false,
      pointsBalance: 100,
      providerProfile: {
        professionalBio: 'Con 6 anni di esperienza nel settore beauty, creo look personalizzati che esaltano la bellezza naturale di ogni cliente.',
        specialties: ['Taglio Donna', 'Colorazione', 'Balayage', 'Trattamenti'],
        certifications: [
          { name: 'Diploma Parrucchiera', issuer: 'Scuola Professionale', year: 2018 },
          { name: 'Wella Master Colorist', issuer: 'Wella', year: 2020 }
        ],
        yearsOfExperience: 6,
        languages: ['it', 'en'],
        education: [
          { degree: 'Diploma di Qualifica Professionale', institution: 'Scuola di Parruccheria', year: 2018 }
        ],
        isVerified: true,
        rating: 4.7,
        reviewCount: 89,
        cancellationPolicy: 'Cancellazione gratuita fino a 24 ore prima'
      }
    }
  },
  {
    email: 'dr.alessandro.verdi@vfit.com',
    password: 'Test123456!',
    displayName: 'Dr. Alessandro Verdi',
    role: 'provider',
    userType: 'psychologist',
    userData: {
      fullName: 'Dr. Alessandro Verdi',
      bio: 'Psicologo iscritto all\'Albo, specialista in terapia cognitivo-comportamentale e mindfulness.',
      preferredSection: 'life',
      isVip: false,
      pointsBalance: 100,
      providerProfile: {
        professionalBio: 'Psicologo clinico con 10 anni di esperienza. Offro supporto per ansia, depressione, stress e difficoltà relazionali.',
        specialties: ['Ansia', 'Depressione', 'Stress Management', 'Terapia di Coppia'],
        certifications: [
          { name: 'Psicologo iscritto Albo', issuer: 'Ordine Psicologi', year: 2014 },
          { name: 'CBT Certified', issuer: 'Academy of CBT', year: 2016 }
        ],
        yearsOfExperience: 10,
        languages: ['it', 'en'],
        education: [
          { degree: 'Laurea in Psicologia', institution: 'Università La Sapienza', year: 2013 },
          { degree: 'Specializzazione in Psicoterapia', institution: 'Scuola di Specializzazione', year: 2018 }
        ],
        isVerified: true,
        rating: 4.9,
        reviewCount: 56,
        licenseNumber: 'PSY-12345-Roma',
        cancellationPolicy: 'Cancellazione gratuita fino a 48 ore prima'
      }
    }
  },
  {
    email: 'sarah.johnson@vfit.com',
    password: 'Test123456!',
    displayName: 'Sarah Johnson',
    role: 'provider',
    userType: 'pronunciation_coach',
    userData: {
      fullName: 'Sarah Johnson',
      bio: 'Coach di pronuncia madrelingua inglese, certificata TEFL. Aiuto italiani a migliorare fluency e confidence.',
      preferredSection: 'life',
      isVip: false,
      pointsBalance: 100,
      providerProfile: {
        professionalBio: 'Insegno inglese da 7 anni con focus su pronuncia e comunicazione professionale.',
        specialties: ['British Accent', 'Business English', 'IELTS Preparation', 'Conversation'],
        certifications: [
          { name: 'TEFL', issuer: 'TEFL Academy', year: 2017 },
          { name: 'CELTA', issuer: 'Cambridge', year: 2018 }
        ],
        yearsOfExperience: 7,
        languages: ['en', 'it'],
        education: [
          { degree: 'BA in English Literature', institution: 'University of Manchester', year: 2016 }
        ],
        isVerified: true,
        rating: 4.8,
        reviewCount: 41,
        cancellationPolicy: 'Cancellazione gratuita fino a 24 ore prima'
      }
    }
  },
  {
    email: 'dr.laura.martini@vfit.com',
    password: 'Test123456!',
    displayName: 'Dr. Laura Martini',
    role: 'provider',
    userType: 'nutritionist',
    userData: {
      fullName: 'Dr. Laura Martini',
      bio: 'Biologa nutrizionista specializzata in nutrizione sportiva e piani alimentari personalizzati.',
      preferredSection: 'fit',
      isVip: false,
      pointsBalance: 100,
      providerProfile: {
        professionalBio: 'Aiuto atleti e appassionati di fitness a ottimizzare la loro alimentazione per migliorare performance e composizione corporea.',
        specialties: ['Nutrizione Sportiva', 'Dimagrimento', 'Vegana/Vegetariana', 'Body Recomposition'],
        certifications: [
          { name: 'Laurea in Biologia', issuer: 'Università di Milano', year: 2019 },
          { name: 'Master Nutrizione Sportiva', issuer: 'CONI', year: 2021 }
        ],
        yearsOfExperience: 4,
        languages: ['it'],
        education: [
          { degree: 'Laurea in Biologia', institution: 'Università di Milano', year: 2019 },
          { degree: 'Master in Nutrizione Sportiva', institution: 'CONI', year: 2021 }
        ],
        isVerified: true,
        rating: 4.7,
        reviewCount: 28,
        cancellationPolicy: 'Cancellazione gratuita fino a 24 ore prima'
      }
    }
  },
  // Customers
  {
    email: 'user1@test.com',
    password: 'Test123456!',
    displayName: 'Luca Ferrari',
    role: 'customer',
    userData: {
      fullName: 'Luca Ferrari',
      preferredSection: 'fit',
      isVip: false,
      pointsBalance: 100,
    }
  },
  {
    email: 'user2@test.com',
    password: 'Test123456!',
    displayName: 'Maria Colombo',
    role: 'customer',
    userData: {
      fullName: 'Maria Colombo',
      preferredSection: 'wellness',
      isVip: true,
      pointsBalance: 250,
    }
  },
];

async function seedUsers() {
  console.log('\n🌱 Seeding Users...\n');
  
  const results = { created: 0, skipped: 0, errors: [] };
  
  for (const user of users) {
    try {
      // Check if user exists in Auth
      let uid;
      try {
        const existingUser = await auth.getUserByEmail(user.email);
        uid = existingUser.uid;
        console.log(`⏭️  Auth user exists: ${user.email}`);
        results.skipped++;
      } catch (err) {
        // Create new user
        const newUser = await auth.createUser({
          email: user.email,
          password: user.password,
          displayName: user.displayName,
          emailVerified: true,
        });
        uid = newUser.uid;
        console.log(`✅ Created auth user: ${user.email}`);
        results.created++;
      }
      
      // Create/update Firestore document
      const userRef = db.collection('users').doc(uid);
      const now = FieldValue.serverTimestamp();
      
      const userDoc = {
        uid,
        email: user.email,
        fullName: user.userData.fullName,
        role: user.role,
        ...(user.userType && { userType: user.userType }),
        ...user.userData,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        fcmTokens: [],
        notificationsEnabled: true,
      };
      
      await userRef.set(userDoc, { merge: true });
      console.log(`   Firestore: ${user.role}${user.userType ? ` (${user.userType})` : ''}`);
      
    } catch (error) {
      console.error(`❌ Error with ${user.email}:`, error.message);
      results.errors.push({ email: user.email, error: error.message });
    }
  }
  
  console.log('\n📊 Summary:');
  console.log(`   Created: ${results.created}`);
  console.log(`   Skipped: ${results.skipped}`);
  console.log(`   Errors: ${results.errors.length}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(e => console.log(`   - ${e.email}: ${e.error}`));
  }
  
  console.log('\n✨ Users seeded successfully!\n');
  console.log('Login credentials:');
  console.log('   Email: admin@vfit.com / manager@vfit.com / marco.rossi@vfit.com');
  console.log('   Password: Test123456!');
}

seedUsers().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

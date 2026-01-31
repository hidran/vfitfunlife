#!/usr/bin/env node
/**
 * VFit User Seeding Script
 * 
 * This script creates 10 sample users in Firebase Auth + Firestore
 * for testing and demo purposes.
 * 
 * Usage:
 *   npx ts-node scripts/seed-users.ts
 * 
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to your
 *     Firebase service account key JSON file
 *   - Or have firebase-functions initialized in the project
 */

import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_PASSWORD = 'Test123456!';

// Type definitions matching the functions/src/types.ts

type UserRole = "superadmin" | "admin" | "provider" | "customer";

type UserType =
  | "trainer"
  | "hairstylist"
  | "yoga_teacher"
  | "psychologist"
  | "pronunciation_coach"
  | "nutritionist"
  | "massage_therapist"
  | "personal_trainer"
  | "pilates_instructor"
  | "dance_instructor"
  | "other";

type Permission =
  | "users:read"
  | "users:write"
  | "users:delete"
  | "users:manage_roles"
  | "providers:read"
  | "providers:write"
  | "providers:verify"
  | "bookings:read"
  | "bookings:write"
  | "bookings:cancel"
  | "bookings:confirm"
  | "venues:read"
  | "venues:write"
  | "venues:delete"
  | "services:read"
  | "services:write"
  | "services:delete"
  | "config:read"
  | "config:write"
  | "reports:read"
  | "content:read"
  | "content:write"
  | "promotions:read"
  | "promotions:write"
  | "financial:read"
  | "financial:write";

interface ProviderProfile {
  bio: string;
  specialties: string[];
  certifications: string[];
  yearsOfExperience: number;
  languages: string[];
  isVerified: boolean;
  rating: number;
  reviewCount: number;
  hourlyRate?: number;
  availabilitySchedule?: Record<string, unknown>;
  serviceArea?: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
}

interface UserSeedData {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  userType?: UserType;
  providerProfile?: ProviderProfile;
  preferredSection?: 'fit' | 'fun' | 'life';
}

// ============================================
// USER DATA
// ============================================

const users: UserSeedData[] = [
  // Super Admin
  {
    email: 'admin@vfit.com',
    password: DEFAULT_PASSWORD,
    displayName: 'System Administrator',
    role: 'superadmin',
    preferredSection: 'fit',
  },
  // Admin
  {
    email: 'manager@vfit.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Platform Manager',
    role: 'admin',
    preferredSection: 'fit',
  },
  // Provider: Personal Trainer
  {
    email: 'marco.rossi@vfit.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Marco Rossi',
    role: 'provider',
    userType: 'personal_trainer',
    preferredSection: 'fit',
    providerProfile: {
      bio: 'Personal trainer certificato ISSA con 8 anni di esperienza',
      specialties: ['Weight Loss', 'Muscle Building', 'HIIT'],
      certifications: ['ISSA CPT', 'NASM CES'],
      yearsOfExperience: 8,
      languages: ['it', 'en'],
      isVerified: true,
      rating: 4.8,
      reviewCount: 127,
      hourlyRate: 50,
    },
  },
  // Provider: Yoga Teacher
  {
    email: 'elena.bianchi@vfit.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Elena Bianchi',
    role: 'provider',
    userType: 'yoga_teacher',
    preferredSection: 'fit',
    providerProfile: {
      bio: 'Insegnante di yoga certificata Yoga Alliance RYT-500',
      specialties: ['Hatha Yoga', 'Vinyasa Flow', 'Meditation'],
      certifications: ['RYT-500', 'Yin Yoga Certified'],
      yearsOfExperience: 5,
      languages: ['it'],
      isVerified: true,
      rating: 4.9,
      reviewCount: 89,
      hourlyRate: 45,
    },
  },
  // Provider: Hairstylist
  {
    email: 'giulia.neri@vfit.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Giulia Neri',
    role: 'provider',
    userType: 'hairstylist',
    preferredSection: 'life',
    providerProfile: {
      bio: 'Hair stylist professionale specializzata in tagli moderni',
      specialties: ['Taglio Donna', 'Colorazione', 'Balayage'],
      certifications: ['Diploma Parrucchiera', 'Wella Master Colorist'],
      yearsOfExperience: 6,
      languages: ['it', 'en'],
      isVerified: true,
      rating: 4.7,
      reviewCount: 156,
      hourlyRate: 40,
    },
  },
  // Provider: Psychologist
  {
    email: 'dr.alessandro.verdi@vfit.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Dr. Alessandro Verdi',
    role: 'provider',
    userType: 'psychologist',
    preferredSection: 'life',
    providerProfile: {
      bio: 'Psicologo iscritto all\'Albo, specialista in terapia cognitivo-comportamentale',
      specialties: ['Ansia', 'Depressione', 'Stress Management', 'Terapia di Coppia'],
      certifications: ['Psicologo iscritto Albo', 'CBT Certified'],
      yearsOfExperience: 10,
      languages: ['it', 'en'],
      isVerified: true,
      rating: 4.9,
      reviewCount: 203,
      hourlyRate: 80,
    },
  },
  // Provider: Pronunciation Coach
  {
    email: 'sarah.johnson@vfit.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Sarah Johnson',
    role: 'provider',
    userType: 'pronunciation_coach',
    preferredSection: 'life',
    providerProfile: {
      bio: 'Coach di pronuncia madrelingua inglese, certificata TEFL',
      specialties: ['British Accent', 'Business English', 'IELTS Preparation'],
      certifications: ['TEFL', 'CELTA'],
      yearsOfExperience: 7,
      languages: ['en', 'it'],
      isVerified: true,
      rating: 4.8,
      reviewCount: 94,
      hourlyRate: 55,
    },
  },
  // Provider: Nutritionist
  {
    email: 'dr.laura.martini@vfit.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Dr. Laura Martini',
    role: 'provider',
    userType: 'nutritionist',
    preferredSection: 'fit',
    providerProfile: {
      bio: 'Biologa nutrizionista specializzata in nutrizione sportiva',
      specialties: ['Nutrizione Sportiva', 'Dimagrimento', 'Vegana/Vegetariana'],
      certifications: ['Laurea in Biologia', 'Master Nutrizione Sportiva'],
      yearsOfExperience: 4,
      languages: ['it'],
      isVerified: true,
      rating: 4.6,
      reviewCount: 67,
      hourlyRate: 60,
    },
  },
  // Customer 1
  {
    email: 'user1@test.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Luca Ferrari',
    role: 'customer',
    preferredSection: 'fit',
  },
  // Customer 2
  {
    email: 'user2@test.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Maria Colombo',
    role: 'customer',
    preferredSection: 'life',
  },
];

// ============================================
// ROLE PERMISSIONS
// ============================================

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [
    'users:read', 'users:write', 'users:delete', 'users:manage_roles',
    'providers:read', 'providers:write', 'providers:verify',
    'bookings:read', 'bookings:write', 'bookings:cancel', 'bookings:confirm',
    'venues:read', 'venues:write', 'venues:delete',
    'services:read', 'services:write', 'services:delete',
    'config:read', 'config:write',
    'reports:read',
    'content:read', 'content:write',
    'promotions:read', 'promotions:write',
    'financial:read', 'financial:write',
  ],
  admin: [
    'users:read', 'users:write',
    'providers:read', 'providers:write', 'providers:verify',
    'bookings:read', 'bookings:write', 'bookings:cancel', 'bookings:confirm',
    'venues:read', 'venues:write',
    'services:read', 'services:write',
    'config:read',
    'reports:read',
    'content:read', 'content:write',
    'promotions:read', 'promotions:write',
    'financial:read',
  ],
  provider: [
    'bookings:read', 'bookings:write', 'bookings:cancel',
    'services:read',
  ],
  customer: [],
};

// ============================================
// FIREBASE INITIALIZATION
// ============================================

function initializeFirebaseAdmin(): admin.app.App {
  // Check if already initialized
  if (admin.apps && admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0] as admin.app.App;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // Try to use GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('Using GOOGLE_APPLICATION_CREDENTIALS for authentication');
    const initOptions: admin.AppOptions = {
      credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    };
    if (projectId) initOptions.projectId = projectId;
    return admin.initializeApp(initOptions);
  }

  // Try to use FIREBASE_SERVICE_ACCOUNT_JSON (JSON string)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.log('Using FIREBASE_SERVICE_ACCOUNT_JSON for authentication');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const initOptions: admin.AppOptions = {
      credential: admin.credential.cert(serviceAccount),
    };
    if (projectId) initOptions.projectId = projectId;
    return admin.initializeApp(initOptions);
  }

  // Check for service account file in common locations
  const possiblePaths = [
    path.join(process.cwd(), 'scripts', 'serviceAccountKey.json'),
    path.join(process.cwd(), 'serviceAccountKey.json'),
  ];

  for (const credPath of possiblePaths) {
    if (fs.existsSync(credPath)) {
      console.log(`Using service account from: ${credPath}`);
      const initOptions: admin.AppOptions = {
        credential: admin.credential.cert(credPath),
      };
      if (projectId) initOptions.projectId = projectId;
      return admin.initializeApp(initOptions);
    }
  }

  // Try application default credentials (gcloud auth)
  console.log('Using application default credentials');
  const initOptions: admin.AppOptions = {
    credential: admin.credential.applicationDefault(),
  };
  if (projectId) initOptions.projectId = projectId;
  return admin.initializeApp(initOptions);
}

// ============================================
// USER CREATION FUNCTIONS
// ============================================

async function createAuthUser(
  auth: admin.auth.Auth,
  userData: UserSeedData
): Promise<admin.auth.UserRecord | null> {
  try {
    // Check if user already exists
    try {
      const existingUser = await auth.getUserByEmail(userData.email);
      console.log(`  ⚠️  User ${userData.email} already exists (UID: ${existingUser.uid})`);
      return existingUser;
    } catch (error: any) {
      // User doesn't exist, proceed with creation
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create new user
    const userRecord = await auth.createUser({
      email: userData.email,
      password: userData.password,
      displayName: userData.displayName,
      emailVerified: true,
    });

    console.log(`  ✅ Created Auth user: ${userData.email} (UID: ${userRecord.uid})`);
    return userRecord;
  } catch (error: any) {
    console.error(`  ❌ Error creating Auth user ${userData.email}:`, error.message);
    return null;
  }
}

async function createFirestoreUser(
  db: admin.firestore.Firestore,
  uid: string,
  userData: UserSeedData
): Promise<boolean> {
  try {
    const userRef = db.collection('users').doc(uid);
    const now = admin.firestore.Timestamp.now();

    // Check if user document already exists
    const existingDoc = await userRef.get();
    if (existingDoc.exists) {
      console.log(`  ⚠️  Firestore document for ${userData.email} already exists`);
      return true;
    }

    // Generate a unique referral code
    const referralCode = generateReferralCode(userData.displayName);

    // Base user data
    const firestoreData: Record<string, any> = {
      uid: uid,
      email: userData.email,
      phone: null,
      fullName: userData.displayName,
      avatarUrl: null,
      dateOfBirth: null,

      // Role and permissions
      role: userData.role,
      permissions: ROLE_PERMISSIONS[userData.role],

      // Status flags
      isActive: true,
      isVip: false,
      isVerified: userData.role === 'provider' ? true : false,

      // VIP Status (null for non-VIP)
      vipExpiresAt: null,
      vipPlanId: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,

      // Balances
      pointsBalance: 100,
      walletBalance: 0,

      // Preferences
      preferredLanguage: userData.providerProfile?.languages?.[0] || 'it',
      preferredSection: userData.preferredSection || 'fit',
      notificationsEnabled: true,

      // Push tokens
      fcmTokens: [],

      // Referral
      referralCode: referralCode,
      referredBy: null,
      referralCount: 0,

      // Timestamps
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    // Add provider-specific fields
    if (userData.role === 'provider' && userData.userType) {
      firestoreData.userType = userData.userType;
      
      if (userData.providerProfile) {
        firestoreData.providerProfile = {
          ...userData.providerProfile,
          // Ensure these are set
          isVerified: userData.providerProfile.isVerified ?? true,
          rating: userData.providerProfile.rating ?? 0,
          reviewCount: userData.providerProfile.reviewCount ?? 0,
        };
      }
    }

    await userRef.set(firestoreData);
    console.log(`  ✅ Created Firestore document for ${userData.email}`);
    return true;
  } catch (error: any) {
    console.error(`  ❌ Error creating Firestore document for ${userData.email}:`, error.message);
    return false;
  }
}

function generateReferralCode(name: string): string {
  // Generate a simple referral code based on name + random characters
  const namePart = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${namePart}${randomPart}`;
}

// ============================================
// MAIN SCRIPT
// ============================================

async function seedUsers(): Promise<void> {
  console.log('\n🌱 VFit User Seeding Script\n');
  console.log('=' .repeat(50));

  // Initialize Firebase Admin
  let app: admin.app.App;
  try {
    app = initializeFirebaseAdmin();
    console.log('✅ Firebase Admin initialized successfully\n');
  } catch (error: any) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.error('\nPlease set one of the following:');
    console.error('  - GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to serviceAccountKey.json');
    console.error('  - FIREBASE_SERVICE_ACCOUNT_JSON environment variable with JSON content');
    console.error('  - Place serviceAccountKey.json in the scripts folder or project root');
    console.error('\nOptional (for application default credentials):');
    console.error('  - FIREBASE_PROJECT_ID=your-project-id');
    console.error('\nExample:');
    console.error('  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json');
    console.error('  npm run seed:users\n');
    process.exit(1);
  }

  const auth = admin.auth();
  const db = admin.firestore();

  // Statistics
  let created = 0;
  let existing = 0;
  let failed = 0;

  console.log(`Seeding ${users.length} users...\n`);

  for (const userData of users) {
    console.log(`Processing: ${userData.email} (${userData.role})`);

    // Create Auth user
    const userRecord = await createAuthUser(auth, userData);
    
    if (!userRecord) {
      failed++;
      continue;
    }

    if (userRecord.metadata.creationTime !== userRecord.metadata.lastSignInTime) {
      // User already existed
      existing++;
    } else {
      created++;
    }

    // Create Firestore document
    await createFirestoreUser(db, userRecord.uid, userData);
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Seeding Summary:');
  console.log(`   Total users: ${users.length}`);
  console.log(`   Created:     ${created}`);
  console.log(`   Existing:    ${existing}`);
  console.log(`   Failed:      ${failed}`);
  console.log('\n✅ Seeding complete!\n');

  // Print user credentials
  console.log('🔑 User Credentials:');
  console.log('-'.repeat(50));
  users.forEach((user) => {
    console.log(`   ${user.email} / ${user.password}`);
  });
  console.log('-'.repeat(50));
  console.log();
}

// Run the script
seedUsers().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});

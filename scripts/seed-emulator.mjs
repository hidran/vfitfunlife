// Seed the local Firebase emulator suite with test users + a few searchable
// instructors so auth-gated flows (login, booking, AI assistant) work end-to-end
// against the emulators. Admin SDK auto-connects to the emulators via the
// *_EMULATOR_HOST env vars below — no real credentials needed.
//
//   npm run emulators        # in one terminal (must be running first)
//   npm run seed:emulator    # in another
//   npm run dev:emulator     # then open http://localhost:3000
//
// Test logins (email / password):
//   customer   -> test@vfit.dev      / test1234
//   superadmin -> admin@vfit.dev     / test1234

process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "localhost:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "localhost:9199";

import admin from "firebase-admin";

admin.initializeApp({ projectId: "vfit-funlife", storageBucket: "vfit-funlife.appspot.com" });
const auth = admin.auth();
const db = admin.firestore();
const { serverTimestamp } = admin.firestore.FieldValue;

const CUSTOMER_PERMS = ["bookings:read", "bookings:write", "bookings:cancel", "services:read", "venues:read", "promotions:read"];
const SUPERADMIN_PERMS = [
  "users:read", "users:write", "users:delete", "users:manage_roles",
  "providers:read", "providers:write", "providers:verify",
  "bookings:read", "bookings:write", "bookings:cancel", "bookings:confirm",
  "venues:read", "venues:write", "venues:delete",
  "services:read", "services:write", "services:delete",
  "config:read", "config:write", "reports:read", "content:read", "content:write",
  "promotions:read", "promotions:write", "financial:read", "financial:write",
];

async function ensureUser(uid, email, password, displayName) {
  try {
    await auth.createUser({ uid, email, password, displayName, emailVerified: true });
    console.log(`  auth user created: ${email}`);
  } catch (e) {
    if (e.code === "auth/uid-already-exists" || e.code === "auth/email-already-exists") {
      await auth.updateUser(uid, { password, displayName, emailVerified: true });
      console.log(`  auth user updated: ${email}`);
    } else {
      throw e;
    }
  }
}

async function writeProfile(uid, data) {
  await db.collection("users").doc(uid).set(
    {
      uid,
      isActive: true,
      preferredLanguage: "it",
      preferredSection: "fit",
      notificationsEnabled: true,
      pointsBalance: 0,
      walletBalance: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...data,
    },
    { merge: true },
  );
}

function weeklySchedule() {
  const out = [];
  for (let d = 1; d <= 5; d++) {
    out.push({ dayOfWeek: d, startTime: "09:00", endTime: "12:00", isAvailable: true });
    out.push({ dayOfWeek: d, startTime: "14:00", endTime: "18:00", isAvailable: true });
  }
  return out;
}

const CITIES = [
  { city: "Torino", lat: 45.0703, lng: 7.6869 },
  { city: "Milano", lat: 45.4642, lng: 9.19 },
  { city: "Roma", lat: 41.9028, lng: 12.4964 },
];

async function seedInstructors() {
  const names = ["Marco Rossi", "Lucia Bianchi", "Giulia Verdi", "Andrea Ferrari"];
  for (let i = 0; i < CITIES.length + 1; i++) {
    const c = CITIES[i % CITIES.length];
    const id = `emu-trainer-${i + 1}`;
    await db.collection("instructors").doc(id).set(
      {
        uid: id,
        fullName: names[i % names.length],
        avatarUrl: null,
        userType: "personal_trainer",
        city: c.city,
        lat: c.lat,
        lng: c.lng,
        lowestPrice: 40 + i * 5,
        isActive: true,
        availabilitySchedule: weeklySchedule(),
        providerProfile: {
          isVerified: true,
          isActive: true,
          specialties: ["Personal Training", "HIIT"],
          languages: ["Italiano", "English"],
          rating: 4.5,
          reviewCount: 30 + i,
          yearsOfExperience: 5,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  console.log(`  ${CITIES.length + 1} instructors seeded (Torino/Milano/Roma)`);
}

console.log("Seeding emulator…");
await ensureUser("test-customer", "test@vfit.dev", "test1234", "Test Customer");
await writeProfile("test-customer", { email: "test@vfit.dev", fullName: "Test Customer", role: "customer", permissions: CUSTOMER_PERMS });

await ensureUser("test-admin", "admin@vfit.dev", "test1234", "Test Admin");
await writeProfile("test-admin", { email: "admin@vfit.dev", fullName: "Test Admin", role: "superadmin", permissions: SUPERADMIN_PERMS });

await seedInstructors();

// Enable the AI assistant by default in the emulator for testing.
await db.doc("systemSettings/aiAssistant").set({ enabled: true, provider: "google", model: "gemini-2.5-flash", updatedAt: serverTimestamp() }, { merge: true });

console.log("Done. Logins: test@vfit.dev / admin@vfit.dev (password: test1234)");
process.exit(0);

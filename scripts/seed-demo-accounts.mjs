// Demo accounts: one customer, one fully bookable provider.
//
// The same pair exists in every environment so a flow demoed on staging can be walked
// through identically on the emulator, and the uids are fixed so tests and manual QA can
// address them without a lookup.
//
//   node scripts/seed-demo-accounts.mjs                      # emulator (default)
//   node scripts/seed-demo-accounts.mjs --project vfit-app-staging
//   node scripts/seed-demo-accounts.mjs --project vfit-funlife
//
// Against a real project it uses Application Default Credentials (`gcloud auth
// application-default login`, or the Firebase CLI's). Re-running is safe: every write
// merges, so it repairs a drifted account rather than duplicating one.
//
// Why a script and not the app's own signup: the provider needs `providerProfile.isVerified`
// true, and firestore.rules quite deliberately refuses that write from a browser.

import admin from "firebase-admin";

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const useEmulator = !project;

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "localhost:9099";
} else {
  // Guard against the emulator env leaking in from a shell that ran the emulator seed:
  // it would silently write the "production" demo accounts into a local emulator.
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
}

const projectId = project ?? "vfit-funlife";
admin.initializeApp({ projectId });
const auth = admin.auth();
const db = admin.firestore();
const { serverTimestamp } = admin.firestore.FieldValue;

const PASSWORD = "VfitDemo!2026";

const CUSTOMER = {
  uid: "demo-customer-vfit",
  email: "demo.customer@vitfitdemo.dev",
  fullName: "Demo Customer",
  permissions: [
    "bookings:read", "bookings:write", "bookings:cancel",
    "services:read", "venues:read", "promotions:read",
  ],
};

// A plain `admin`, not a superadmin. The back office runs on this role now — verifying
// providers and changing roles — so there has to be an account that exercises exactly those
// powers and none of the superadmin-only ones.
const ADMIN = {
  uid: "demo-admin-vfit",
  email: "demo.admin@vitfitdemo.dev",
  fullName: "Demo Admin",
  permissions: [
    "users:read", "users:write", "users:manage_roles",
    "providers:read", "providers:write", "providers:verify",
    "bookings:read", "bookings:write", "bookings:cancel", "bookings:confirm",
    "services:read", "services:write",
    "venues:read", "venues:write",
    "promotions:read", "reports:read", "content:read",
  ],
};

const PROVIDER = {
  uid: "demo-provider-vfit",
  email: "demo.provider@vitfitdemo.dev",
  fullName: "Demo Provider",
  permissions: ["bookings:read", "bookings:write", "services:read", "venues:read"],
  categoryId: "personal_training",
  // The leaf plus its parent, the shape onServiceWrite denormalizes onto the instructor.
  categoryIds: ["personal_training", "strength_conditioning"],
  service: {
    id: "demo-service-personal-training",
    name: "Personal Training Demo",
    description: "Sessione 1:1 di prova, creata dallo script di seed.",
    durationMinutes: 60,
    price: 50,
  },
  // Milan, so it lands inside the default search area.
  lat: 45.4642,
  lng: 9.19,
};

/** Mon–Fri 09:00–17:00: the same default an approval seeds. */
const WEEKLY_HOURS = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "17:00",
  isAvailable: true,
}));

/**
 * Create the account, or bring an existing one in line.
 *
 * Returns the uid actually in use, which is not always the requested one: these emails may
 * already exist on staging or production from earlier hand-made demo accounts, and an email
 * cannot be moved to a different uid. Adopting the existing account is the only idempotent
 * option — so callers write their Firestore documents under the uid they get back, not the
 * one they asked for. On a fresh project (the emulator) the two are the same.
 */
async function ensureAuthUser({ uid, email, fullName }) {
  try {
    await auth.createUser({ uid, email, password: PASSWORD, displayName: fullName, emailVerified: true });
    console.log(`  auth created  ${email}  (${uid})`);
    return uid;
  } catch (e) {
    if (e.code !== "auth/uid-already-exists" && e.code !== "auth/email-already-exists") throw e;

    const existing = await auth.getUserByEmail(email).catch(() => null);
    const targetUid = existing?.uid ?? uid;
    await auth.updateUser(targetUid, {
      email,
      password: PASSWORD,
      displayName: fullName,
      emailVerified: true,
    });
    const note = targetUid === uid ? "" : `  [adopted existing uid, wanted ${uid}]`;
    console.log(`  auth updated  ${email}  (${targetUid})${note}`);
    return targetUid;
  }
}

async function writeUser(uid, data) {
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

console.log(`Seeding demo accounts into ${useEmulator ? `the emulator (${projectId})` : projectId}…`);

// --- customer -------------------------------------------------------------------------
const customerUid = await ensureAuthUser(CUSTOMER);
await writeUser(customerUid, {
  email: CUSTOMER.email,
  fullName: CUSTOMER.fullName,
  role: "customer",
  permissions: CUSTOMER.permissions,
});

// --- admin ----------------------------------------------------------------------------
const adminUid = await ensureAuthUser(ADMIN);
await writeUser(adminUid, {
  email: ADMIN.email,
  fullName: ADMIN.fullName,
  role: "admin",
  permissions: ADMIN.permissions,
});

// --- provider -------------------------------------------------------------------------
const providerUid = await ensureAuthUser(PROVIDER);
await writeUser(providerUid, {
  email: PROVIDER.email,
  fullName: PROVIDER.fullName,
  role: "provider",
  providerStatus: "verified",
  isVerified: true,
  permissions: PROVIDER.permissions,
});

// The instructors document is what makes a provider real: the public read rule keys on the
// NESTED providerProfile.isVerified, the dashboard counters read this document, and search
// reads categoryIds and lowestPrice from it.
await db.collection("instructors").doc(providerUid).set(
  {
    uid: providerUid,
    name: PROVIDER.fullName,
    fullName: PROVIDER.fullName,
    isActive: true,
    applicationStatus: "verified",
    providerProfile: {
      isVerified: true,
      bio: "Provider dimostrativo per QA e test end-to-end.",
      rating: 0,
      reviewCount: 0,
    },
    categoryIds: PROVIDER.categoryIds,
    requestedCategoryIds: [PROVIDER.categoryId],
    availabilitySchedule: WEEKLY_HOURS,
    lowestPrice: PROVIDER.service.price,
    hourlyRate: PROVIDER.service.price,
    lat: PROVIDER.lat,
    lng: PROVIDER.lng,
    ratingAvg: 0,
    reviewCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  },
  { merge: true },
);

// One active, priced service — without it the provider shows up but cannot be booked.
await db
  .collection("instructors")
  .doc(providerUid)
  .collection("services")
  .doc(PROVIDER.service.id)
  .set(
    {
      name: PROVIDER.service.name,
      description: PROVIDER.service.description,
      durationMinutes: PROVIDER.service.durationMinutes,
      price: PROVIDER.service.price,
      isActive: true,
      categoryId: PROVIDER.categoryId,
      categoryIds: PROVIDER.categoryIds,
    },
    { merge: true },
  );

console.log(`
Done.
  customer  ${CUSTOMER.email}  /  ${PASSWORD}   (uid ${customerUid})
  admin     ${ADMIN.email}  /  ${PASSWORD}   (uid ${adminUid})
            role 'admin': verifies providers and changes roles, but cannot touch superadmin
  provider  ${PROVIDER.email}  /  ${PASSWORD}   (uid ${providerUid})
            verified, Mon-Fri 09:00-17:00, one active service at EUR ${PROVIDER.service.price}
`);

process.exit(0);

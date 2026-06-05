// One-off admin backfill: ensure every instructor in the searchable catalog
// carries the canonical fields the AI assistant relies on (userType +
// availabilitySchedule). Idempotent. Mirrors the migrateInstructorCatalog
// callable, reusing the same compiled helpers.
//
// Auth: uses Application Default Credentials. Run once interactively first:
//   gcloud auth application-default login
// Then:
//   node functions/scripts/migrate-instructor-catalog.mjs
//
// Safe to re-run: only writes fields that are missing/empty; never overwrites
// valid data and never touches VFun activity docs (activityKind).

import admin from "firebase-admin";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { defaultWeeklySchedule, userTypeForSpecialty } = require("../lib/ai/catalog.js");
const { normalizeAvailability } = require("../lib/ai/search/normalize.js");

admin.initializeApp({ projectId: "vfit-funlife" });
const db = admin.firestore();

const snap = await db.collection("instructors").get();
let scanned = 0;
let updated = 0;
let skippedActivity = 0;

let batch = db.batch();
let pending = 0;

for (const doc of snap.docs) {
  scanned++;
  const data = doc.data();

  // Never promote VFun activity docs (events/parties/VR) into the provider catalog.
  if (data.activityKind) {
    skippedActivity++;
    continue;
  }

  const patch = {};

  // userType: derive from the primary specialty when missing.
  if (!data.userType) {
    const specialties = Array.isArray(data.specialties)
      ? data.specialties
      : Array.isArray(data.providerProfile?.specialties)
        ? data.providerProfile.specialties
        : [];
    if (specialties.length) patch.userType = userTypeForSpecialty(specialties[0]);
  }

  // availabilitySchedule: only write when missing/empty (idempotent).
  const existing = data.availabilitySchedule ?? data.providerProfile?.availabilitySchedule ?? null;
  const hasValidArray = Array.isArray(data.availabilitySchedule) && data.availabilitySchedule.length > 0;
  if (!hasValidArray) {
    const normalized = normalizeAvailability(existing ?? {});
    patch.availabilitySchedule = normalized.length ? normalized : defaultWeeklySchedule();
  }

  if (Object.keys(patch).length === 0) continue;

  batch.set(doc.ref, patch, { merge: true });
  updated++;
  pending++;
  if (pending >= 400) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
  }
}

if (pending > 0) await batch.commit();

console.log(JSON.stringify({ scanned, updated, skippedActivity }, null, 2));
process.exit(0);

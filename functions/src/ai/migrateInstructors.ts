import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { normalizeAvailability } from "./search/normalize";
import { defaultWeeklySchedule } from "./catalog";

const region = process.env.FIREBASE_REGION || "europe-west1";
const MAX_BATCH = 450;

/** Demo cities used to backfill `city` from `serviceAreaCenter`. */
export const DEMO_CITIES: { name: string; lat: number; lng: number }[] = [
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

interface GeoLike {
  latitude: number;
  longitude: number;
}

/**
 * Build a flat-field patch lifting values from a doc's `providerProfile`
 * ONLY when the top-level field is missing/undefined. `rating` maps to
 * `ratingAvg`. Pure (no Firestore).
 */
export function liftProviderProfileFields(
  doc: Record<string, any>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const pp = doc?.providerProfile;
  if (!pp || typeof pp !== "object") return patch;

  if (doc.ratingAvg === undefined && pp.rating !== undefined) patch.ratingAvg = pp.rating;
  if (doc.reviewCount === undefined && pp.reviewCount !== undefined) patch.reviewCount = pp.reviewCount;
  if (doc.hourlyRate === undefined && pp.hourlyRate !== undefined) patch.hourlyRate = pp.hourlyRate;
  if (doc.specialties === undefined && pp.specialties !== undefined) patch.specialties = pp.specialties;
  if (doc.languages === undefined && pp.languages !== undefined) patch.languages = pp.languages;

  return patch;
}

/**
 * Return the name of the geographically closest city (simple squared
 * lat/lng distance — adequate for nearest-of-a-handful). Returns null if
 * `geo` is missing. Pure (no Firestore).
 */
export function nearestCity(
  geo: GeoLike | null | undefined,
  cities: { name: string; lat: number; lng: number }[],
): string | null {
  if (!geo || typeof geo.latitude !== "number" || typeof geo.longitude !== "number") {
    return null;
  }
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of cities) {
    const dLat = c.lat - geo.latitude;
    const dLng = c.lng - geo.longitude;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = c.name;
    }
  }
  return best;
}

/**
 * Superadmin-only: backfill every `instructors` doc to the canonical flat
 * searchable-catalog shape. Idempotent — only fills missing fields.
 */
export const migrateInstructorCatalog = onCall({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  try {
    await requireSuperAdmin(callerUid);
  } catch {
    throw new HttpsError("permission-denied", "Superadmin required");
  }

  const db = getFirestore();
  const snap = await db.collection("instructors").get();

  let scanned = 0;
  let updated = 0;
  let skippedCity = 0;
  let skippedActivity = 0;

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const docSnap of snap.docs) {
    scanned++;
    const data = docSnap.data() as Record<string, any>;

    // VFun activity docs (events, parties, VR) live in `instructors` with an
    // `activityKind` field. They are NOT searchable providers — never promote
    // them into the catalog or lift their flags.
    if (data.activityKind) {
      skippedActivity++;
      continue;
    }

    const patch: Record<string, unknown> = { ...liftProviderProfileFields(data) };

    // city
    if (typeof data.city !== "string" || !data.city) {
      const derived = nearestCity(data.serviceAreaCenter as GeoLike | null, DEMO_CITIES);
      if (derived) {
        patch.city = derived;
      } else {
        skippedCity++;
      }
    }

    // availabilitySchedule (canonical array). Fall back to a default week.
    const normalized = normalizeAvailability(
      data.availabilitySchedule ?? data.providerProfile?.availabilitySchedule ?? {},
    );
    patch.availabilitySchedule = normalized.length ? normalized : defaultWeeklySchedule();

    // isActive / isVerified booleans
    if (typeof data.isActive !== "boolean") {
      patch.isActive = true;
    }
    if (typeof data.isVerified !== "boolean") {
      patch.isVerified =
        typeof data.providerProfile?.isVerified === "boolean"
          ? data.providerProfile.isVerified
          : false;
    }

    if (Object.keys(patch).length > 0) {
      batch.set(docSnap.ref, patch, { merge: true });
      ops++;
      updated++;
      if (ops >= MAX_BATCH) await flush();
    }
  }
  await flush();

  await writeAuditLog({
    actorUid: callerUid,
    actorEmail: req.auth?.token?.email ?? "",
    actorRole: "superadmin",
    action: "update",
    entityType: "migration",
    entityId: "instructors",
    after: { scanned, updated, skippedCity, skippedActivity },
    reason: "Normalize instructors collection to canonical provider-catalog shape",
  });

  return { scanned, updated, skippedCity, skippedActivity };
});

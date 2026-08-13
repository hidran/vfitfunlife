import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";

const region = process.env.FIREBASE_REGION || "europe-west1";
const MAX_BATCH = 450;

/**
 * Superadmin-only: repair providers verified before the two-document flow existed.
 *
 * src/lib/firebase/providerApplication.ts writes users/{uid}.providerStatus and
 * instructors/{uid} together in one batch. Providers onboarded before that only ever got
 * users/{uid}.role = 'provider' and providerProfile.isVerified = true. The consequences
 * are total, not cosmetic:
 *
 *   - canAccessProviderArea(undefined) is false, so /provider/* bounces them to /profile.
 *   - BecomeProviderCard resolves to the 'cta' variant and is then suppressed by the
 *     role guard, so /profile offers no way in either.
 *   - firestore.rules gates service writes on get(instructors/{uid}).data.uid — with no
 *     instructor document that get() fails and the write is denied.
 *
 * So a verified trainer could neither reach the services page nor save to it. This
 * backfill is what makes the rest of the services feature reachable for them.
 *
 * Idempotent: only fills what is missing, never downgrades a status or re-verifies a
 * rejected applicant.
 *
 * Spec: docs/superpowers/specs/2026-08-10-trainer-services-design.md §7
 */
export const backfillProviderStatus = onCall({ region }, async (req) => {
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
  const snap = await db.collection("users").where("role", "==", "provider").get();

  let scanned = 0;
  let statusSet = 0;
  let instructorCreated = 0;
  let skippedDeleted = 0;
  let skippedUnverified = 0;

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const userSnap of snap.docs) {
    scanned++;
    const data = userSnap.data() as Record<string, unknown>;
    const uid = userSnap.id;

    if (data.isDeleted === true) {
      skippedDeleted++;
      continue;
    }

    const profile = (data.providerProfile ?? {}) as Record<string, unknown>;
    const isVerified = profile.isVerified === true;

    // Only a verified provider is safe to promote. Anyone else keeps whatever status
    // they have: guessing 'verified' here would hand the provider area to a rejected
    // or half-finished applicant.
    if (!isVerified) {
      skippedUnverified++;
      continue;
    }

    if (typeof data.providerStatus !== "string") {
      batch.set(
        userSnap.ref,
        { providerStatus: "verified", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      ops++;
      statusSet++;
    }

    const instructorRef = db.collection("instructors").doc(uid);
    const instructorSnap = await instructorRef.get();
    if (!instructorSnap.exists) {
      const fullName = (data.fullName as string) ?? "Provider";
      batch.set(
        instructorRef,
        {
          uid, // the field firestore.rules compares against request.auth.uid
          name: fullName,
          fullName,
          avatarUrl: (data.avatarUrl as string) ?? null,
          isActive: true,
          applicationStatus: "verified",
          specialties: (profile.specialties as string[]) ?? [],
          languages: (profile.languages as string[]) ?? [],
          ratingAvg: (profile.rating as number) ?? 0,
          reviewCount: (profile.reviewCount as number) ?? 0,
          providerProfile: {
            isVerified: true,
            bio: (profile.professionalBio as string) ?? "",
            specialties: (profile.specialties as string[]) ?? [],
            rating: (profile.rating as number) ?? 0,
            reviewCount: (profile.reviewCount as number) ?? 0,
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      ops++;
      instructorCreated++;
    }

    if (ops >= MAX_BATCH) await flush();
  }
  await flush();

  const report = {
    scanned,
    statusSet,
    instructorCreated,
    skippedDeleted,
    skippedUnverified,
  };

  await writeAuditLog({
    actorUid: callerUid,
    actorEmail: req.auth?.token?.email ?? "",
    actorRole: "superadmin",
    action: "update",
    entityType: "migration",
    entityId: "provider_status_backfill",
    after: report,
    reason: "Backfill providerStatus and instructors doc for pre-flow verified providers",
  });

  return report;
});

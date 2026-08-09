/**
 * One-shot superadmin cleanup for P2-6: removes every `clients/{id}/dietPlans` and
 * `clients/{id}/recipes` document.
 *
 * As of 2026-08-09 the production database contains none of either — all four clients/*
 * documents have zero subcollections. This exists so that anything created between now and
 * deploy is caught, and so that deletion is evidenced if it is ever questioned.
 *
 * Exports before deleting, and aborts if the export fails. Dry run by default.
 */
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";

const region = process.env.FIREBASE_REGION || "europe-west1";
const GROUPS = ["dietPlans", "recipes"] as const;
const DELETE_BATCH_SIZE = 400;

/**
 * THE ONE TRAP IN THIS FUNCTION — do not inline, weaken or remove.
 *
 * `db.collectionGroup("recipes")` matches EVERY collection named `recipes` at any depth,
 * including the TOP-LEVEL `recipes` collection that P2-6 itself introduced and that
 * `generateRecipes` writes to. Sweeping those would delete exactly the data this feature
 * exists to produce.
 *
 * Legacy nutrition data only ever lived under a client: `clients/{id}/dietPlans/{id}` and
 * `clients/{id}/recipes/{id}`. A top-level recipe lives at `recipes/{id}`, which does not
 * start with `clients/`, so it is never a purge candidate.
 *
 * Covered by `purgeLegacyNutrition.test.ts`.
 * @param {string} path - A Firestore document path, e.g. `clients/abc/recipes/xyz`.
 * @return {boolean} True only for per-client legacy nutrition documents.
 */
export function isLegacyNutritionPath(path: string): boolean {
  return path.startsWith("clients/");
}

interface PurgeReq { dryRun?: boolean }

export const purgeLegacyNutritionData = onCall<PurgeReq>({ region }, async (
  request: CallableRequest<PurgeReq>,
) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
  try {
    await requireSuperAdmin(request.auth.uid);
  } catch {
    throw new HttpsError("permission-denied", "Superadmin only");
  }

  const db = admin.firestore();
  // Dry run unless the caller explicitly opts out. An absent field, an empty payload or a
  // missing `data` object must never delete anything.
  const dryRun = request.data?.dryRun !== false;

  const found: { path: string; data: FirebaseFirestore.DocumentData }[] = [];
  let skippedOutsideClients = 0;
  for (const group of GROUPS) {
    const snap = await db.collectionGroup(group).get();
    for (const doc of snap.docs) {
      if (!isLegacyNutritionPath(doc.ref.path)) {
        skippedOutsideClients++;
        continue;
      }
      found.push({ path: doc.ref.path, data: doc.data() });
    }
  }

  if (skippedOutsideClients) {
    // Almost always the top-level `recipes` collection this feature owns. Logged so that a
    // reader of the run's output can see the guard did its job.
    logger.info("[purge] ignored collection-group matches outside clients/", {
      skippedOutsideClients,
    });
  }

  const counts = {
    dietPlans: found.filter((f) => f.path.includes("/dietPlans/")).length,
    recipes: found.filter((f) => f.path.includes("/recipes/")).length,
  };

  if (dryRun) {
    // Returns without writing anything at all: no export, no deletes, no audit entry.
    return { dryRun: true, counts, samplePaths: found.slice(0, 20).map((f) => f.path) };
  }

  let exportPath: string | null = null;
  if (found.length) {
    // Colons are legal in GCS object names but need quoting in a shell and escaping in a
    // URL. This export is the evidence that a deletion happened, so someone may well be
    // fetching it by hand under time pressure; keep the name paste-able.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportPath = `legal-purge/nutrition-${stamp}.json`;
    try {
      const file = admin.storage().bucket().file(exportPath);
      // `resumable: false` — a single-request upload for a small payload; a resumable
      // session would only add failure modes on a path where failure means data loss.
      await file.save(JSON.stringify(found, null, 2), {
        contentType: "application/json",
        resumable: false,
      });
      // Read the object back before deleting anything. `save()` resolving is good evidence
      // the export landed; an existence check is proof.
      const [exists] = await file.exists();
      if (!exists) throw new Error(`export object missing after save: ${exportPath}`);
    } catch (err) {
      logger.error("[purge] export failed, aborting before any delete", err);
      throw new HttpsError("internal", "export-failed");
    }

    for (let i = 0; i < found.length; i += DELETE_BATCH_SIZE) {
      const batch = db.batch();
      for (const item of found.slice(i, i + DELETE_BATCH_SIZE)) batch.delete(db.doc(item.path));
      await batch.commit();
    }
  }

  await writeAuditLog({
    actorUid: request.auth.uid,
    actorEmail: request.auth.token?.email ?? "",
    actorRole: "superadmin",
    action: "delete",
    entityType: "migration",
    entityId: "purgeLegacyNutritionData",
    after: { counts, exportPath },
  });

  return { dryRun: false, counts, exportPath };
});

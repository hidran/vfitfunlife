import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { SERVICE_CATEGORY_TREE } from "./tree";

const region = process.env.FIREBASE_REGION || "europe-west1";

/**
 * Superadmin-only: seed or refresh the service taxonomy.
 *
 * Idempotent and non-destructive. `isActive` and `order` are only written when the
 * document is created — an admin who has deactivated or reordered a category must not have
 * that undone by a re-seed. Structure and labels are refreshed every run, so a corrected
 * translation propagates.
 *
 * Existing ids (personal_training, yoga, pilates, massage, nutrition, physio) are reused
 * deliberately, so the six live documents gain a parent and localized labels rather than
 * being replaced by duplicates.
 *
 * Spec: docs/superpowers/specs/2026-08-13-service-taxonomy-design.md §8
 */
export const seedServiceCategories = onCall({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
  try {
    await requireSuperAdmin(callerUid);
  } catch {
    throw new HttpsError("permission-denied", "Superadmin required");
  }

  const db = getFirestore();
  const col = db.collection("serviceCategories");
  const existing = await col.get();
  const existingIds = new Set(existing.docs.map((d) => d.id));

  let created = 0;
  let updated = 0;
  const batch = db.batch();

  for (const [id, doc] of Object.entries(SERVICE_CATEGORY_TREE)) {
    const isNew = !existingIds.has(id);
    const payload: Record<string, unknown> = {
      parentId: doc.parentId,
      names: doc.names,
      icon: doc.icon,
      sections: doc.sections,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (isNew) {
      payload.order = doc.order;
      payload.isActive = doc.isActive;
      payload.createdAt = FieldValue.serverTimestamp();
      created++;
    } else {
      updated++;
    }
    batch.set(col.doc(id), payload, { merge: true });
  }

  await batch.commit();

  // Anything in the collection that the tree does not define — reported, never deleted.
  // A category an admin added by hand is not a mistake to clean up.
  const unknown = existing.docs
    .map((d) => d.id)
    .filter((id) => !(id in SERVICE_CATEGORY_TREE));

  const report = { created, updated, unknown };

  await writeAuditLog({
    actorUid: callerUid,
    actorEmail: req.auth?.token?.email ?? "",
    actorRole: "superadmin",
    action: "update",
    entityType: "migration",
    entityId: "service_categories_seed",
    after: report,
    reason: "Seed the two-level service taxonomy",
  });

  return report;
});

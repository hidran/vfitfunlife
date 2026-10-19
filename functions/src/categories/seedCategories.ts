import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getUserRoleInfo } from "../utils/roles";
import { toActorRole, writeAuditLog } from "../lib/audit";
import { SERVICE_CATEGORY_TREE } from "./tree";
import { planCategorySeed } from "./seedCategoriesCore";

import { region } from "../lib/runtimeOptions";

/**
 * Admin or superadmin: add missing bundled taxonomy categories to the Firestore catalog.
 *
 * Idempotent and non-destructive: missing docs/fields are filled, but existing admin-managed
 * labels, hierarchy, order, icon, section assignment, and activation status are preserved.
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
  const caller = await getUserRoleInfo(callerUid);
  if (
    !caller ||
    !caller.isActive ||
    (caller.role !== "admin" && caller.role !== "superadmin")
  ) {
    throw new HttpsError("permission-denied", "Active admin required");
  }

  const db = getFirestore();
  const col = db.collection("serviceCategories");
  const existing = await col.get();
  const existingDocs = new Map(existing.docs.map((document) => [document.id, document]));

  let created = 0;
  let updated = 0;
  let batch = db.batch();
  let operations = 0;

  for (const [id, category] of Object.entries(SERVICE_CATEGORY_TREE)) {
    const current = existingDocs.get(id);
    const plan = planCategorySeed(current?.data() as Partial<typeof category> | undefined, category);
    if (plan.created) created++;
    if (Object.keys(plan.patch).length === 0) continue;
    if (!plan.created) updated++;

    batch.set(
      col.doc(id),
      {
        ...plan.patch,
        ...(plan.created ? { createdAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    operations++;
    // Firestore batches have a hard 500-write limit.
    if (operations === 450) {
      await batch.commit();
      batch = db.batch();
      operations = 0;
    }
  }

  if (operations > 0) await batch.commit();

  // Anything in the collection that the tree does not define — reported, never deleted.
  // A category an admin added by hand is not a mistake to clean up.
  const unknown = existing.docs
    .map((d) => d.id)
    .filter((id) => !(id in SERVICE_CATEGORY_TREE));

  const report = { created, updated, unknown };

  const userEmail = (await db.collection("users").doc(callerUid).get()).data()?.email;
  const tokenEmail = req.auth?.token.email;
  const actorEmail = [userEmail, tokenEmail].find(
    (email): email is string => typeof email === "string",
  ) ?? "";

  await writeAuditLog({
    actorUid: callerUid,
    actorEmail,
    actorRole: toActorRole(caller.role),
    action: "update",
    entityType: "migration",
    entityId: "service_categories_seed",
    after: report,
    reason: "Seed the two-level service taxonomy",
  });

  return report;
});

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { withAncestors } from "./tree";

const region = process.env.FIREBASE_REGION || "europe-west1";
const MAX_BATCH = 400;

interface MergeData {
  sourceId: string;
  targetId: string;
  apply?: boolean;
}

/**
 * Superadmin-only: move everything from one category to another, then hide the source.
 *
 * A taxonomy without merge rots. Admins create near-duplicates ("Boxe" / "Boxing" /
 * "Pugilato"), and with only create/edit/deactivate available there is no way to
 * consolidate them without orphaning the providers attached to the loser.
 *
 * The source is deactivated, never deleted: deleting it would break any stored reference
 * we failed to find, and an inactive category is invisible to clients anyway.
 *
 * Dry-run by default — this rewrites provider-facing data.
 */
export const mergeServiceCategories = onCall<MergeData>(
  { region, timeoutSeconds: 540 },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
    try {
      await requireSuperAdmin(callerUid);
    } catch {
      throw new HttpsError("permission-denied", "Superadmin required");
    }

    const { sourceId, targetId } = req.data ?? {};
    const apply = req.data?.apply === true;

    if (!sourceId || !targetId) {
      throw new HttpsError("invalid-argument", "sourceId and targetId are required");
    }
    if (sourceId === targetId) {
      throw new HttpsError("invalid-argument", "Cannot merge a category into itself");
    }

    const db = getFirestore();
    const [sourceSnap, targetSnap] = await Promise.all([
      db.collection("serviceCategories").doc(sourceId).get(),
      db.collection("serviceCategories").doc(targetId).get(),
    ]);
    if (!sourceSnap.exists) throw new HttpsError("not-found", `No such category: ${sourceId}`);
    if (!targetSnap.exists) throw new HttpsError("not-found", `No such category: ${targetId}`);

    // Merging a group would strand its children under a category that no longer accepts
    // them. Reparent the children first, then merge the leaves.
    const children = await db
      .collection("serviceCategories")
      .where("parentId", "==", sourceId)
      .get();
    if (!children.empty) {
      throw new HttpsError(
        "failed-precondition",
        `${sourceId} still has ${children.size} child ` +
          `categor${children.size === 1 ? "y" : "ies"}. Reparent them first.`,
      );
    }

    const targetAncestry = withAncestors(targetId);
    let servicesUpdated = 0;
    let providersUpdated = 0;

    let batch = db.batch();
    let ops = 0;
    const flush = async () => {
      if (apply && ops > 0) await batch.commit();
      batch = db.batch();
      ops = 0;
    };

    // Services carry the assignment; providers carry only derived ancestry, so services
    // are the source of truth and are rewritten first.
    const services = await db
      .collectionGroup("services")
      .where("categoryId", "==", sourceId)
      .get();

    const touchedProviders = new Set<string>();
    for (const svc of services.docs) {
      batch.set(svc.ref, { categoryId: targetId, categoryIds: targetAncestry }, { merge: true });
      ops++;
      servicesUpdated++;
      const providerRef = svc.ref.parent.parent;
      if (providerRef) touchedProviders.add(providerRef.id);
      if (ops >= MAX_BATCH) await flush();
    }

    // Providers that reference the source but own no service under it — backfilled from a
    // specialty string rather than from a service.
    const providers = await db
      .collection("instructors")
      .where("categoryIds", "array-contains", sourceId)
      .get();
    for (const p of providers.docs) touchedProviders.add(p.id);

    for (const providerId of touchedProviders) {
      const ref = db.collection("instructors").doc(providerId);
      batch.set(
        ref,
        {
          categoryIds: FieldValue.arrayRemove(sourceId),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      ops++;
      // Two writes rather than one: arrayRemove and arrayUnion on the same field in a
      // single set() would conflict.
      batch.set(ref, { categoryIds: FieldValue.arrayUnion(...targetAncestry) }, { merge: true });
      ops++;
      providersUpdated++;
      if (ops >= MAX_BATCH) await flush();
    }

    if (apply) {
      batch.set(
        db.collection("serviceCategories").doc(sourceId),
        { isActive: false, mergedInto: targetId, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      ops++;
    }
    await flush();

    const report = { apply, sourceId, targetId, servicesUpdated, providersUpdated };

    if (apply) {
      await writeAuditLog({
        actorUid: callerUid,
        actorEmail: req.auth?.token?.email ?? "",
        actorRole: "superadmin",
        action: "update",
        entityType: "service_category",
        entityId: sourceId,
        after: report,
        reason: `Merge ${sourceId} into ${targetId}`,
      });
    }

    return report;
  },
);

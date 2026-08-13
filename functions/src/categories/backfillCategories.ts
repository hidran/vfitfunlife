import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { buildLabelIndex, foldLabel, withAncestors } from "./tree";

const region = process.env.FIREBASE_REGION || "europe-west1";
const MAX_BATCH = 400;

interface Unmapped {
  providerId: string;
  providerName: string;
  serviceId?: string;
  serviceName?: string;
  specialties: string[];
}

/**
 * Superadmin-only: map existing providers and services onto the service taxonomy.
 *
 * DRY RUN BY DEFAULT. This is the step where a mapping mistake becomes visible to clients
 * — a mis-mapped provider disappears from a filter they used to appear in — so it produces
 * a report first and only writes when explicitly told to.
 *
 * Resolution order per service:
 *   1. The provider's specialty strings, matched (case/accent-folded) against category
 *      labels in any locale. Every value observed in production resolves this way, which
 *      is why the taxonomy promoted all of them rather than collapsing them.
 *   2. Keyword match against the service's own name — a service called "Boxe tecnica
 *      1-to-1" under a provider with no usable specialty still lands in `boxing`.
 *   3. Otherwise null, and listed in `unmapped`. Never guessed.
 *
 * Spec: docs/superpowers/specs/2026-08-13-service-taxonomy-design.md §9
 */
export const backfillServiceCategories = onCall<{ apply?: boolean }>(
  { region, timeoutSeconds: 540 },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
    try {
      await requireSuperAdmin(callerUid);
    } catch {
      throw new HttpsError("permission-denied", "Superadmin required");
    }

    const apply = req.data?.apply === true;
    const db = getFirestore();
    const labelIndex = buildLabelIndex();

    /** Longest label first, so "yoga therapy" is tried before "yoga". */
    const keywordPairs = [...labelIndex.entries()].sort(
      (a, b) => b[0].length - a[0].length,
    );

    const resolveFromSpecialties = (specialties: string[]): string | null => {
      for (const s of specialties) {
        const hit = labelIndex.get(foldLabel(s));
        if (hit) return hit;
      }
      return null;
    };

    const resolveFromName = (name: string): string | null => {
      const folded = foldLabel(name);
      for (const [label, id] of keywordPairs) {
        // Skip 1-2 char labels; they match inside unrelated words.
        if (label.length >= 3 && folded.includes(label)) return id;
      }
      return null;
    };

    const snap = await db.collection("instructors").get();

    let providersScanned = 0;
    let providersMapped = 0;
    let skippedActivities = 0;
    let skippedEmpty = 0;
    let servicesScanned = 0;
    let servicesMapped = 0;
    const unmapped: Unmapped[] = [];
    const distribution: Record<string, number> = {};

    let batch = db.batch();
    let ops = 0;
    const flush = async () => {
      if (apply && ops > 0) await batch.commit();
      batch = db.batch();
      ops = 0;
    };

    for (const providerDoc of snap.docs) {
      providersScanned++;
      const data = providerDoc.data() as Record<string, unknown>;
      const profile = (data.providerProfile ?? {}) as Record<string, unknown>;
      const name = (data.fullName as string) ?? (data.name as string) ?? providerDoc.id;

      // VFun activity docs (events, parties, VR) live in `instructors` with an
      // `activityKind` field. They are not searchable providers — fetchProviders filters
      // them out and migrateInstructorCatalog skips them — so they are out of scope, not
      // unmapped. Counting them as failures would bury the entries that need a decision.
      if (data.activityKind) {
        skippedActivities++;
        continue;
      }

      const specialties = [
        ...((data.specialties as string[]) ?? []),
        ...((profile.specialties as string[]) ?? []),
      ].filter((s): s is string => typeof s === "string");

      const fromSpecialties = resolveFromSpecialties(specialties);
      const servicesSnap = await providerDoc.ref.collection("services").get();
      const providerCategoryIds = new Set<string>();

      for (const svc of servicesSnap.docs) {
        servicesScanned++;
        const svcData = svc.data() as { name?: string; isActive?: unknown; categoryId?: string };
        if (typeof svcData.categoryId === "string" && svcData.categoryId) {
          // Already mapped — a re-run must not reassign a human's correction.
          if (svcData.isActive !== false) {
            withAncestors(svcData.categoryId).forEach((c) => providerCategoryIds.add(c));
          }
          continue;
        }

        const categoryId =
          fromSpecialties ?? resolveFromName(svcData.name ?? "");

        if (!categoryId) {
          unmapped.push({
            providerId: providerDoc.id,
            providerName: name,
            serviceId: svc.id,
            serviceName: svcData.name ?? "(unnamed)",
            specialties,
          });
          continue;
        }

        const ancestry = withAncestors(categoryId);
        distribution[categoryId] = (distribution[categoryId] ?? 0) + 1;
        servicesMapped++;
        if (svcData.isActive !== false) {
          ancestry.forEach((c) => providerCategoryIds.add(c));
        }

        batch.set(svc.ref, { categoryId, categoryIds: ancestry }, { merge: true });
        ops++;
        if (ops >= MAX_BATCH) await flush();
      }

      // A provider with no services at all still gets categories from their specialties,
      // so they remain findable until they add one.
      if (providerCategoryIds.size === 0 && fromSpecialties) {
        withAncestors(fromSpecialties).forEach((c) => providerCategoryIds.add(c));
      }

      if (providerCategoryIds.size > 0) {
        providersMapped++;
        batch.set(
          providerDoc.ref,
          { categoryIds: [...providerCategoryIds], updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        ops++;
        if (ops >= MAX_BATCH) await flush();
      } else if (specialties.length > 0) {
        unmapped.push({
          providerId: providerDoc.id,
          providerName: name,
          specialties,
        });
      } else {
        // No services and no specialties: nothing to map FROM. Counted, not listed —
        // there is no decision for a human to make about an empty provider.
        skippedEmpty++;
      }
    }
    await flush();

    const report = {
      apply,
      providersScanned,
      providersMapped,
      servicesScanned,
      servicesMapped,
      skippedActivities,
      skippedEmpty,
      unmappedCount: unmapped.length,
      // Capped: this is a callable response, and an unbounded list of every service in a
      // large catalogue would blow the payload limit. The count above is exact.
      unmapped: unmapped.slice(0, 100),
      distribution,
    };

    if (apply) {
      await writeAuditLog({
        actorUid: callerUid,
        actorEmail: req.auth?.token?.email ?? "",
        actorRole: "superadmin",
        action: "update",
        entityType: "migration",
        entityId: "service_categories_backfill",
        after: { ...report, unmapped: `${unmapped.length} entries` },
        reason: "Map providers and services onto the service taxonomy",
      });
    }

    return report;
  },
);

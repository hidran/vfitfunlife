import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireSuperAdmin, getDefaultPermissionsForRole } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import {
  draftServicesForCategories,
  providerRolePatch,
  resolveLegacySpecialties,
} from "./applicationDecision";

const region = process.env.FIREBASE_REGION || "europe-west1";

interface ProviderReport {
  uid: string;
  providerStatus: string;
  requestedCategoryIds: string[];
  unmapped: string[];
  rolePromoted: boolean;
  draftServicesSeeded: number;
  skipped?: string;
}

/**
 * Superadmin-only, dry-run by default: bring self-registered applicants onto the shape
 * decideProviderApplication now produces.
 *
 * Before it, signup stored the chosen categories as display names in
 * providerProfile.specialties (in whatever locale the form was in), and the admin panel's
 * approval only flipped providerStatus. So an approved applicant kept role 'customer', lost
 * the professional tab, and had no services — hence no categoryIds, so no category at all.
 *
 * Scope is exactly those users: providerStatus pending|verified with role still 'customer'.
 * Admin-created providers already have role 'provider' and are left alone.
 *
 *   - Every one gets requestedCategoryIds resolved from the legacy names, unless already set.
 *   - Verified ones are promoted to role 'provider' (customer permissions kept) and, if they
 *     have no services yet, get one inactive unpriced draft per resolved category.
 *
 * Idempotent: a second run finds nothing left to change.
 */
export const backfillSelfRegisteredProviders = onCall<{ dryRun?: boolean }>({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  try {
    await requireSuperAdmin(callerUid);
  } catch {
    throw new HttpsError("permission-denied", "Superadmin required");
  }

  const dryRun = req.data?.dryRun !== false;
  const db = getFirestore();
  const providerDefaults = getDefaultPermissionsForRole("provider");
  const snap = await db.collection("users").where("providerStatus", "in", ["pending", "verified"]).get();

  const reports: ProviderReport[] = [];
  for (const userSnap of snap.docs) {
    const user = userSnap.data();
    const uid = userSnap.id;
    const status = user.providerStatus as string;
    if (user.role && user.role !== "customer") continue;

    const report: ProviderReport = {
      uid,
      providerStatus: status,
      requestedCategoryIds: [],
      unmapped: [],
      rolePromoted: false,
      draftServicesSeeded: 0,
    };
    reports.push(report);

    if (user.isDeleted === true) {
      report.skipped = "deleted";
      continue;
    }
    const instructorRef = db.collection("instructors").doc(uid);
    const instructorSnap = await instructorRef.get();
    if (!instructorSnap.exists) {
      report.skipped = "no instructors document";
      continue;
    }
    const instructor = instructorSnap.data() ?? {};

    const existing = (instructor.requestedCategoryIds as string[] | undefined) ?? [];
    const legacyNames = [
      ...((instructor.providerProfile?.specialties as string[] | undefined) ?? []),
      ...((instructor.specialties as string[] | undefined) ?? []),
      ...((user.providerProfile?.specialties as string[] | undefined) ?? []),
    ];
    const resolved = resolveLegacySpecialties([...new Set(legacyNames)]);
    report.unmapped = resolved.unmapped;
    report.requestedCategoryIds = existing.length > 0 ? existing : resolved.leafIds;

    const batch = db.batch();
    let writes = 0;

    if (existing.length === 0 && report.requestedCategoryIds.length > 0) {
      batch.update(instructorRef, {
        requestedCategoryIds: report.requestedCategoryIds,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writes++;
    }

    if (status === "verified") {
      const rolePatch = providerRolePatch(user.role, user.permissions, providerDefaults);
      if (rolePatch) {
        batch.update(userSnap.ref, { ...rolePatch, updatedAt: FieldValue.serverTimestamp() });
        report.rolePromoted = true;
        writes++;
      }
      const services = await instructorRef.collection("services").limit(1).get();
      if (services.empty) {
        const drafts = draftServicesForCategories(
          report.requestedCategoryIds,
          (user.preferredLanguage as string) ?? "it",
        );
        for (const draft of drafts) {
          batch.set(instructorRef.collection("services").doc(draft.id), draft.data);
        }
        report.draftServicesSeeded = drafts.length;
        writes += drafts.length;
      }
    }

    if (!dryRun && writes > 0) await batch.commit();
  }

  const summary = {
    dryRun,
    candidates: reports.length,
    rolesPromoted: reports.filter((r) => r.rolePromoted).length,
    draftServicesSeeded: reports.reduce((n, r) => n + r.draftServicesSeeded, 0),
    skipped: reports.filter((r) => r.skipped).length,
  };

  if (!dryRun) {
    await writeAuditLog({
      actorUid: callerUid,
      actorEmail: req.auth?.token?.email ?? "",
      actorRole: "superadmin",
      action: "update",
      entityType: "migration",
      entityId: "self_registered_providers_backfill",
      after: summary,
      reason: "Promote approved self-registered providers and resolve requested categories to ids",
    });
  }

  return { ...summary, reports };
});

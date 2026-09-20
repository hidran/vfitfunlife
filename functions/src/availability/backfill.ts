import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { normalizeAvailability } from "../ai/search/normalize";
import { planAvailabilityBackfill } from "./backfillPlan";
import { DEFAULT_WEEKLY_HOURS } from "./slots";

const region = process.env.FIREBASE_REGION || "europe-west1";

interface UserReport {
  uid: string;
  action: "copy" | "clear" | "skip";
  reason?: string;
  windows?: number;
}

/**
 * Superadmin-only, dry-run by default: move the weekly hours the old profile editor wrote
 * (users/{uid}.providerProfile.availabilitySchedule, a weekday map nothing booked against)
 * onto instructors/{uid}.availabilitySchedule, the one schedule booking reads, then remove
 * the users-side field. Providers without it keep what they have: seeded catalogue
 * providers stay bookable on their default hours, recent sign-ups stay unbookable until
 * they set hours.
 *
 * Product-change addendum (2026-09-19): every real provider now gets default hours, not
 * "no hours until you set them". So after the step above, every instructors/{uid} of a real
 * provider (users doc with providerStatus verified or pending, not soft-deleted) that still
 * has no bookable schedule gets DEFAULT_WEEKLY_HOURS (Mon-Fri 09:00-17:00). This deliberately
 * does not stamp availabilityUpdatedAt, so the provider dashboard still nudges them to review
 * it (see dashboardBannerKind in src/lib/availability/adapter.ts on the client). New
 * approvals no longer need this: decideProviderApplication and backfillSelfRegisteredProviders
 * write the same default at approval time — this only catches providers approved earlier.
 *
 * Idempotent: a second run finds no users-side field left and no provider still without hours.
 */
export const backfillAvailability = onCall<{ dryRun?: boolean }>({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
  try {
    await requireSuperAdmin(callerUid);
  } catch {
    throw new HttpsError("permission-denied", "Superadmin required");
  }

  const dryRun = req.data?.dryRun !== false;
  const db = getFirestore();
  // Admin-created providers carry role 'provider'; self-registered ones may still be
  // 'customer' with a providerStatus. Either can have the old field.
  const [byRole, byStatus] = await Promise.all([
    db.collection("users").where("role", "==", "provider").get(),
    db.collection("users").where("providerStatus", "in", ["pending", "verified"]).get(),
  ]);
  const users = new Map<string, DocumentSnapshot>();
  for (const snap of [...byRole.docs, ...byStatus.docs]) users.set(snap.id, snap);

  const reports: UserReport[] = [];
  const defaultedProviders: string[] = [];
  for (const [uid, userSnap] of users) {
    const user = userSnap.data() ?? {};
    const instructorRef = db.collection("instructors").doc(uid);
    const instructorSnap = await instructorRef.get();
    const instructor = instructorSnap.data();
    const plan = planAvailabilityBackfill(user, instructor);

    if (plan.kind === "skip") {
      if (plan.reason !== "not_a_candidate") reports.push({ uid, action: "skip", reason: plan.reason });
    } else {
      const report: UserReport = plan.kind === "copy" ?
        { uid, action: "copy", windows: plan.schedule.length } :
        { uid, action: "clear", reason: plan.reason };
      reports.push(report);

      if (!dryRun) {
        const batch = db.batch();
        if (plan.kind === "copy") {
          batch.update(instructorRef, {
            availabilitySchedule: plan.schedule,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        batch.update(userSnap.ref, {
          "providerProfile.availabilitySchedule": FieldValue.delete(),
          "updatedAt": FieldValue.serverTimestamp(),
        });
        await batch.commit();
      }
    }

    // Addendum: a real provider (pending or verified, not deleted) still without any
    // bookable hours after the step above gets the default. A provider with no instructor
    // doc has no profile to write hours onto and is left alone (matches updateMyAvailability
    // and decideProviderApplication's "never create a bare catalogue entry").
    const isRealProvider = instructorSnap.exists && user.isDeleted !== true &&
      (user.providerStatus === "verified" || user.providerStatus === "pending");
    if (isRealProvider) {
      const effectiveSchedule = plan.kind === "copy" ?
        plan.schedule :
        normalizeAvailability(instructor?.availabilitySchedule);
      if (effectiveSchedule.length === 0) {
        defaultedProviders.push(uid);
        if (!dryRun) {
          await instructorRef.set(
            { availabilitySchedule: DEFAULT_WEEKLY_HOURS, updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          );
        }
      }
    }
  }

  const summary = {
    dryRun,
    candidates: reports.length,
    copied: reports.filter((r) => r.action === "copy").length,
    cleared: reports.filter((r) => r.action === "clear").length,
    keptNewer: reports.filter((r) => r.reason === "kept_newer").length,
    skipped: reports.filter((r) => r.action === "skip").length,
    defaultedHours: defaultedProviders.length,
  };

  if (!dryRun) {
    await writeAuditLog({
      actorUid: callerUid,
      actorEmail: req.auth?.token?.email ?? "",
      actorRole: "superadmin",
      action: "update",
      entityType: "migration",
      entityId: "availability_backfill",
      after: summary,
      reason: "Move provider-chosen weekly hours from users.providerProfile to " +
        "instructors.availabilitySchedule; default the rest to Mon-Fri 09:00-17:00",
    });
  }

  return { ...summary, reports, defaultedProviders };
});

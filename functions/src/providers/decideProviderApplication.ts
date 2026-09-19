import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireSuperAdmin, getDefaultPermissionsForRole } from "../utils/roles";
import { auditLogData, auditLogDoc } from "../lib/audit";
import { draftServicesForCategories, providerRolePatch } from "./applicationDecision";

const region = process.env.FIREBASE_REGION || "europe-west1";

interface DecideProviderApplicationData {
  providerId: string;
  decision: "verified" | "rejected";
  notes?: string;
}

/**
 * Superadmin-only: approve or reject a self-registered provider application.
 *
 * Replaces the client batch the admin panel used, which only flipped providerStatus. On
 * approval this also makes the applicant a real provider — role 'provider' (the professional
 * tab, updateProviderProfile and the users rules all key on it) — and seeds one inactive,
 * unpriced draft service per requested category, so the categories they chose at signup
 * land in /provider/services instead of being lost. Verification is on the superadmin list
 * of delicate operations, so the audit entry is written in the same batch as the decision.
 */
export const decideProviderApplication = onCall<DecideProviderApplicationData>(
  { region },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }
    try {
      await requireSuperAdmin(callerUid);
    } catch {
      throw new HttpsError("permission-denied", "Superadmin required");
    }

    const { providerId, decision, notes } = req.data ?? ({} as DecideProviderApplicationData);
    if (typeof providerId !== "string" || !providerId) {
      throw new HttpsError("invalid-argument", "providerId is required");
    }
    if (decision !== "verified" && decision !== "rejected") {
      throw new HttpsError("invalid-argument", "decision must be 'verified' or 'rejected'");
    }

    const db = getFirestore();
    const userRef = db.collection("users").doc(providerId);
    const instructorRef = db.collection("instructors").doc(providerId);
    const [userSnap, instructorSnap] = await Promise.all([userRef.get(), instructorRef.get()]);
    if (!userSnap.exists || !instructorSnap.exists) {
      throw new HttpsError("not-found", "Application not found");
    }

    const user = userSnap.data() ?? {};
    const instructor = instructorSnap.data() ?? {};
    if (instructor.applicationStatus !== "pending") {
      throw new HttpsError("failed-precondition", "Application is not pending");
    }

    const now = FieldValue.serverTimestamp();
    const verified = decision === "verified";
    const batch = db.batch();

    const rolePatch = verified ?
      providerRolePatch(
        user.role as string | undefined,
        user.permissions as string[] | undefined,
        getDefaultPermissionsForRole("provider"),
      ) :
      null;

    batch.update(userRef, {
      "providerStatus": decision,
      "isVerified": verified,
      "providerProfile.isVerified": verified,
      "verifiedBy": callerUid,
      "verifiedAt": now,
      "verificationNotes": notes ?? null,
      "updatedAt": now,
      ...(rolePatch ?? {}),
    });
    batch.update(instructorRef, {
      "applicationStatus": decision,
      "providerProfile.isVerified": verified,
      "updatedAt": now,
    });

    let seeded = 0;
    if (verified) {
      // Never on top of existing services: approval can be re-run after a rejection, and a
      // second run must not resurrect drafts the provider deliberately deleted.
      const existing = await instructorRef.collection("services").limit(1).get();
      if (existing.empty) {
        const requested = (instructor.requestedCategoryIds as string[] | undefined) ?? [];
        const drafts = draftServicesForCategories(requested, (user.preferredLanguage as string) ?? "it");
        for (const draft of drafts) {
          batch.set(instructorRef.collection("services").doc(draft.id), draft.data);
        }
        seeded = drafts.length;
      }
    }

    const caller = (await db.collection("users").doc(callerUid).get()).data() ?? {};
    batch.set(auditLogDoc(), auditLogData({
      actorUid: callerUid,
      actorEmail: (caller.email as string) ?? req.auth?.token?.email ?? "",
      actorRole: "superadmin",
      action: verified ? "verify" : "update",
      entityType: "provider",
      entityId: providerId,
      before: { providerStatus: user.providerStatus ?? null, role: user.role ?? null },
      after: {
        providerStatus: decision,
        role: rolePatch?.role ?? user.role ?? null,
        draftServicesSeeded: seeded,
      },
      ...(notes ? { reason: notes } : {}),
    }));

    await batch.commit();

    return { success: true, providerId, decision, draftServicesSeeded: seeded };
  },
);

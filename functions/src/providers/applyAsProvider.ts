import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { commitProviderDecision } from "./commitDecision";
import { draftServicesForCategories } from "./applicationDecision";
import {
  PROVIDER_ONBOARDING_DOC,
  ProviderOnboardingSettings,
  mergeProviderOnboarding,
} from "./onboardingSettings";
import { hotCallableOptions } from "../lib/runtimeOptions";

interface ApplyAsProviderData {
  categoryIds: string[];
  fullName?: string;
}

/** The stored onboarding settings, or the defaults when nothing is configured. */
async function readOnboardingSettings(): Promise<ProviderOnboardingSettings> {
  const snap = await getFirestore().doc(PROVIDER_ONBOARDING_DOC).get();
  return mergeProviderOnboarding(snap.data() as Partial<ProviderOnboardingSettings> | undefined);
}

/**
 * A user opts in as a professional.
 *
 * What happens next is the back office's choice, held in `systemSettings/providerOnboarding`:
 *
 * - `autoApprove: true` (the default) — they are verified on the spot and listed immediately,
 *   with default hours and a draft service per category. Onboarding stays one step, which is
 *   what a marketplace still gathering professionals wants.
 * - `autoApprove: false` — the application is stored as pending and waits for an admin to
 *   decide in /admin/providers. Nothing is listed publicly until they do.
 *
 * Either way this has to be a callable. firestore.rules lets a user create only an
 * *unverified, pending* instructors document and never lets them write
 * `providerProfile.isVerified` or `applicationStatus` — correct, since that flag is what
 * lists someone publicly. So even the pending branch is written here with the Admin SDK
 * rather than from the browser, which keeps one shape for the document whichever way the
 * flag is set.
 *
 * Idempotent: re-applying merges rather than duplicating, and draft services are seeded only
 * when the provider has none.
 */
export const applyAsProvider = onCall<ApplyAsProviderData>(
  hotCallableOptions<ApplyAsProviderData>(),
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const { categoryIds, fullName } = req.data ?? ({} as ApplyAsProviderData);
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      throw new HttpsError("invalid-argument", "Pick at least one category");
    }
    if (categoryIds.some((id) => typeof id !== "string")) {
      throw new HttpsError("invalid-argument", "categoryIds must be strings");
    }
    // Unknown and non-leaf ids are dropped when the leaves are resolved; this only bounds
    // how much work a caller can ask for.
    if (categoryIds.length > 30) {
      throw new HttpsError("invalid-argument", "Too many categories");
    }

    const db = getFirestore();
    const [settings, callerSnap] = await Promise.all([
      readOnboardingSettings(),
      db.collection("users").doc(callerUid).get(),
    ]);
    const caller = callerSnap.data() ?? {};
    const applicantName = fullName ?? (caller.fullName as string) ?? null;

    if (settings.autoApprove) {
      const { draftServicesSeeded } = await commitProviderDecision({
        providerId: callerUid,
        decision: "verified",
        actor: {
          uid: callerUid,
          email: (caller.email as string) ?? req.auth?.token?.email ?? "",
          // Their own role, which at signup is `customer` and maps to the audit
          // vocabulary's 'client'. The audit entry therefore never claims an admin acted;
          // the reason below is what marks the row as an auto-approval.
          role: (caller.role as string) ?? "customer",
        },
        notes: "Auto-approved at signup",
        application: { requestedCategoryIds: categoryIds, fullName: applicantName },
      });
      return { success: true, providerId: callerUid, autoApproved: true, draftServicesSeeded };
    }

    // Queued for review. Same document shape as an approval produces, minus everything that
    // would make them visible: unverified, pending, and no default hours or draft services —
    // those are seeded by the decision, so a rejected applicant never accumulates them.
    const requestedLeaves = draftServicesForCategories(
      categoryIds,
      (caller.preferredLanguage as string) ?? "it"
    ).map((d) => d.data.categoryId);

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(
      db.collection("instructors").doc(callerUid),
      {
        uid: callerUid,
        name: applicantName,
        fullName: applicantName,
        isActive: true,
        requestedCategoryIds: requestedLeaves,
        providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
        applicationStatus: "pending",
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.update(db.collection("users").doc(callerUid), {
      providerStatus: "pending",
      updatedAt: now,
    });
    await batch.commit();

    return { success: true, providerId: callerUid, autoApproved: false, draftServicesSeeded: 0 };
  },
);

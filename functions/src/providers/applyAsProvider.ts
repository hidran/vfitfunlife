import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { commitProviderDecision } from "./commitDecision";

const region = process.env.FIREBASE_REGION || "europe-west1";

interface ApplyAsProviderData {
  categoryIds: string[];
  fullName?: string;
}

/**
 * A user opts in as a professional and is approved on the spot.
 *
 * The product decision is that signing up as a provider should not park someone behind a
 * queue: they land in /provider/* with draft services and default hours immediately, and the
 * back office adjusts afterwards (decideProviderApplication can un-verify anyone). It keeps
 * onboarding to a single step while the marketplace is still filling up with professionals.
 *
 * It has to be a callable. firestore.rules lets a user create only an *unverified, pending*
 * instructors document and never lets them touch `providerProfile.isVerified` or
 * `applicationStatus` — which is correct, and is exactly why the approval cannot happen in
 * the client batch that used to write the application. Here the Admin SDK performs the same
 * write an admin's decision would, with the applicant recorded as the actor in the audit log
 * so an auto-approval is distinguishable from one a person made.
 *
 * Idempotent: re-applying re-runs the decision, which merges rather than duplicating, and
 * draft services are only seeded when the provider has none.
 */
export const applyAsProvider = onCall<ApplyAsProviderData>(
  { region },
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
    // Unknown and non-leaf ids are dropped by the draft builder inside commitProviderDecision;
    // this only bounds how much work a caller can ask for.
    if (categoryIds.length > 30) {
      throw new HttpsError("invalid-argument", "Too many categories");
    }

    const caller = (await getFirestore().collection("users").doc(callerUid).get()).data() ?? {};

    const { draftServicesSeeded } = await commitProviderDecision({
      providerId: callerUid,
      decision: "verified",
      actor: {
        uid: callerUid,
        email: (caller.email as string) ?? req.auth?.token?.email ?? "",
        // Their own role, which at signup is `customer` and maps to the audit vocabulary's
        // 'client'. The audit entry therefore never claims an admin acted; the `reason`
        // below is what marks the row as an auto-approval.
        role: (caller.role as string) ?? "customer",
      },
      notes: "Auto-approved at signup",
      application: {
        requestedCategoryIds: categoryIds,
        fullName: fullName ?? (caller.fullName as string) ?? null,
      },
    });

    return { success: true, providerId: callerUid, draftServicesSeeded };
  },
);

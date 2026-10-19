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
import { cachedDocRead } from "../lib/cachedDoc";
import {
  BusinessApplicationError,
  ValidatedBusiness,
  parseProviderType,
  validateBusinessApplication,
} from "./businessApplication";
import type { BusinessDetails, ProviderType } from "../types";

interface ApplyAsProviderData {
  categoryIds: string[];
  fullName?: string;
  /** Absent ⇒ "individual", which is what every pre-existing caller sends. */
  providerType?: ProviderType;
  /** Required when providerType is "business"; validated field by field server-side. */
  business?: Partial<BusinessDetails>;
}

/** Uniqueness claims on a partita IVA: `businessVat/{digits}` = { uid, createdAt }. Admin SDK only. */
const BUSINESS_VAT_COLLECTION = "businessVat";

/**
 * The stored onboarding settings, or the defaults when nothing is configured.
 *
 * Cached for 60s (cachedDoc.ts's default): every signup as a professional reads this, and the
 * value only ever changes from /admin/providers. Staleness: for up to 60s after an admin flips
 * `autoApprove`, an applicant hitting THIS function's instances can still get the old
 * behaviour (auto-approved when the admin just queued applications, or queued when the admin
 * just turned auto-approval back on). `setProviderOnboardingSettings` invalidates its own
 * instance's cache on write, but that is a different Cloud Run service from this one — see
 * cachedDoc.ts — so it cannot reach these instances directly; this function's own cache still
 * expires within 60s of the write. Accepted rather than reading uncached: both outcomes are
 * reversible via the existing decideProviderApplication review flow, and auto-approve toggles
 * are rare, deliberate admin actions rather than something timing-sensitive.
 */
async function readOnboardingSettings(): Promise<ProviderOnboardingSettings> {
  const stored = await cachedDocRead<Partial<ProviderOnboardingSettings>>(PROVIDER_ONBOARDING_DOC);
  return mergeProviderOnboarding(stored);
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
 * - `providerType: "business"` — a company (gym, school, studio) is always queued, whatever
 *   the setting: see queueBusinessApplication.
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

    // The error message is the stable code (business_vat_invalid, …) the signup form maps
    // to a localised inline error; see businessApplication.ts.
    let providerType: ProviderType;
    let business: ValidatedBusiness | null = null;
    try {
      providerType = parseProviderType(req.data?.providerType);
      if (providerType === "business") {
        business = validateBusinessApplication(req.data?.business);
      }
    } catch (err) {
      if (err instanceof BusinessApplicationError) {
        throw new HttpsError("invalid-argument", err.code);
      }
      throw err;
    }

    const db = getFirestore();
    const [settings, callerSnap] = await Promise.all([
      readOnboardingSettings(),
      db.collection("users").doc(callerUid).get(),
    ]);
    const caller = callerSnap.data() ?? {};
    const applicantName = fullName ?? (caller.fullName as string) ?? null;

    if (business) {
      await queueBusinessApplication(db, callerUid, categoryIds, caller, business);
      return { success: true, providerId: callerUid, autoApproved: false, draftServicesSeeded: 0 };
    }

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
        application: { requestedCategoryIds: categoryIds, fullName: applicantName, providerType },
      });
      return { success: true, providerId: callerUid, autoApproved: true, draftServicesSeeded };
    }

    // Queued for review. Same document shape as an approval produces, minus everything that
    // would make them visible: unverified, pending, and no default hours or draft services —
    // those are seeded by the decision, so a rejected applicant never accumulates them.
    const requestedLeaves = requestedLeafIds(categoryIds, caller);

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(
      db.collection("instructors").doc(callerUid),
      {
        uid: callerUid,
        name: applicantName,
        fullName: applicantName,
        providerType,
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
      providerType,
      updatedAt: now,
    });
    await batch.commit();

    return { success: true, providerId: callerUid, autoApproved: false, draftServicesSeeded: 0 };
  },
);

/** Known leaf ids only: the draft builder drops groups and invented ids. */
function requestedLeafIds(categoryIds: string[], caller: Record<string, unknown>): string[] {
  return draftServicesForCategories(
    categoryIds,
    (caller.preferredLanguage as string) ?? "it"
  ).map((d) => d.data.categoryId);
}

/**
 * A company is always queued for an admin, whatever `autoApprove` says: its legal name
 * and P.IVA are claims that need a human look before the company trades under them.
 *
 * One transaction claims `businessVat/{vat}` and writes the pending application, so two
 * companies racing for the same number can never both get through: the second sees the
 * first's claim and fails with `already-exists` / `business_vat_taken`. A claim held by the
 * caller is theirs to reuse (re-applying after a rejection, or a double submit), and a
 * caller switching to a different number releases the one they held so it is not
 * orphaned. Rejection never releases a claim — see commitProviderDecision.
 *
 * `business` is a nested map and the instructor write goes through set/merge: a dotted
 * path there would create a field literally named "business.x" (see
 * instructorVerificationPatch), which is why the whole map is written as one value.
 */
async function queueBusinessApplication(
  db: FirebaseFirestore.Firestore,
  uid: string,
  categoryIds: string[],
  caller: Record<string, unknown>,
  business: ValidatedBusiness,
): Promise<void> {
  const claimRef = db.collection(BUSINESS_VAT_COLLECTION).doc(business.vatNumber);
  const instructorRef = db.collection("instructors").doc(uid);
  const userRef = db.collection("users").doc(uid);
  const requestedLeaves = requestedLeafIds(categoryIds, caller);

  await db.runTransaction(async (tx) => {
    const [claimSnap, instructorSnap] = await Promise.all([tx.get(claimRef), tx.get(instructorRef)]);
    const claimedBy = claimSnap.data()?.uid as string | undefined;
    if (claimSnap.exists && claimedBy !== uid) {
      throw new HttpsError("already-exists", "business_vat_taken");
    }

    const previousVat = (instructorSnap.data()?.business as Partial<BusinessDetails> | undefined)?.vatNumber;
    if (typeof previousVat === "string" && previousVat && previousVat !== business.vatNumber) {
      const previousRef = db.collection(BUSINESS_VAT_COLLECTION).doc(previousVat);
      const previous = await tx.get(previousRef);
      if (previous.data()?.uid === uid) tx.delete(previousRef);
    }

    const now = FieldValue.serverTimestamp();
    if (!claimSnap.exists) {
      tx.create(claimRef, { uid, createdAt: now });
    }
    tx.set(
      instructorRef,
      {
        uid,
        name: business.displayName,
        fullName: business.displayName,
        providerType: "business" as ProviderType,
        business,
        isActive: true,
        requestedCategoryIds: requestedLeaves,
        providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
        applicationStatus: "pending",
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    tx.update(userRef, {
      providerStatus: "pending",
      providerType: "business" as ProviderType,
      updatedAt: now,
    });
  });
}

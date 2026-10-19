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
  BusinessApplicationErrorCode,
  ValidatedBusiness,
  parseProviderType,
  validateBusinessApplication,
} from "./businessApplication";
import { BUSINESS_VAT_COLLECTION, claimVat } from "./businessVatClaim";
import type { BusinessDetails, ProviderType } from "../types";

interface ApplyAsProviderData {
  categoryIds: string[];
  fullName?: string;
  /** Absent ⇒ "individual", which is what every pre-existing caller sends. */
  providerType?: ProviderType;
  /** Required when providerType is "business"; validated field by field server-side. */
  business?: Partial<BusinessDetails>;
}

export interface ApplyAsProviderResult {
  success: boolean;
  providerId: string;
  /** Where the account stands after this call. */
  status: "verified" | "pending";
  /** True only when THIS call verified them; a verified account re-applying gets false. */
  autoApproved: boolean;
  draftServicesSeeded: number;
}

/**
 * Every stable message code this callable can fail with. The validator's codes come back
 * as `invalid-argument`; `business_vat_taken` as `already-exists`; `provider_type_locked`
 * as `failed-precondition`. Mirror any change in the client's error mapping.
 */
export type ApplyAsProviderErrorCode =
  | BusinessApplicationErrorCode
  | "provider_type_locked"
  | "business_vat_taken";

/** Re-exported for callers that only know this module; the claim logic lives in businessVatClaim.ts. */
export { BUSINESS_VAT_COLLECTION };

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
 *
 * Re-applying can never route around a review (see applyAsProvider.test.ts):
 *
 * - An account that is a business (stored `providerType`/`business`) stays a business. An
 *   explicit `providerType: "individual"` without a business payload fails
 *   `failed-precondition` / `provider_type_locked` rather than being treated as an
 *   individual and auto-approved with the company map still on the document; any other
 *   re-application is validated as a business (`business_required` when the payload is
 *   missing).
 * - A rejected applicant is always queued again, whatever `autoApprove` says: an admin
 *   turned them down and only an admin may reverse that.
 * - An already verified account is a no-op (nothing rewritten); a verified individual
 *   cannot turn itself into a business here — conversions are an admin job.
 *
 * Known, accepted: an unverified account can hold a P.IVA claim it has no right to
 * (squatting). It is bounded to one claim per uid — switching numbers releases the old
 * one — and an admin frees a claim from the admin panel (plan B8); the pending review is
 * where such an application is caught.
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

    const requestedType = withApplicationErrors(() => parseProviderType(req.data?.providerType));

    const db = getFirestore();
    const [settings, callerSnap, instructorSnap] = await Promise.all([
      readOnboardingSettings(),
      db.collection("users").doc(callerUid).get(),
      db.collection("instructors").doc(callerUid).get(),
    ]);
    const caller = callerSnap.data() ?? {};
    const existing = instructorSnap.data() ?? {};
    const applicantName = fullName ?? (caller.fullName as string) ?? null;

    // What the account already is outranks what the request says: once a business, always
    // a business, so a pending or rejected company cannot shed its map by re-applying as
    // an individual. A verified individual cannot become a business either.
    const isBusinessAccount =
      caller.providerType === "business" ||
      existing.providerType === "business" ||
      (typeof existing.business === "object" && existing.business !== null);
    // Providers from before users.providerStatus existed are verified only on the
    // instructors side; any of the three flags means an admin (or auto-approval) said yes.
    const isVerified =
      caller.providerStatus === "verified" ||
      existing.applicationStatus === "verified" ||
      (existing.providerProfile as { isVerified?: unknown } | undefined)?.isVerified === true;
    // Only an explicit attempt to change type is locked: an omitted providerType is the
    // default, not a request to become an individual, and a business account that sends a
    // business payload is re-applying as a business whatever the field says. A business
    // account with no payload and no type change gets the validator's business_required.
    const hasBusinessPayload = req.data?.business !== undefined && req.data?.business !== null;
    const asksToChangeType =
      (isBusinessAccount && req.data?.providerType === "individual" && !hasBusinessPayload) ||
      (!isBusinessAccount && requestedType === "business" && isVerified);
    if (asksToChangeType) {
      throw new HttpsError("failed-precondition", "provider_type_locked");
    }

    const alreadyVerified: ApplyAsProviderResult = {
      success: true, providerId: callerUid, status: "verified", autoApproved: false, draftServicesSeeded: 0,
    };
    const queued: ApplyAsProviderResult = {
      success: true, providerId: callerUid, status: "pending", autoApproved: false, draftServicesSeeded: 0,
    };

    if (isVerified) {
      return alreadyVerified;
    }

    const providerType: ProviderType = isBusinessAccount ? "business" : requestedType;
    if (providerType === "business") {
      const business = withApplicationErrors(() => validateBusinessApplication(req.data?.business));
      await queueBusinessApplication(db, callerUid, categoryIds, caller, business);
      return queued;
    }

    const wasRejected =
      caller.providerStatus === "rejected" || existing.applicationStatus === "rejected";

    if (settings.autoApprove && !wasRejected) {
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
      return {
        success: true, providerId: callerUid, status: "verified", autoApproved: true, draftServicesSeeded,
      } satisfies ApplyAsProviderResult;
    }

    // Queued for review (auto-approval off, or an admin rejected them before).
    const writes = pendingApplicationWrites({
      uid: callerUid, name: applicantName, providerType, categoryIds, caller,
    });
    const batch = db.batch();
    batch.set(db.collection("instructors").doc(callerUid), writes.instructor, { merge: true });
    batch.update(db.collection("users").doc(callerUid), writes.user);
    await batch.commit();

    return queued;
  },
);

/**
 * The two documents a queued application writes — the same shape an approval produces,
 * minus everything that would make them visible: unverified, pending, and no default hours
 * or draft services (those are seeded by the decision, so a rejected applicant never
 * accumulates them). Shared by the individual batch and the business transaction so the
 * two can never drift. Nested maps only: both callers apply `instructor` with set/merge,
 * which does not resolve dotted keys (see instructorVerificationPatch).
 */
function pendingApplicationWrites(args: {
  uid: string;
  name: string | null;
  providerType: ProviderType;
  categoryIds: string[];
  caller: Record<string, unknown>;
  business?: ValidatedBusiness;
}): {
  instructor: Record<string, unknown>;
  user: { providerStatus: "pending"; providerType: ProviderType; updatedAt: FieldValue };
} {
  const { uid, name, providerType, categoryIds, caller, business } = args;
  const now = FieldValue.serverTimestamp();
  return {
    instructor: {
      uid,
      name,
      fullName: name,
      providerType,
      ...(business ? { business } : {}),
      isActive: true,
      requestedCategoryIds: requestedLeafIds(categoryIds, caller),
      providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
      applicationStatus: "pending",
      createdAt: now,
      updatedAt: now,
    },
    user: {
      providerStatus: "pending",
      providerType,
      updatedAt: now,
    },
  };
}

/**
 * Runs a pure validator, turning its BusinessApplicationError into an `invalid-argument`
 * HttpsError whose message is the stable code (business_vat_invalid, …) the signup form
 * maps to a localised inline error; see businessApplication.ts.
 */
function withApplicationErrors<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof BusinessApplicationError) {
      throw new HttpsError("invalid-argument", err.code);
    }
    throw err;
  }
}

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
 * One transaction claims `businessVat/{vat}` (claimVat in businessVatClaim.ts: the second of
 * two companies racing for the same number fails with `already-exists` / `business_vat_taken`,
 * the holder may reuse their own claim, switching numbers releases the old one) and writes the
 * pending application, so the claim and the application always land together.
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
  const instructorRef = db.collection("instructors").doc(uid);
  const userRef = db.collection("users").doc(uid);
  const writes = pendingApplicationWrites({
    uid, name: business.displayName, providerType: "business", categoryIds, caller, business,
  });

  await db.runTransaction(async (tx) => {
    const instructorSnap = await tx.get(instructorRef);
    const previousVat = (instructorSnap.data()?.business as Partial<BusinessDetails> | undefined)?.vatNumber;
    // Reads (the claim, the previous claim) happen inside claimVat, before any write below.
    await claimVat(tx, db, {
      uid,
      vatNumber: business.vatNumber,
      previousVat: typeof previousVat === "string" ? previousVat : null,
    });
    tx.set(instructorRef, writes.instructor, { merge: true });
    tx.update(userRef, writes.user);
  });
}

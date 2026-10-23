import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { APPLICATION_REJECTED, commitProviderDecision } from "./commitDecision";
import {
  draftServicesForCategories,
  pendingApplicationPatches,
  toConcurrentUpdateError,
} from "./applicationDecision";
import {
  BUSINESS_VAT_COLLECTION,
  assertNotApprovedBusiness,
  assertNotExistingBusiness,
  assertNotVerifiedIndividual,
  claimBusinessVat,
  isRejectedAccount,
  isVerifiedAccount,
  parseProviderType,
  validateBusinessInput,
} from "./businessApplication";
import type { BusinessLegalForm, BusinessVenueType, ProviderType } from "./businessTypes";
import {
  PROVIDER_ONBOARDING_DOC,
  ProviderOnboardingSettings,
  mergeProviderOnboarding,
  shouldAutoApprove,
} from "./onboardingSettings";
import { hotCallableOptions } from "../lib/runtimeOptions";
import { isAuthorizedWarmupPing } from "../lib/warmupKey";
import { cachedDocRead } from "../lib/cachedDoc";

interface ApplyAsProviderData {
  categoryIds: string[];
  fullName?: string;
  /** Absent ⇒ 'individual', which behaves exactly as before business accounts. */
  providerType?: ProviderType;
  /** Required when providerType is 'business'; ignored otherwise. See validateBusinessInput. */
  business?: {
    legalName: string;
    /** P.IVA, or an association's codice fiscale (D3). */
    vatNumber: string;
    /** Absent ⇒ 'company'. */
    legalForm?: BusinessLegalForm;
    /** Optional CONI / RASD / ente di promozione registration. */
    affiliationNumber?: string;
    displayName?: string;
    description?: string;
    website?: string;
    city?: string;
    /** Premises (B12). Absent ⇒ 'none'; gym, school and studio need `address` and `city`. */
    venueType?: BusinessVenueType;
    /** Street address of the premises (B12), at most 200 characters. */
    address?: string;
  };
}

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
 *
 * A company or association (`providerType: 'business'`) always takes the pending branch,
 * whatever the setting (decision D2: someone checks the tax id first). Its details are
 * validated (validateBusinessInput), an account that is already an approved business is
 * refused (`business_already_approved`), and its tax id (P.IVA / codice fiscale) is claimed in
 * `businessVat/{vat}` — one business per tax id (D5), and every other claim the account holds
 * is released — and the claims, the instructors doc and the user doc are written in one
 * transaction, so a refused application writes nothing. Errors carry stable codes as messages
 * (`invalid_vat`, `invalid_legal_form`, `vat_already_registered`, `business_already_approved`,
 * ...) for the client to localise; `aborted` / `concurrent_update` means "lost a race, try
 * again".
 *
 * Either way this has to be a callable. firestore.rules lets a user create only an
 * *unverified, pending* instructors document and never lets them write
 * `providerProfile.isVerified` or `applicationStatus` — correct, since that flag is what
 * lists someone publicly. So even the pending branch is written here with the Admin SDK
 * rather than from the browser, which keeps one shape for the document whichever way the
 * flag is set.
 *
 * Idempotent: re-applying merges rather than duplicating, and draft services are seeded only
 * when the provider has none. Re-applying can never route around a review:
 *
 * - a REJECTED applicant is queued as pending again whatever `autoApprove` says — an admin
 *   turned them down and only an admin may reverse that;
 * - an already VERIFIED account (`users.providerStatus`, `instructors.applicationStatus` or the
 *   legacy `providerProfile.isVerified`) re-applying as an individual is a no-op: nothing is
 *   rewritten, and the answer carries no `autoApproved` so the client reads the account's own
 *   status instead of guessing "pending";
 * - a verified individual cannot turn itself into a company (`failed-precondition` /
 *   `provider_type_locked`): the way back and forth is an admin's conversion.
 */
export const applyAsProvider = onCall<ApplyAsProviderData>(
  hotCallableOptions<ApplyAsProviderData>(),
  async (req) => {
    // keepWarm ping: return before auth/Firestore work. Keep billed to the ping only.
    if (isAuthorizedWarmupPing(req.data)) {
      return { success: true, providerId: "", draftServicesSeeded: 0 };
    }
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
    const providerType = parseProviderType(req.data?.providerType);
    const business = providerType === "business" ? validateBusinessInput(req.data?.business) : null;

    const db = getFirestore();
    const userRef = db.collection("users").doc(callerUid);
    const instructorRef = db.collection("instructors").doc(callerUid);
    const [settings, callerSnap, instructorSnap] = await Promise.all([
      readOnboardingSettings(),
      userRef.get(),
      instructorRef.get(),
    ]);
    const caller = callerSnap.data() ?? {};
    const applicantName = fullName ?? (caller.fullName as string) ?? null;

    // A company re-applying as an individual would otherwise be auto-approved (and listed
    // without its tax id ever being checked), or have its company name replaced by a person's.
    // These reads may already be stale; the auto-approval (commitProviderDecision) and the
    // pending branch below both re-check inside their transactions, which is what actually
    // closes a concurrent individual/business race. This early check only fails fast.
    const storedInstructor = instructorSnap.data();
    if (providerType !== "business") {
      assertNotExistingBusiness(caller, storedInstructor);
      if (isVerifiedAccount(caller, storedInstructor)) {
        return alreadyVerified(callerUid);
      }
    } else {
      assertNotVerifiedIndividual(caller, storedInstructor);
    }

    const autoApprove = shouldAutoApprove(settings, providerType, {
      rejected: isRejectedAccount(caller, storedInstructor),
      verified: isVerifiedAccount(caller, storedInstructor),
    });
    if (autoApprove) {
      // One transaction (commitProviderDecision): a concurrent write — the admin-index trigger
      // touching users/{uid} right after signup, or a business application — makes Firestore
      // re-run it with fresh reads, so the first just succeeds and the second is refused
      // (`business_account_exists`). `concurrent_update` only if contention outlasts its retries.
      // `selfApproval` makes that same transaction judge rejected/verified on ITS reads, not on
      // the early ones above: an admin who rejected the applicant in between wins (the
      // application is queued below instead), and an account verified in between is untouched.
      try {
        const approved = await commitProviderDecision({
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
          selfApproval: true,
        });
        if (approved.alreadyVerified) {
          return alreadyVerified(callerUid);
        }
        return {
          success: true,
          providerId: callerUid,
          autoApproved: true,
          draftServicesSeeded: approved.draftServicesSeeded,
        };
      } catch (err) {
        if (!(err instanceof HttpsError && err.message === APPLICATION_REJECTED)) throw err;
        // Rejected after the early reads: fall through to the pending queue below.
      }
    }

    // Queued for review. Same document shape as an approval produces, minus everything that
    // would make them visible: unverified, pending, and no default hours or draft services —
    // those are seeded by the decision, so a rejected applicant never accumulates them.
    const requestedLeaves = draftServicesForCategories(
      categoryIds,
      (caller.preferredLanguage as string) ?? "it"
    ).map((d) => d.data.categoryId);

    const now = FieldValue.serverTimestamp();

    // One transaction, every read first (Firestore requires it): the user and instructors docs —
    // fresh, so the checks below cannot act on the stale reads above — then, for a company,
    // every claim this account holds and the claim it asks for; only then the writes. A refused
    // application therefore writes nothing, and a concurrent write to either doc (a company
    // application racing an individual one, or a decision by commitProviderDecision, also one
    // transaction) makes Firestore re-run it on fresh reads:
    // - a company: two accounts racing for the same tax id cannot both win, and an approved
    //   business is refused (`business_already_approved`);
    // - an individual: re-checked against `business_account_exists`, so a company application
    //   landing after the reads above keeps its name and data; and the profile defaults (bio,
    //   rating, reviewCount, createdAt) are written only if the doc is absent in THIS read.
    const claims = db.collection(BUSINESS_VAT_COLLECTION);
    let verifiedMeanwhile = false;
    try {
      await db.runTransaction(async (tx) => {
        verifiedMeanwhile = false; // the body re-runs on contention; judge each run afresh
        const currentUser = await tx.get(userRef);
        const current = await tx.get(instructorRef);
        if (!currentUser.exists) {
          throw new HttpsError("not-found", "User profile not found");
        }
        if (business) {
          assertNotApprovedBusiness(currentUser.data(), current.data());
          assertNotVerifiedIndividual(currentUser.data(), current.data());
          const held = await tx.get(claims.where("uid", "==", callerUid));
          await claimBusinessVat<DocumentReference>(tx, {
            uid: callerUid,
            vatNumber: business.vatNumber,
            instructor: current.data(),
            heldVatNumbers: held.docs.map((claim) => claim.id),
            claimRef: (vat) => claims.doc(vat),
            now,
          });
        } else {
          assertNotExistingBusiness(currentUser.data(), current.data());
          if (isVerifiedAccount(currentUser.data(), current.data())) {
            // Approved since the early reads: re-queueing would de-list a live provider.
            verifiedMeanwhile = true;
            return;
          }
        }
        const patches = pendingApplicationPatches({
          uid: callerUid,
          applicantName,
          requestedLeaves,
          now,
          business,
          instructorExists: current.exists,
        });
        tx.set(instructorRef, patches.instructor, { merge: true });
        tx.update(userRef, patches.user);
      });
    } catch (err) {
      // Contention that outlasted the SDK's own retries: retryable, not `internal`.
      throw toConcurrentUpdateError(err);
    }

    if (verifiedMeanwhile) {
      return alreadyVerified(callerUid);
    }
    return { success: true, providerId: callerUid, autoApproved: false, draftServicesSeeded: 0 };
  },
);

/** Nothing written: the account is already verified. No `autoApproved` — see applyAsProvider. */
function alreadyVerified(providerId: string) {
  return { success: true, providerId, draftServicesSeeded: 0 };
}

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { commitProviderDecision } from "./commitDecision";
import { draftServicesForCategories, pendingApplicationPatches } from "./applicationDecision";
import {
  BUSINESS_VAT_COLLECTION,
  assertNotApprovedBusiness,
  assertNotExistingBusiness,
  claimBusinessVat,
  parseProviderType,
  validateBusinessInput,
} from "./businessApplication";
import type { BusinessLegalForm, ProviderType } from "./businessTypes";
import {
  PROVIDER_ONBOARDING_DOC,
  ProviderOnboardingSettings,
  mergeProviderOnboarding,
  shouldAutoApprove,
} from "./onboardingSettings";
import { hotCallableOptions } from "../lib/runtimeOptions";
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
    // These reads may already be stale; commitProviderDecision re-checks inside its transaction,
    // which is what actually closes a concurrent individual/business race.
    if (providerType !== "business") {
      assertNotExistingBusiness(caller, instructorSnap.data());
    }

    if (shouldAutoApprove(settings, providerType)) {
      // One transaction (commitProviderDecision): a concurrent write — the admin-index trigger
      // touching users/{uid} right after signup, or a business application — makes Firestore
      // re-run it with fresh reads, so the first just succeeds and the second is refused
      // (`business_account_exists`). `concurrent_update` only if contention outlasts its retries.
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

    if (business) {
      // One transaction, every read first (Firestore requires it): the user and instructors
      // docs — fresh, so the approval check below cannot act on the stale reads above — then
      // every claim this account holds and the claim it asks for; only then the writes. A
      // refused application therefore writes nothing, two accounts racing for the same tax id
      // cannot both win, and a concurrent decision on this account (commitProviderDecision, also
      // one transaction over users + instructors) is serialised with it: whichever commits
      // second re-runs on the other's result.
      const claims = db.collection(BUSINESS_VAT_COLLECTION);
      await db.runTransaction(async (tx) => {
        const currentUser = await tx.get(userRef);
        const current = await tx.get(instructorRef);
        assertNotApprovedBusiness(currentUser.data(), current.data());
        const held = await tx.get(claims.where("uid", "==", callerUid));
        await claimBusinessVat<DocumentReference>(tx, {
          uid: callerUid,
          vatNumber: business.vatNumber,
          instructor: current.data(),
          heldVatNumbers: held.docs.map((claim) => claim.id),
          claimRef: (vat) => claims.doc(vat),
          now,
        });
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
    } else {
      const patches = pendingApplicationPatches({
        uid: callerUid,
        applicantName,
        requestedLeaves,
        now,
        instructorExists: instructorSnap.exists,
      });
      const batch = db.batch();
      batch.set(instructorRef, patches.instructor, { merge: true });
      batch.update(userRef, patches.user);
      await batch.commit();
    }

    return { success: true, providerId: callerUid, autoApproved: false, draftServicesSeeded: 0 };
  },
);

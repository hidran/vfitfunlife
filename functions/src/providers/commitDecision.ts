import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getDefaultPermissionsForRole } from "../utils/roles";
import { auditLogData, auditLogDoc, toActorRole } from "../lib/audit";
import {
  decisionInstructorPatch,
  draftServicesForCategories,
  providerRolePatch,
  toConcurrentUpdateError,
} from "./applicationDecision";
import {
  BUSINESS_VAT_COLLECTION,
  assertNotExistingBusiness,
  isRejectedAccount,
  isVerifiedAccount,
} from "./businessApplication";
import { assertApprovalHoldsClaim, checkBusinessReview } from "./businessAdminRules";
import { isProtectedSuperadmin } from "../lib/superadmins";
import { businessVenueId, planBusinessVenue } from "./businessVenue";

/** The stable message of the refusal a rejected applicant's auto-approval ends in. */
export const APPLICATION_REJECTED = "application_rejected";

/** gRPC status code: a `create` hit a document that already exists. */
const ALREADY_EXISTS = 6;

/** Who the audit entry should name as responsible for the decision. */
export interface DecisionActor {
  uid: string;
  email: string;
  role: string;
}

export interface CommitDecisionOptions {
  providerId: string;
  decision: "verified" | "rejected";
  actor: DecisionActor;
  notes?: string;
  /**
   * Present when the caller is applying for themselves. Carries what the signup form
   * collected, so the instructor document is created in the same write that approves it
   * rather than in a separate client batch the rules would (rightly) refuse to verify.
   *
   * This self-apply path never verifies a business (D2): it refuses an account its own
   * (in-transaction) reads show to be a business.
   */
  application?: { requestedCategoryIds: string[]; fullName?: string | null };
  /**
   * Set by applyAsProvider's auto-approval ONLY (never by an admin decision). Guards the
   * self-approval against what the transaction's own reads show, which the handler's earlier
   * reads cannot promise (an admin may have decided in between):
   * - `users.providerStatus` / `instructors.applicationStatus` is 'rejected' ⇒ nothing is
   *   written and `application_rejected` is thrown (`failed-precondition`); applyAsProvider
   *   answers by queueing the application as pending instead — only an admin reverses a no;
   * - the account is already verified (any of the three signals) ⇒ nothing is written and the
   *   result says `alreadyVerified`.
   */
  selfApproval?: boolean;
  /**
   * What the admin had on screen: the company's four reviewed legal fields (BusinessReview, B8).
   * Required to verify a business (`review_required`); when sent it must describe the doc as it
   * is (`stale_review`). See checkBusinessReview. Typed `unknown` because it is untrusted caller
   * input — checkBusinessReview checks its shape.
   */
  expectedReview?: unknown;
}

/**
 * The single place a provider's verification state changes.
 *
 * Both routes go through here — an admin deciding on someone else, and an applicant being
 * auto-approved at signup — so the two can never drift on the things that are easy to get
 * subtly wrong: the nested `providerProfile.isVerified` flag the public read rule keys on,
 * the role promotion, the default hours that make them bookable, the draft services, and
 * the audit entry.
 *
 * ONE Firestore transaction, every read before any write: the users and instructors docs, the
 * `businessVat` claim when a company is being approved, and whether the provider already has
 * services. Every guard is computed from those reads, and the transaction commits only if none
 * of them changed in the meantime — otherwise Firestore re-runs it with fresh reads (the
 * Admin SDK retries contention itself, up to 5 attempts). So there is no window between a
 * check and the write it protects:
 * - D2: the self-apply path refuses an account that is (or has just become) a business
 *   (`business_account_exists`);
 * - B8 / I1, no company listed with details nobody reviewed: approving a business needs the
 *   admin's `expectedReview` and it must match (`review_required` / `stale_review`); an
 *   individual who applies as a company while the admin approves them ends in the re-run seeing
 *   a business with no review ⇒ `review_required`;
 * - I2, one tax id one holder: approving a company requires that it holds the claim on its tax
 *   id (`claim_missing` / `vat_already_registered`);
 * - B12, the company's venue follows the decision, in the same commit. The transaction READS
 *   `venues/biz_<uid>` (with the other reads) and planBusinessVenue decides from it: approval
 *   creates the venue (`create`, never set), or reactivates the company's own inactive one
 *   touching only isActive/updatedAt (admin edits, photos and partnerStatus survive) and
 *   relinks `business.venueId`; a rejection deactivates it. A venue at that id owned by
 *   someone else fails the whole decision with `already-exists` / `venue_exists`, as does a
 *   `create` that loses a race to another create (the read makes that a re-run first).
 * - a provider deleted mid-flight ends in `not-found` / `provider_not_found`; a protected
 *   superadmin is refused with `permission-denied` / `protected_account`.
 * A concurrent write that changes none of the reviewed facts — e.g. the search-index trigger
 * rewriting `searchTerms` seconds after an edit, or the admin-index trigger touching users/{uid}
 * right after signup — only causes a re-run that passes; it can't produce a spurious
 * `stale_review` (the B8a lastUpdateTime guard could, failing closed). Contention that outlasts
 * the SDK's retries surfaces as `aborted` / `concurrent_update`.
 */
export async function commitProviderDecision(
  opts: CommitDecisionOptions
): Promise<{ draftServicesSeeded: number; venueId: string | null; alreadyVerified?: true }> {
  const { providerId, decision, actor, notes, application, expectedReview, selfApproval } = opts;

  const db = getFirestore();
  const userRef = db.collection("users").doc(providerId);
  const instructorRef = db.collection("instructors").doc(providerId);
  const claims = db.collection(BUSINESS_VAT_COLLECTION);
  const verified = decision === "verified";
  // Whether the attempt that ended in an error was creating a venue (reset on every re-run).
  let creatingVenue = false;

  try {
    return await db.runTransaction(async (tx) => {
      creatingVenue = false;
      // --- Reads (all of them before any write) ---
      const userSnap = await tx.get(userRef);
      const instructorSnap = await tx.get(instructorRef);
      if (!userSnap.exists) {
        throw new HttpsError("not-found", "provider_not_found");
      }
      const user = userSnap.data() ?? {};
      const instructor = instructorSnap.data() ?? {};

      // providerRolePatch already refuses to touch an existing admin/superadmin's role, but a
      // protected superadmin's doc must not be written by this path at all (providerStatus,
      // verification fields, etc.) — belt and suspenders against a crafted application.
      if (isProtectedSuperadmin(user)) {
        throw new HttpsError("permission-denied", "protected_account");
      }

      // Self-apply only: applyAsProvider checked this too, but on its own (possibly stale) reads.
      if (application) {
        assertNotExistingBusiness(user, instructor);
      }

      // Auto-approval only: a decision an admin took since applyAsProvider's early reads wins.
      // Judged on THIS transaction's reads, so a write landing before the commit makes
      // Firestore re-run it and the re-run sees it. Admin decisions never come through here.
      if (selfApproval && verified) {
        if (isVerifiedAccount(user, instructor)) {
          return { draftServicesSeeded: 0, venueId: null, alreadyVerified: true };
        }
        if (isRejectedAccount(user, instructor)) {
          throw new HttpsError("failed-precondition", APPLICATION_REJECTED);
        }
      }

      // B8: approve what was reviewed; a company being verified must hold its tax-id claim.
      const claimVat = checkBusinessReview({
        user,
        instructor: instructorSnap.data(),
        decision,
        expectedReview,
      });
      if (claimVat) {
        const claim = await tx.get(claims.doc(claimVat));
        assertApprovalHoldsClaim(claim.exists ? claim.data() : undefined, providerId);
      }

      // Never seed drafts on top of existing services: a decision can be re-run after a
      // rejection, and a second run must not resurrect drafts the provider deliberately deleted.
      const hasServices = verified ?
        !(await tx.get(instructorRef.collection("services").limit(1))).empty :
        true;

      // B12: the company's venue (read here, with the other reads). Only a company has one.
      const venueRef = db.collection("venues").doc(businessVenueId(providerId));
      const hasBusiness = !!instructor.business && typeof instructor.business === "object";
      const venueSnap = hasBusiness ? await tx.get(venueRef) : null;

      // --- Pure computation ---
      const now = FieldValue.serverTimestamp();
      const rolePatch = verified ?
        providerRolePatch(
          user.role as string | undefined,
          user.permissions as string[] | undefined,
          getDefaultPermissionsForRole("provider"),
        ) :
        null;

      // update() resolves the dotted "providerProfile.isVerified" path, leaving the rest of the
      // users-side providerProfile map alone.
      const userPatch = {
        "providerStatus": decision,
        "isVerified": verified,
        "providerProfile.isVerified": verified,
        "verifiedBy": actor.uid,
        "verifiedAt": now,
        "verificationNotes": notes ?? null,
        "updatedAt": now,
        ...(rolePatch ?? {}),
      };

      const locale = (user.preferredLanguage as string) ?? "it";
      // Validate through the draft builder: it keeps only known taxonomy leaves, so an applicant
      // cannot store a group id or an invented one as something they offer.
      const requestedLeaves = application ?
        draftServicesForCategories(application.requestedCategoryIds ?? [], locale).map(
          (d) => d.data.categoryId
        ) :
        ((instructor.requestedCategoryIds as string[] | undefined) ?? []);

      // Built by decisionInstructorPatch (pure, tested): nested maps only, because this is
      // applied with set(..., { merge: true }), which does not resolve dotted keys.
      //
      // - A provider created from the admin panel (or one predating the catalogue) has no
      //   instructors document at all, and that document is what makes them bookable and
      //   searchable — so the entry is created here rather than refusing a decision the admin is
      //   entitled to make.
      // - Approval also makes them bookable immediately: default Mon-Fri 09:00-17:00 hours if
      //   they have none yet (never overwrites hours already set — e.g. a re-approval, or hours
      //   saved between application and decision). availabilityUpdatedAt is deliberately not
      //   stamped, so the dashboard still nudges the provider to review the default.
      // - A business keeps its company name and its `business` map on approval and rejection.
      const instructorPatch = decisionInstructorPatch({
        providerId,
        decision,
        instructorExists: instructorSnap.exists,
        instructor,
        userFullName: user.fullName,
        application,
        requestedLeaves,
        now,
      });
      // B12: planned from the instructor doc and the venue this transaction read (so a
      // location saved a moment ago, or a venue created by a racing approval, is either seen or
      // forces a re-run). Null for individuals, venueType absent/"none", or nothing to change.
      const venuePlan = planBusinessVenue({
        providerId,
        decision,
        instructor,
        existing: venueSnap ? { exists: venueSnap.exists, data: venueSnap.data() } : undefined,
        now,
      });
      const venueLink = venuePlan && venuePlan.kind !== "deactivate" ? venuePlan.instructorPatch : null;
      // Nested map: merge deep-merges it, so legalName/vatNumber/etc. survive; a dotted
      // "business.venueId" key would be stored literally by set(..., { merge: true }).
      if (venueLink) Object.assign(instructorPatch, venueLink);
      creatingVenue = venuePlan?.kind === "create";
      const drafts = verified && !hasServices ? draftServicesForCategories(requestedLeaves, locale) : [];

      // --- Writes ---
      tx.update(userRef, userPatch);
      tx.set(instructorRef, instructorPatch, { merge: true });
      if (venuePlan?.kind === "create") {
        tx.create(venueRef, venuePlan.venue);
      } else if (venuePlan) {
        tx.update(venueRef, venuePlan.venuePatch);
      }
      for (const draft of drafts) {
        tx.set(instructorRef.collection("services").doc(draft.id), draft.data);
      }
      tx.set(auditLogDoc(), auditLogData({
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: toActorRole(actor.role),
        action: verified ? "verify" : "update",
        entityType: "provider",
        entityId: providerId,
        before: { providerStatus: user.providerStatus ?? null, role: user.role ?? null },
        after: {
          providerStatus: decision,
          role: rolePatch?.role ?? user.role ?? null,
          draftServicesSeeded: drafts.length,
          ...(venuePlan ? { venueId: venuePlan.venueId } : {}),
          ...(venuePlan?.kind === "reactivate" ? { venueReactivated: true } : {}),
          ...(venuePlan?.kind === "deactivate" ? { venueDeactivated: true } : {}),
        },
        ...(notes ? { reason: notes } : {}),
      }));

      // A venue id is reported when the decision put a venue on the map (created or brought back).
      return {
        draftServicesSeeded: drafts.length,
        venueId: venuePlan && venuePlan.kind !== "deactivate" ? venuePlan.venueId : null,
      };
    });
  } catch (err) {
    // The commit is atomic, so nothing of the decision was written when the venue create
    // failed: retrying once the clash is resolved is safe. Mapped BEFORE the contention
    // mapping (ALREADY_EXISTS is not ABORTED, but the venue clash must never be swallowed).
    if (creatingVenue && (err as { code?: unknown } | null)?.code === ALREADY_EXISTS) {
      throw new HttpsError("already-exists", "venue_exists");
    }
    throw toConcurrentUpdateError(err);
  }
}

import { HttpsError } from "firebase-functions/v2/https";
import type { BusinessDetails, BusinessLegalForm } from "./businessTypes";
import {
  isApproved,
  isExistingBusiness,
  parseAffiliationNumber,
  parseLegalForm,
  parseLegalName,
  parseVatNumber,
} from "./businessApplication";
import { isValidItalianVat, normalizeVatNumber } from "./vatNumber";

/**
 * Pure pieces of the admin actions on a business (plan 2026-10-04, task B8): approving what was
 * reviewed, releasing a tax-id claim, converting a company back to an individual, and changing
 * its tax id. Free of firebase-admin so they can be tested without the emulator — same split
 * as businessApplication.ts / applicationDecision.ts.
 *
 * Every HttpsError raised here carries a stable code as its message (`stale_review`,
 * `claim_in_use`, ...) for the admin UI to map to localised text.
 */

/** What the admin had on screen when approving a company: the reviewed tax id and legal name. */
export interface BusinessReview {
  vatNumber: string;
  legalName: string;
}

/**
 * The instructors doc's `business` value when the doc is a company, else null. Any non-null
 * object counts — the same test as isExistingBusiness — so a corrupt map (an array, say) is
 * still treated as a company and can never be approved without a review that matches it.
 */
function businessOf(instructor: Record<string, unknown> | undefined): Record<string, unknown> | null {
  const business = instructor?.business;
  return business && typeof business === "object" ? (business as Record<string, unknown>) : null;
}

/** `{ vatNumber, legalName }` when `raw` has both as strings, else null. */
function asReview(raw: unknown): BusinessReview | null {
  if (!raw || typeof raw !== "object") return null;
  const { vatNumber, legalName } = raw as Record<string, unknown>;
  return typeof vatNumber === "string" && typeof legalName === "string" ? { vatNumber, legalName } : null;
}

/**
 * Approve what the admin actually saw (invariant: no company is listed with details nobody
 * reviewed). A pending company may change its tax id or legal name by re-applying, and an
 * approval re-reads the latest doc — so an admin looking at number X could otherwise approve Y.
 * `user` and `instructor` must be the reads of the SAME transaction that writes the decision
 * (commitProviderDecision), so nothing can change between this check and the write.
 *
 * "A business" is isExistingBusiness: a `business` map on the instructors doc OR
 * `users.providerType === 'business'`.
 * - Approving (`verified`) a business requires `expectedReview`: missing or not
 *   `{ vatNumber: string, legalName: string }` ⇒ `failed-precondition` / `review_required`.
 * - A review that IS sent must describe the doc as it is now, whatever the decision: its tax id
 *   (normalised: spaces and `IT` dropped) and legal name (trimmed; case counts) must equal the
 *   stored ones, and the doc must still be a business with a `business` map — else
 *   `failed-precondition` / `stale_review`. A stored value that is not a string never matches;
 *   a review sent for a doc that is (now) an individual is stale too — the company it described
 *   is gone, so nothing the admin saw is being decided.
 * - Without a review, a rejection and an individual's approval pass (rejection never lists
 *   anyone and the company can re-apply).
 *
 * Returns the normalised tax id whose `businessVat` claim the approval must hold (a business
 * being verified), else null. A stored number that matches the review but is no valid tax id
 * can hold no claim ⇒ `failed-precondition` / `claim_missing` (it must never become a doc id).
 */
export function checkBusinessReview(opts: {
  user: Record<string, unknown> | undefined;
  instructor: Record<string, unknown> | undefined;
  decision: "verified" | "rejected";
  expectedReview: unknown;
}): string | null {
  const { user, instructor, decision, expectedReview } = opts;
  const verified = decision === "verified";
  const sent = expectedReview !== undefined && expectedReview !== null;

  if (!isExistingBusiness(user, instructor)) {
    if (sent) throw new HttpsError("failed-precondition", "stale_review");
    return null;
  }
  if (!sent) {
    if (verified) throw new HttpsError("failed-precondition", "review_required");
    return null;
  }

  const review = asReview(expectedReview);
  if (!review) throw new HttpsError("failed-precondition", "review_required");

  const business = businessOf(instructor);
  const storedVat = business?.vatNumber;
  const storedName = business?.legalName;
  const sameVat =
    typeof storedVat === "string" && normalizeVatNumber(storedVat) === normalizeVatNumber(review.vatNumber);
  const sameName = typeof storedName === "string" && storedName.trim() === review.legalName.trim();
  if (!sameVat || !sameName) throw new HttpsError("failed-precondition", "stale_review");

  if (!verified) return null;
  if (typeof storedVat !== "string" || !isValidItalianVat(storedVat)) {
    throw new HttpsError("failed-precondition", "claim_missing");
  }
  return normalizeVatNumber(storedVat);
}

/**
 * The approval of a company must hold the uniqueness claim on its tax id (invariant: one tax id,
 * one holder — D5). `claim` is `businessVat/{vat}` as read in the approval's own transaction
 * (undefined when absent).
 *
 * - No claim ⇒ `failed-precondition` / `claim_missing`: it was released (e.g. after a rejection)
 *   or never taken, and approving now would let a second company take the same number later.
 * - Held by another uid ⇒ `already-exists` / `vat_already_registered`: approving would list two
 *   companies with one tax id.
 */
export function assertApprovalHoldsClaim(claim: Record<string, unknown> | undefined, providerId: string): void {
  if (!claim) throw new HttpsError("failed-precondition", "claim_missing");
  if (claim.uid !== providerId) throw new HttpsError("already-exists", "vat_already_registered");
}

/**
 * Whether updateBusinessTaxId may put `targetVat` on `providerId`'s company (invariant I2: one
 * tax id, one holder). Every input is read in the updateBusinessTaxId transaction:
 * - `claimUid`: the uid of the existing `businessVat/{targetVat}` claim, if any;
 * - `currentVat`: the company's stored `business.vatNumber`;
 * - `carrierIds`: the ids of every instructors doc whose `business.vatNumber` is `targetVat`.
 *
 * - Another account holds the claim ⇒ `already-exists` / `vat_already_registered`.
 * - The number is not changing (stored number, normalised, equals the target): passes — the
 *   admin is correcting legal data, not moving the company. Other carriers are no reason to
 *   refuse then: after the S1 recovery (squatter rejected and released, real owner approved on
 *   the number) the squatter's doc still carries it, and the owner's legal name must stay
 *   correctable. claimBusinessVat still guards the claim itself.
 * - Otherwise no OTHER doc may carry the number, claimed or not — e.g. a rejected company whose
 *   claim was released — else `already-exists` / `vat_carried_by_other`: approving either later
 *   could list two companies with one tax id. The way out is to convert that company to an
 *   individual or change its number first.
 */
export function assertTaxIdAvailable(opts: {
  providerId: string;
  targetVat: string;
  currentVat: unknown;
  claimUid: unknown;
  carrierIds: readonly string[];
}): void {
  const { providerId, targetVat, currentVat, claimUid, carrierIds } = opts;
  if (claimUid !== undefined && claimUid !== providerId) {
    throw new HttpsError("already-exists", "vat_already_registered");
  }
  if (typeof currentVat === "string" && normalizeVatNumber(currentVat) === targetVat) return;
  if (carrierIds.some((id) => id !== providerId)) {
    throw new HttpsError("already-exists", "vat_carried_by_other");
  }
}

/**
 * Whether `value` can be used as a single document id: a non-empty string of at most 128
 * characters (a Firebase uid's maximum) with no `/`, and not `.` or `..`. Anything else would
 * make `collection().doc()` throw (surfacing as `internal`) or address another path.
 */
function isDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !value.includes("/") &&
    value !== "." &&
    value !== ".."
  );
}

/** The uid a `businessVat` claim names, when it can name an instructors doc; else null. */
export function claimHolderUid(claim: Record<string, unknown> | undefined): string | null {
  const uid = claim?.uid;
  return isDocumentId(uid) ? uid : null;
}

/**
 * Refuse to release the claim on `vatNumber` while it is still in use (`failed-precondition` /
 * `claim_in_use`): its holder's instructors doc (`holder`, read in the same transaction) still
 * carries that number in its `business` map and is either not rejected — pending, approved, or
 * a legacy doc with no applicationStatus — or approved by isApproved's definition (a listed
 * legacy doc flagged `providerProfile.isVerified`, whatever its status says). Freeing it then
 * would let another account take the tax id of a live or queued company;
 * convertBusinessToIndividual or updateBusinessTaxId are the routes for those.
 *
 * Releasable: a rejected (and unlisted) company's claim, one whose holder moved to another
 * number, was converted to an individual, or has no instructors doc at all (an abandoned claim).
 * Releasing a rejected company's claim does not make that company approvable again: an approval
 * must hold the claim (assertApprovalHoldsClaim).
 */
export function assertClaimReleasable(vatNumber: string, holder: Record<string, unknown> | undefined): void {
  const business = businessOf(holder);
  const stored = business?.vatNumber;
  const carriesNumber = typeof stored === "string" && normalizeVatNumber(stored) === vatNumber;
  if (carriesNumber && (holder?.applicationStatus !== "rejected" || isApproved(holder))) {
    throw new HttpsError("failed-precondition", "claim_in_use");
  }
}

/** The target provider's uid, or `invalid-argument` / `invalid_provider_id`. */
export function parseProviderId(raw: unknown): string {
  if (!isDocumentId(raw)) throw new HttpsError("invalid-argument", "invalid_provider_id");
  return raw;
}

/** Longest reason accepted for the audit entry. */
const MAX_REASON = 1000;

/**
 * The optional free-text reason an admin gives, stored on the audit entry: absent, null or
 * blank ⇒ undefined; otherwise a trimmed string of at most 1000 characters
 * (`invalid-argument` / `invalid_reason`).
 */
export function parseAdminReason(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new HttpsError("invalid-argument", "invalid_reason");
  const trimmed = raw.trim();
  if (trimmed.length > MAX_REASON) throw new HttpsError("invalid-argument", "invalid_reason");
  return trimmed || undefined;
}

/**
 * The writes that turn a company back into an individual (convertBusinessToIndividual) — e.g.
 * a sole trader who picked "Company" by mistake and would otherwise be locked out of the
 * individual path for good (`business_account_exists`).
 *
 * - `users/{uid}.providerType` and `instructors/{uid}.business` are removed with `remove`
 *   (FieldValue.delete() in production) — never set to null: the B4 rules compare
 *   `'business' in new` with `'business' in old`, so a null map would stay "present" and fail
 *   every later owner edit of the doc. A denormalised `instructors.providerType`, if any, goes
 *   too.
 * - The public `name`/`fullName` become the user's personal `fullName` (trimmed); when the user
 *   has none, the current public name is kept rather than blanked.
 * - Verification is not touched: an approved company stays listed, under the personal name.
 * - `instructor` undefined (no instructors doc) ⇒ no instructors patch.
 *
 * Both patches use top-level keys only and are applied with `update()`.
 */
export function convertToIndividualPatches<Now, Remove>(opts: {
  user: Record<string, unknown>;
  instructor: Record<string, unknown> | undefined;
  now: Now;
  remove: Remove;
}): {
  user: { providerType: Remove; updatedAt: Now };
  instructor: Record<string, Remove | Now | string> | null;
  publicName: string | null;
} {
  const { user, instructor, now, remove } = opts;
  const personal = typeof user.fullName === "string" ? user.fullName.trim() : "";
  const publicName = personal || null;
  return {
    user: { providerType: remove, updatedAt: now },
    instructor: instructor ?
      {
        business: remove,
        ...(instructor.providerType !== undefined ? { providerType: remove } : {}),
        ...(publicName ? { name: publicName, fullName: publicName } : {}),
        updatedAt: now,
      } :
      null,
    publicName,
  };
}

/** A change to a company's admin-owned fields: the tax id always, the rest only when sent. */
export interface TaxIdUpdate {
  vatNumber: string;
  legalName?: string;
  legalForm?: BusinessLegalForm;
  affiliationNumber?: string;
}

/**
 * Validate updateBusinessTaxId's input with the signup validators (businessApplication.ts), so
 * the admin route cannot store anything signup would refuse. `vatNumber` is required
 * (`invalid_vat`); `legalName`, `legalForm` and `affiliationNumber` are changed only when
 * present (not `undefined`) — and then validated exactly as at signup, so `null` resets
 * `legalForm` to 'company' and `affiliationNumber` to "" while a null `legalName` is refused.
 * Other keys are ignored.
 */
export function parseTaxIdUpdate(raw: unknown): TaxIdUpdate {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    vatNumber: parseVatNumber(input.vatNumber),
    ...(input.legalName !== undefined ? { legalName: parseLegalName(input.legalName) } : {}),
    ...(input.legalForm !== undefined ? { legalForm: parseLegalForm(input.legalForm) } : {}),
    ...(input.affiliationNumber !== undefined ?
      { affiliationNumber: parseAffiliationNumber(input.affiliationNumber) } :
      {}),
  };
}

/**
 * The instructors write of updateBusinessTaxId, applied with set(..., { merge: true }): a NESTED
 * `business` map holding only the sent fields, never `"business.x"` keys — merge stores a dotted
 * key as a literal field name, while it merges a nested map field by field, so the display
 * fields (displayName, logo, ...) are left as they are.
 */
export function taxIdUpdatePatch<Now>(
  update: TaxIdUpdate,
  now: Now,
): { business: Partial<BusinessDetails>; updatedAt: Now } {
  return { business: { ...update }, updatedAt: now };
}

/** The admin-owned fields of a `business` map, null where absent — for audit before/after. */
export function reviewedFieldsOf(business: Record<string, unknown> | null | undefined): {
  vatNumber: unknown;
  legalName: unknown;
  legalForm: unknown;
  affiliationNumber: unknown;
} {
  return {
    vatNumber: business?.vatNumber ?? null,
    legalName: business?.legalName ?? null,
    legalForm: business?.legalForm ?? null,
    affiliationNumber: business?.affiliationNumber ?? null,
  };
}

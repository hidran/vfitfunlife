import { HttpsError } from "firebase-functions/v2/https";
import type { BusinessDetails, ProviderType } from "./businessTypes";
import { isValidItalianVat, normalizeVatNumber } from "./vatNumber";

/**
 * Pure pieces of a company applying as a provider (plan 2026-10-04, task B3), kept free of
 * firebase-admin so they can be tested without the emulator — same split as
 * applicationDecision.ts.
 *
 * Every HttpsError raised here carries a stable code as its message (`invalid_vat`,
 * `vat_already_registered`, ...). The client maps that code to localised text; never put a
 * human sentence there.
 */

/** Where the one-business-per-P.IVA claims live (decision D5). Admin SDK only. */
export const BUSINESS_VAT_COLLECTION = "businessVat";

/** Maximum lengths, in characters after trimming. */
export const BUSINESS_FIELD_LIMITS = {
  legalName: 120,
  displayName: 120,
  description: 1000,
  city: 80,
  website: 200,
} as const;

function invalid(code: string): HttpsError {
  return new HttpsError("invalid-argument", code);
}

/**
 * An optional free-text field: absent/null ⇒ "", otherwise a string within `max` after
 * trimming. Anything else is the caller's mistake, reported under `code`.
 */
function optionalText(value: unknown, max: number, code: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw invalid(code);
  const trimmed = value.trim();
  if (trimmed.length > max) throw invalid(code);
  return trimmed;
}

/**
 * A public website, or null for none. Only http(s): it is rendered as a link on the company's
 * public page, so `javascript:`, `data:` and friends must never get stored.
 */
function parseWebsite(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw invalid("invalid_website");
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > BUSINESS_FIELD_LIMITS.website) throw invalid("invalid_website");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw invalid("invalid_website");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    throw invalid("invalid_website");
  }
  return trimmed;
}

/**
 * Validate and normalise what the signup form sent for a company.
 *
 * - `vatNumber`: must pass the B1 P.IVA check; stored as bare 11 digits (no spaces, no `IT`).
 * - `legalName`: required. `displayName`: defaults to the legal name when omitted or blank.
 * - Every text field is trimmed and length-capped (BUSINESS_FIELD_LIMITS).
 * - `description` and `city` are always present ("" when not given) and `website` is always
 *   present (null when not given). The result is merged into `instructors/{uid}.business`
 *   with set(merge), which merges nested maps field by field — writing every field each time
 *   means a re-apply replaces what the applicant changed instead of keeping a stale value.
 */
export function validateBusinessInput(raw: unknown): BusinessDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw invalid("invalid_business");
  }
  const input = raw as Record<string, unknown>;

  if (typeof input.vatNumber !== "string" || !isValidItalianVat(input.vatNumber)) {
    throw invalid("invalid_vat");
  }
  const vatNumber = normalizeVatNumber(input.vatNumber);

  if (typeof input.legalName !== "string") throw invalid("invalid_business_name");
  const legalName = input.legalName.trim();
  if (!legalName || legalName.length > BUSINESS_FIELD_LIMITS.legalName) {
    throw invalid("invalid_business_name");
  }

  const displayName =
    optionalText(input.displayName, BUSINESS_FIELD_LIMITS.displayName, "invalid_business_name") ||
    legalName;

  return {
    legalName,
    vatNumber,
    displayName,
    description: optionalText(
      input.description,
      BUSINESS_FIELD_LIMITS.description,
      "invalid_business_description",
    ),
    website: parseWebsite(input.website),
    city: optionalText(input.city, BUSINESS_FIELD_LIMITS.city, "invalid_business_city"),
  };
}

/** The account type asked for. Absent means individual, so existing callers are unchanged. */
export function parseProviderType(raw: unknown): ProviderType {
  if (raw === undefined || raw === null) return "individual";
  if (raw === "individual" || raw === "business") return raw;
  throw invalid("invalid_provider_type");
}

/**
 * Whether this account is already a business — then it may only re-apply as one.
 *
 * `users/{uid}.providerType` is the signal this relies on: the owner CANNOT write it (it is in
 * neither isValidUserCreate nor isValidUserUpdate in firestore.rules), so only this callable
 * sets it and a company cannot clear it to slip through the individual (auto-approvable) path.
 * The guard is safe because of that users-side rule.
 *
 * The instructors doc's `business` map is checked too, but today it is only a secondary
 * signal: until task B4 locks it, the owner can create, edit or remove `instructors.business`
 * from the client.
 */
export function isExistingBusiness(
  user: Record<string, unknown> | undefined,
  instructor: Record<string, unknown> | undefined,
): boolean {
  if (user?.providerType === "business") return true;
  const business = instructor?.business;
  return !!business && typeof business === "object";
}

/**
 * Refuse an individual (re-)application from an account that is already a business: it would
 * otherwise be auto-approved and listed without its P.IVA being checked (D2), or have its
 * company name replaced by a person's. applyAsProvider checks this up front, and
 * commitProviderDecision checks it again against its own reads on the self-apply path.
 */
export function assertNotExistingBusiness(
  user: Record<string, unknown> | undefined,
  instructor: Record<string, unknown> | undefined,
): void {
  if (isExistingBusiness(user, instructor)) {
    throw new HttpsError("failed-precondition", "business_account_exists");
  }
}

/**
 * The company-specific fields of the pending instructors write. The company's public name is
 * what every card, search token and booking screen shows, so it becomes `name`/`fullName`.
 *
 * `business` is a nested map, never `"business.x"` keys: this patch is applied with
 * set(..., { merge: true }), which stores a dotted key as a literal field name (see
 * instructorVerificationPatch).
 */
export function buildBusinessInstructorPatch(business: BusinessDetails): {
  name: string;
  fullName: string;
  business: BusinessDetails;
} {
  return {
    name: business.displayName,
    fullName: business.displayName,
    business: { ...business },
  };
}

/** The slice of a Firestore transaction claimBusinessVat needs, so tests can pass a fake. */
export interface VatClaimTransaction<Ref> {
  get(ref: Ref): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  create(ref: Ref, data: Record<string, unknown>): unknown;
  delete(ref: Ref): unknown;
}

/** Approved by either signal — applicationStatus, or the flag legacy docs carry alone. */
function isApproved(instructor: Record<string, unknown>): boolean {
  const profile = instructor.providerProfile as Record<string, unknown> | undefined;
  return instructor.applicationStatus === "verified" || profile?.isVerified === true;
}

/**
 * Claim `vatNumber` for `uid` inside the caller's transaction (decision D5: one business per
 * P.IVA). Performs only reads until every check has passed, then only writes, so the caller
 * can follow it with its own writes — Firestore needs every read first.
 *
 * `instructor` is the caller's instructors doc as read in this SAME transaction (undefined if
 * none); its `business.vatNumber` is the P.IVA the account currently holds.
 *
 * - unclaimed ⇒ creates `{ uid, createdAt }`;
 * - claimed by this same account ⇒ an idempotent re-apply: the claim is left as it is;
 * - claimed by anyone else ⇒ `already-exists` / `vat_already_registered`;
 * - a different P.IVA than the one already held: an approved business is refused with
 *   `failed-precondition` / `vat_change_not_allowed` (D6: legalName/vatNumber are admin-owned
 *   after approval); a pending or rejected one moves, and the old claim is released in the
 *   same transaction — only if that claim is this account's, since until B4 the owner can
 *   edit `instructors.business.vatNumber` and point it at someone else's P.IVA. Without the
 *   release, one account could hold any number of P.IVAs by re-applying.
 *
 * Rejection itself does not release a claim; an admin frees one from the back office (B8).
 */
export async function claimBusinessVat<Ref>(
  tx: VatClaimTransaction<Ref>,
  opts: {
    uid: string;
    vatNumber: string;
    instructor: Record<string, unknown> | undefined;
    claimRef: (vatNumber: string) => Ref;
    now: unknown;
  },
): Promise<{ claim: "claimed" | "already-yours"; released: string | null }> {
  const { uid, vatNumber, instructor, claimRef, now } = opts;

  const held = (instructor?.business as Record<string, unknown> | undefined)?.vatNumber;
  const previousVat = typeof held === "string" && held && held !== vatNumber ? held : null;
  if (previousVat && instructor && isApproved(instructor)) {
    throw new HttpsError("failed-precondition", "vat_change_not_allowed");
  }

  // Reads.
  const newRef = claimRef(vatNumber);
  const newClaim = await tx.get(newRef);
  const oldRef = previousVat ? claimRef(previousVat) : null;
  const oldClaim = oldRef ? await tx.get(oldRef) : null;

  // Checks.
  const newOwner = newClaim.exists ? newClaim.data()?.uid : undefined;
  if (newClaim.exists && newOwner !== uid) {
    throw new HttpsError("already-exists", "vat_already_registered");
  }
  const releaseOld = !!(oldRef && oldClaim?.exists && oldClaim.data()?.uid === uid);

  // Writes.
  if (releaseOld && oldRef) tx.delete(oldRef);
  if (!newClaim.exists) tx.create(newRef, { uid, createdAt: now });

  return {
    claim: newClaim.exists ? "already-yours" : "claimed",
    released: releaseOld ? previousVat : null,
  };
}

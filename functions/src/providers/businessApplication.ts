import { HttpsError } from "firebase-functions/v2/https";
import type { BusinessDetails, BusinessLegalForm, ProviderType } from "./businessTypes";
import { isValidItalianVat, normalizeVatNumber } from "./vatNumber";

/**
 * Pure pieces of a company applying as a provider (plan 2026-10-04, tasks B3 and B3b), kept
 * free of firebase-admin so they can be tested without the emulator — same split as
 * applicationDecision.ts.
 *
 * Every HttpsError raised here carries a stable code as its message (`invalid_vat`,
 * `vat_already_registered`, ...). The client maps that code to localised text; never put a
 * human sentence there.
 */

/**
 * Where the one-business-per-tax-id claims live (decision D5), keyed by the P.IVA / codice
 * fiscale. Admin SDK only.
 */
export const BUSINESS_VAT_COLLECTION = "businessVat";

/** Maximum lengths, in characters after trimming. */
export const BUSINESS_FIELD_LIMITS = {
  legalName: 120,
  displayName: 120,
  description: 1000,
  city: 80,
  website: 200,
  affiliationNumber: 40,
} as const;

/** The legal forms a business may declare (B3b). The first is the default. */
export const BUSINESS_LEGAL_FORMS: readonly BusinessLegalForm[] = [
  "company",
  "sole_trader",
  "association",
  "other",
];

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

/** The declared legal form: absent/null ⇒ 'company'; anything outside the list is refused. */
function parseLegalForm(value: unknown): BusinessLegalForm {
  if (value === undefined || value === null) return BUSINESS_LEGAL_FORMS[0];
  const known = BUSINESS_LEGAL_FORMS.find((form) => form === value);
  if (!known) throw invalid("invalid_legal_form");
  return known;
}

/**
 * Validate and normalise what the signup form sent for a company or association.
 *
 * - `vatNumber`: the tax id — a P.IVA, or an association's codice fiscale (D3; both share the
 *   B1 checksum). Stored as bare 11 digits (no spaces, no `IT`).
 * - `legalName`: required. `displayName`: defaults to the legal name when omitted or blank.
 * - `legalForm`: one of BUSINESS_LEGAL_FORMS, 'company' when omitted (`invalid_legal_form`).
 * - `affiliationNumber`: optional CONI / RASD / ente di promozione registration
 *   (`invalid_affiliation_number`); informational, for the admin reviewing the application.
 * - Every text field is trimmed and length-capped (BUSINESS_FIELD_LIMITS).
 * - `legalForm`, `affiliationNumber`, `description` and `city` are always present ("" when not
 *   given, 'company' for the form) and `website` is always present (null when not given). The
 *   result is merged into `instructors/{uid}.business` with set(merge), which merges nested
 *   maps field by field — writing every field each time means a re-apply replaces what the
 *   applicant changed instead of keeping a stale value.
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
    legalForm: parseLegalForm(input.legalForm),
    affiliationNumber: optionalText(
      input.affiliationNumber,
      BUSINESS_FIELD_LIMITS.affiliationNumber,
      "invalid_affiliation_number",
    ),
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
 * otherwise be auto-approved and listed without its tax id (P.IVA / codice fiscale) being
 * checked (D2), or have its company name replaced by a person's. applyAsProvider checks this up
 * front, and commitProviderDecision checks it again against its own reads on the self-apply path.
 */
export function assertNotExistingBusiness(
  user: Record<string, unknown> | undefined,
  instructor: Record<string, unknown> | undefined,
): void {
  if (isExistingBusiness(user, instructor)) {
    throw new HttpsError("failed-precondition", "business_account_exists");
  }
}

/** Approved by either signal — applicationStatus, or the flag legacy docs carry alone. */
function isApproved(instructor: Record<string, unknown> | undefined): boolean {
  const profile = instructor?.providerProfile as Record<string, unknown> | undefined;
  return instructor?.applicationStatus === "verified" || profile?.isVerified === true;
}

/**
 * Refuse a business (re-)application from an account that is already an APPROVED business
 * (`failed-precondition` / `business_already_approved`). Re-applying would drop a listed
 * company back to pending — de-listing it — and the re-apply after that could change its tax
 * id. Changes to an approved company go through its profile (display fields, B6) or an admin
 * (B8).
 *
 * `user` and `instructor` must be read inside the business transaction. "Approved" is the
 * instructors doc's applicationStatus or legacy isVerified flag, neither of which the owner can
 * write. A first-time applicant, a pending or rejected business, and a verified INDIVIDUAL
 * applying as a business (plan §5: allowed, drops to pending) all pass.
 */
export function assertNotApprovedBusiness(
  user: Record<string, unknown> | undefined,
  instructor: Record<string, unknown> | undefined,
): void {
  if (isExistingBusiness(user, instructor) && isApproved(instructor)) {
    throw new HttpsError("failed-precondition", "business_already_approved");
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

/**
 * Claim the tax id `vatNumber` (P.IVA / codice fiscale) for `uid` inside the caller's
 * transaction (decision D5: one business per tax id). Performs only reads until every check has
 * passed, then only writes, so the caller can follow it with its own writes — Firestore needs
 * every read first.
 *
 * - `instructor`: the caller's instructors doc as read in this SAME transaction (undefined if
 *   none) — only its approval state is used.
 * - `heldVatNumbers`: the ids of every claim whose `uid` is the caller, from a
 *   `businessVat where uid == caller` query read in this SAME transaction.
 *
 * Outcomes:
 * - unclaimed ⇒ creates `{ uid, createdAt }`;
 * - claimed by this same account ⇒ an idempotent re-apply: the claim is left as it is;
 * - claimed by anyone else ⇒ `already-exists` / `vat_already_registered`, and nothing is written;
 * - every OTHER claim the account holds is released in the same transaction, so one account
 *   never holds more than one tax id however often it re-applies;
 * - an approved account holding another claim is refused with `failed-precondition` /
 *   `vat_change_not_allowed` (D6: legalName/vatNumber are admin-owned after approval).
 *   applyAsProvider already refuses an approved business before this (business_already_approved);
 *   this is the backstop that keeps the release above from ever freeing an approved company's
 *   claim.
 *
 * The account's `instructors.business.vatNumber` is deliberately NOT used to find what it holds:
 * until B4 the owner can rewrite it from the client — to another company's number, or to
 * something like "a/b" that is not even a valid document id (Firestore would throw, surfacing as
 * `internal`). The uid query is the authoritative record, and it never offers someone else's
 * claim.
 *
 * Rejection itself does not release a claim; an admin frees one from the back office (B8).
 */
export async function claimBusinessVat<Ref>(
  tx: VatClaimTransaction<Ref>,
  opts: {
    uid: string;
    vatNumber: string;
    instructor: Record<string, unknown> | undefined;
    heldVatNumbers: readonly string[];
    claimRef: (vatNumber: string) => Ref;
    now: unknown;
  },
): Promise<{ claim: "claimed" | "already-yours"; released: string[] }> {
  const { uid, vatNumber, instructor, heldVatNumbers, claimRef, now } = opts;

  const others = [...new Set(heldVatNumbers)].filter((held) => held !== vatNumber);
  if (others.length > 0 && isApproved(instructor)) {
    throw new HttpsError("failed-precondition", "vat_change_not_allowed");
  }

  // Reads.
  const newRef = claimRef(vatNumber);
  const newClaim = await tx.get(newRef);

  // Checks.
  const newOwner = newClaim.exists ? newClaim.data()?.uid : undefined;
  if (newClaim.exists && newOwner !== uid) {
    throw new HttpsError("already-exists", "vat_already_registered");
  }

  // Writes.
  for (const held of others) tx.delete(claimRef(held));
  if (!newClaim.exists) tx.create(newRef, { uid, createdAt: now });

  return {
    claim: newClaim.exists ? "already-yours" : "claimed",
    released: others,
  };
}

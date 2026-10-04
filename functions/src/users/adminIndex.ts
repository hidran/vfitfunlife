/**
 * Derived "admin index" fields on `users/{uid}` — the fields the admin users/providers lists
 * filter on server-side, so a page is one indexed Firestore query instead of a whole-collection
 * read filtered in the browser.
 *
 * - `searchTokens`: lowercased, accent-free prefixes of the name (whole and per word), the email
 *   (whole and per local-part word) and the phone digits (with and without the +39 prefix).
 *   Firestore has no substring search; `where('searchTokens', 'array-contains', q)` is a prefix
 *   search over exactly those strings.
 * - `adminHidden`: soft-deleted or seeded demo account (see hiddenAccountKind in
 *   src/lib/firebase/admin.ts). Every admin list query carries `adminHidden == false/true`.
 * - `providerVerification`: 'verified' | 'pending' | 'rejected' for providers and provider
 *   applicants, null for everyone else — the same answer as providerVerificationState /
 *   needsVerificationDecision, so the providers list's pending filter and the verification
 *   queue count the same people.
 * - `providerKind`: 'business' | 'individual' for the same people (null for everyone else),
 *   from `providerType` — the providers list's type filter. It has to be derived: individuals
 *   carry no `providerType` at all, and no Firestore filter matches an absent field.
 *
 * Written only by the `onUserWriteAdminIndex` trigger (functions/src/users/onUserWriteAdminIndex.ts)
 * and the backfill script (scripts/backfill-search-tokens.mjs): the Firestore rules' allowlists
 * don't let a user write these fields, and the trigger recomputes them on every write anyway, so
 * a tampered value never survives.
 *
 * Two byte-identical copies: `functions/src/users/adminIndex.ts` (trigger, backfill) and
 * `src/lib/admin/adminIndex.ts` (the client builds its search key with the same normalization).
 * `src/` and `functions/` are separate TypeScript projects with no shared module, so both copies
 * are deliberately import-free and `src/lib/admin/adminIndex.test.ts` fails if they diverge.
 */

/** Longest prefix stored; a longer query is truncated to this length before querying. */
export const SEARCH_TOKEN_MAX_LENGTH = 20;
/** Hard cap on tokens per document (index entries stay far below Firestore's 40k/doc limit). */
export const SEARCH_TOKENS_CAP = 200;
/** Shortest phone prefix stored — one or two digits would match nearly everyone. */
export const PHONE_TOKEN_MIN_LENGTH = 3;

export type ProviderVerification = "verified" | "pending" | "rejected";
export type ProviderKind = "individual" | "business";

export interface AdminIndexSource {
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
  role?: unknown;
  providerStatus?: unknown;
  providerType?: unknown;
  providerProfile?: { isVerified?: unknown } | null;
  isVerified?: unknown;
  isDeleted?: unknown;
  deletedAt?: unknown;
}

export interface AdminIndexFields {
  searchTokens: string[];
  adminHidden: boolean;
  providerVerification: ProviderVerification | null;
  providerKind: ProviderKind | null;
}

const DEMO_EMAIL_DOMAIN = "@demo.vfit";

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Lowercase, strip accents, keep only [a-z0-9@], collapse everything else to single spaces. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, " ")
    .trim();
}

const digitsOf = (value: string): string => value.replace(/\D+/g, "");

/** Phone digits as stored, plus the national number when the number carries Italy's +39/0039. */
function phoneVariants(phone: string): string[] {
  const trimmed = phone.trim();
  const digits = digitsOf(trimmed);
  if (!digits) return [];
  const variants = [digits];
  if (trimmed.startsWith("+39") && digits.startsWith("39")) variants.push(digits.slice(2));
  else if (digits.startsWith("0039")) variants.push(digits.slice(4));
  return variants;
}

function addPrefixes(out: Set<string>, value: string, minLength: number): void {
  const capped = value.slice(0, SEARCH_TOKEN_MAX_LENGTH);
  for (let i = minLength; i <= capped.length; i++) {
    const prefix = capped.slice(0, i);
    // A prefix ending in a space can never equal a normalized (trimmed) query.
    if (!prefix.endsWith(" ")) out.add(prefix);
  }
}

/** Is this search input a phone number rather than a name/email? */
export function isPhoneQuery(raw: string): boolean {
  return /^[+\d\s().\-/]+$/.test(raw.trim()) && digitsOf(raw).length >= PHONE_TOKEN_MIN_LENGTH;
}

/**
 * The single token a search box input is looked up by, or "" when there is nothing to search
 * for. Same normalization as computeSearchTokens, so a prefix of what was stored always matches.
 */
export function normalizeSearchQuery(raw: string): string {
  if (isPhoneQuery(raw)) {
    const trimmed = raw.trim();
    let digits = digitsOf(trimmed);
    // "+39 333…" and "333…" both find the national number.
    if (trimmed.startsWith("+39") && digits.startsWith("39")) digits = digits.slice(2);
    else if (digits.startsWith("0039")) digits = digits.slice(4);
    return digits.slice(0, SEARCH_TOKEN_MAX_LENGTH);
  }
  return normalizeSearchText(raw).slice(0, SEARCH_TOKEN_MAX_LENGTH).trim();
}

export function computeSearchTokens(record: AdminIndexSource): string[] {
  const out = new Set<string>();

  const name = normalizeSearchText(str(record.fullName));
  if (name) {
    addPrefixes(out, name, 1);
    for (const word of name.split(" ")) addPrefixes(out, word, 1);
  }

  const email = normalizeSearchText(str(record.email));
  if (email) {
    addPrefixes(out, email, 1);
    const localPart = email.split("@")[0];
    for (const word of localPart.split(" ")) addPrefixes(out, word, 1);
  }

  for (const digits of phoneVariants(str(record.phone))) {
    addPrefixes(out, digits, PHONE_TOKEN_MIN_LENGTH);
  }

  return [...out].slice(0, SEARCH_TOKENS_CAP);
}

/** Soft-deleted or seeded demo account — mirrors hiddenAccountKind in src/lib/firebase/admin.ts. */
export function isAdminHidden(id: string, record: AdminIndexSource): boolean {
  if (record.isDeleted === true || Boolean(record.deletedAt)) return true;
  const email = str(record.email).toLowerCase();
  const isSeedId = id.startsWith("provider_") || id.startsWith("customer_");
  return email.endsWith(DEMO_EMAIL_DOMAIN) || isSeedId;
}

/**
 * Where a provider or applicant stands — mirrors providerVerificationState (and so
 * needsVerificationDecision) in src/. null: not a provider and never applied.
 */
export function providerVerificationOf(record: AdminIndexSource): ProviderVerification | null {
  if (record.providerStatus === "rejected") return "rejected";
  if (record.providerStatus === "pending") return "pending";
  if (record.role !== "provider") return null;
  const verified = record.providerProfile?.isVerified === true || record.isVerified === true;
  return verified ? "verified" : "pending";
}

/**
 * Company or individual, for providers and applicants only (null whenever providerVerification
 * is null). `users.providerType` is set by applyAsProvider and removed by
 * convertBusinessToIndividual; the Firestore rules keep it off every owner allowlist, so the
 * value can be trusted here. Anything but 'business' (absent included) is an individual.
 */
export function providerKindOf(record: AdminIndexSource): ProviderKind | null {
  if (providerVerificationOf(record) === null) return null;
  return record.providerType === "business" ? "business" : "individual";
}

export function computeAdminIndex(id: string, record: AdminIndexSource): AdminIndexFields {
  return {
    searchTokens: computeSearchTokens(record),
    adminHidden: isAdminHidden(id, record),
    providerVerification: providerVerificationOf(record),
    providerKind: providerKindOf(record),
  };
}

const sameTokens = (a: unknown, b: string[]): boolean =>
  Array.isArray(a) && a.length === b.length && a.every((token, i) => token === b[i]);

/**
 * The fields to write so the stored document matches its derived index, or null when it
 * already does. Returning null for an up-to-date document is what stops the trigger from
 * re-firing itself forever: its own write lands here and produces no further write.
 */
export function adminIndexPatch(
  id: string,
  record: AdminIndexSource & Record<string, unknown>
): Partial<AdminIndexFields> | null {
  const next = computeAdminIndex(id, record);
  const patch: Partial<AdminIndexFields> = {};
  if (!sameTokens(record.searchTokens, next.searchTokens)) patch.searchTokens = next.searchTokens;
  if (record.adminHidden !== next.adminHidden) patch.adminHidden = next.adminHidden;
  // `?? null`: an absent field and a stored null both mean "not a provider".
  if ((record.providerVerification ?? null) !== next.providerVerification ||
    !("providerVerification" in record)) {
    patch.providerVerification = next.providerVerification;
  }
  // Same rule; a document indexed before this field existed gets it on its next write.
  if ((record.providerKind ?? null) !== next.providerKind || !("providerKind" in record)) {
    patch.providerKind = next.providerKind;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * `searchTerms` on `instructors/{id}` — what the customer's "Book a service" search box looks
 * providers up by, so a text search is one indexed query instead of the first 50 providers by
 * document id filtered in the browser (which never reached a provider whose id sorts late: a
 * brand-new trainer could not be found by their own name).
 *
 * The terms are lowercased, accent-free prefixes, whole and per word, of:
 *  - the provider's name,
 *  - their specialties (legacy display labels),
 *  - their category ids, with `_` read as a space (`personal_training` → "personal training"),
 *  - for a company, `business.displayName` and `business.legalName`, so a search for the legal
 *    name finds it although only the display name is ever shown. The legal name is public data
 *    anyway (the instructors doc is readable); the tax id and affiliation number are NOT indexed.
 *
 * `/instructors` is publicly readable, so unlike users' `searchTokens` nothing private (email,
 * phone) is ever indexed here.
 *
 * Written only by the `onInstructorWriteSearchIndex` trigger and scripts/backfill-provider-search.mjs.
 * The client normalizes its query with `normalizeSearchText` from src/lib/admin/adminIndex.ts
 * (see providerSearchKey in src/lib/firebookings.ts), the same normalization as below, so a
 * prefix of what was stored always matches.
 *
 * Deliberately import-free (the backfill script loads this file directly with Node's type
 * stripping, which can't resolve extensionless imports). `normalizeSearchText` and
 * `SEARCH_TOKEN_MAX_LENGTH` are copies of ../users/adminIndex.ts; searchIndex.test.ts fails
 * if they diverge.
 */

/** Longest prefix stored; the client truncates its query to the same length. */
export const SEARCH_TOKEN_MAX_LENGTH = 20;

/** Lowercase, strip accents, keep only [a-z0-9@], collapse everything else to single spaces. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, " ")
    .trim();
}

/** Hard cap on terms per document; the name's terms come first so they always survive it. */
export const PROVIDER_SEARCH_TERMS_CAP = 300;

export interface ProviderSearchSource {
  fullName?: unknown;
  providerProfile?: { specialties?: unknown } | null;
  categoryIds?: unknown;
  business?: { displayName?: unknown; legalName?: unknown } | null;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

function addPrefixes(out: Set<string>, value: string): void {
  const capped = value.slice(0, SEARCH_TOKEN_MAX_LENGTH);
  for (let i = 1; i <= capped.length; i++) {
    const prefix = capped.slice(0, i);
    // A prefix ending in a space can never equal a normalized (trimmed) query.
    if (!prefix.endsWith(" ")) out.add(prefix);
  }
}

function addPhrase(out: Set<string>, raw: string): void {
  const phrase = normalizeSearchText(raw);
  if (!phrase) return;
  addPrefixes(out, phrase);
  for (const word of phrase.split(" ")) addPrefixes(out, word);
}

export function computeProviderSearchTerms(record: ProviderSearchSource): string[] {
  const out = new Set<string>();
  if (typeof record.fullName === "string") addPhrase(out, record.fullName);
  // Same plain-object guard as the client reader: anything else is ignored.
  const business = record.business;
  if (business && typeof business === "object" && !Array.isArray(business)) {
    if (typeof business.displayName === "string") addPhrase(out, business.displayName);
    if (typeof business.legalName === "string") addPhrase(out, business.legalName);
  }
  for (const specialty of strings(record.providerProfile?.specialties)) addPhrase(out, specialty);
  for (const id of strings(record.categoryIds)) addPhrase(out, id.replace(/_/g, " "));
  return [...out].slice(0, PROVIDER_SEARCH_TERMS_CAP);
}

const sameTerms = (a: unknown, b: string[]): boolean =>
  Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The write that brings `searchTerms` in line with the document, or null when it already is —
 * the idempotence that stops the trigger re-firing on its own write forever.
 */
export function providerSearchPatch(data: Record<string, unknown>): { searchTerms: string[] } | null {
  const searchTerms = computeProviderSearchTerms(data);
  return sameTerms(data.searchTerms, searchTerms) ? null : { searchTerms };
}

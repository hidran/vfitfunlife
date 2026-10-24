/**
 * URL-safe slugs, ported from functions/src/providers/businessVenue.ts (which in turn is the
 * seeders' toSlug). A slug is a display/URL label, never a unique key: two venues may share one.
 */

/** Letters NFD does not decompose into base + accent, so they would otherwise be dropped. */
const LETTER_MAP: Record<string, string> = { ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd' };

/** Kebab-case ASCII: lower-cased, accents stripped, every other run of characters a single dash. */
export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ßøæœłđ]/g, (c) => LETTER_MAP[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Seeders slug the name alone; admin- and business-created venues append the city so same-named venues differ. */
export function venueSlug(name: string, city: string): string {
  return toSlug([name, city].filter(Boolean).join(' ')) || 'venue';
}

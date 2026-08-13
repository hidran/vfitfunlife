import type { AppLocale } from './locale';
import type { Section } from '@/contexts/SectionContext';

/**
 * The service taxonomy: one self-referencing collection, two levels.
 *
 * Replaces four overlapping systems (userTypes, the old flat serviceCategories, two
 * hardcoded AVAILABLE_SPECIALTIES arrays, and the userTypeForSpecialty heuristic).
 *
 * Spec: docs/superpowers/specs/2026-08-13-service-taxonomy-design.md
 */

/** As stored in Firestore. */
export interface ServiceCategoryDoc {
  /** null for a top-level group. Only leaves are selectable on a service. */
  parentId: string | null;
  /**
   * Per-locale labels. A map rather than i18n keys because the catalogue is
   * admin-authored — an admin cannot add a message key at runtime, which is why every
   * category name used to render in Italian regardless of the viewer's locale.
   */
  names: Record<AppLocale, string>;
  icon: string;
  /**
   * A category may belong to several sections: Nutrizione is legitimately fitness AND
   * wellness, and a single value would force a false choice. It also prevents a
   * regression — a wellness-only tag would drop Massaggio/Fisioterapia out of search the
   * moment pilot mode hides VLife.
   */
  sections: Section[];
  order: number;
  isActive: boolean;
}

/** Resolved for one locale, which is what every consumer actually renders. */
export interface ServiceCategory {
  id: string;
  parentId: string | null;
  name: string;
  icon: string;
  sections: Section[];
  order: number;
  isActive: boolean;
}

export interface ServiceCategoryGroup {
  group: ServiceCategory;
  leaves: ServiceCategory[];
}

export function isLeaf(c: ServiceCategory): boolean {
  return c.parentId !== null;
}

/** Resolve a document's label, falling back through Italian to the id. */
export function localizedName(
  id: string,
  names: Partial<Record<AppLocale, string>> | undefined,
  locale: AppLocale
): string {
  return names?.[locale] || names?.it || id;
}

/**
 * A leaf plus every ancestor.
 *
 * Denormalizing ancestry onto providers and services is what lets one
 * `array-contains` filter at any depth of the tree. Expanding a group into its leaves at
 * query time would meet `array-contains-any`'s 30-value ceiling exactly as the catalogue
 * grows, which is the case this is designed for.
 */
export function withAncestors(
  categoryId: string,
  byId: Map<string, { parentId: string | null }>
): string[] {
  const out: string[] = [];
  let cursor: string | null = categoryId;
  // The bound is a cycle guard: a self-referencing collection edited by hand can form one,
  // and an unbounded walk here would hang a Cloud Function rather than fail.
  for (let depth = 0; cursor && depth < 10; depth++) {
    if (out.includes(cursor)) break;
    out.push(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return out;
}

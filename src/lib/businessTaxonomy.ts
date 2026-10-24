import type { BusinessLegalForm, BusinessVenueType } from '@/types/firebase';

/**
 * The two enumerations of a business account, on their own so that the public reader
 * (publicBusiness.ts, on the /home and /booking search path) does not carry the whole of
 * businessDetails.ts (labels, limits, form errors, form helpers) for one array. businessDetails
 * re-exports them; the form schema (businessDetailsSchema.ts) uses them as its enums.
 */

/**
 * The legal forms offered, in display order. The first is the default (as on the server). Also
 * the schema's enum (businessDetailsSchema.ts), so the list and the validation can't drift apart.
 */
export const BUSINESS_LEGAL_FORMS = [
  'company',
  'sole_trader',
  'association',
  'other',
] as const satisfies readonly BusinessLegalForm[];

/**
 * The premises a company can declare (B12): any venue type of the platform, or 'none' (no
 * fixed premises, so approval creates no venue). A party venue, a beauty salon or a spa
 * registers like a gym or a school; only gym, school and studio host courses. The first is
 * the default (as on the server). Mirrors functions' BUSINESS_VENUE_TYPES.
 */
export const BUSINESS_VENUE_TYPES = [
  'gym', 'wellness_center', 'spa', 'beauty_salon', 'school', 'studio', 'outdoor_space', 'event_space', 'none',
] as const satisfies readonly BusinessVenueType[];

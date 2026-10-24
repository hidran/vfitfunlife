import { z } from 'zod';
import type { MessageKey } from '@/i18n/messages';
import { isValidItalianVat } from '@/lib/vatNumber';
import {
  BUSINESS_FIELD_LIMITS,
  BUSINESS_FORM_ERRORS,
  BUSINESS_LEGAL_FORMS,
  BUSINESS_VENUE_TYPES,
  normalizeWebsite,
} from '@/lib/businessDetails';

/**
 * The zod schemas of the business details form (signup and edit).
 *
 * Kept apart from `businessDetails.ts` on purpose: that module's constants and pure helpers
 * are read on hot paths (`publicBusiness` → `firebookings` → /home, /booking; the admin
 * screens), and zod v4 with its locale packs is ~265 KB raw. Only the form itself validates,
 * so only the form (and its tests) import this module; everything else stays zod-free.
 */

const optionalText = (max: number, message: MessageKey) =>
  z.string().refine((v) => v.trim().length <= max, { message });

/** The per-field checks, without the rules that span fields (see businessDetailsSchema). */
const businessFieldsSchema = z.object({
  legalName: z
    .string()
    .refine((v) => v.trim().length > 0, { message: BUSINESS_FORM_ERRORS.legalNameRequired })
    .refine((v) => v.trim().length <= BUSINESS_FIELD_LIMITS.legalName, {
      message: BUSINESS_FORM_ERRORS.nameInvalid,
    }),
  vatNumber: z
    .string()
    .refine((v) => v.trim().length > 0, { message: BUSINESS_FORM_ERRORS.vatRequired })
    .refine((v) => v.trim().length === 0 || isValidItalianVat(v), {
      message: BUSINESS_FORM_ERRORS.vatInvalid,
    }),
  legalForm: z.enum(BUSINESS_LEGAL_FORMS, { message: BUSINESS_FORM_ERRORS.legalFormInvalid }),
  affiliationNumber: optionalText(BUSINESS_FIELD_LIMITS.affiliationNumber, BUSINESS_FORM_ERRORS.affiliationInvalid),
  displayName: optionalText(BUSINESS_FIELD_LIMITS.displayName, BUSINESS_FORM_ERRORS.nameInvalid),
  venueType: z.enum(BUSINESS_VENUE_TYPES, { message: BUSINESS_FORM_ERRORS.venueTypeInvalid }),
  address: optionalText(BUSINESS_FIELD_LIMITS.address, BUSINESS_FORM_ERRORS.addressInvalid),
  city: optionalText(BUSINESS_FIELD_LIMITS.city, BUSINESS_FORM_ERRORS.cityInvalid),
  // Two checks, at most one fails: a malformed address is "invalid", a well-formed one longer
  // than the cap (counting an added `https://`) is "too long".
  website: z
    .string()
    .refine((v) => normalizeWebsite(v) !== null, { message: BUSINESS_FORM_ERRORS.websiteInvalid })
    .refine((v) => (normalizeWebsite(v) ?? '').length <= BUSINESS_FIELD_LIMITS.website, {
      message: BUSINESS_FORM_ERRORS.websiteTooLong,
    }),
  description: optionalText(BUSINESS_FIELD_LIMITS.description, BUSINESS_FORM_ERRORS.descriptionInvalid),
});

/**
 * Validation of the form. Messages are i18n keys (BUSINESS_FORM_ERRORS); the form translates
 * them. No transforms: the values stay exactly what was typed, `toBusinessApplication`
 * normalises them.
 *
 * A company with premises (any venue type but 'none') needs an address and a city: they are
 * what the venue created on approval is built from. The server enforces the same rule
 * (`business_address_required`, `business_city_required`) and treats a venue type the client
 * omitted as 'none'.
 */
export const businessDetailsSchema = businessFieldsSchema.superRefine((values, ctx) => {
  if (values.venueType === 'none') return;
  if (!values.address.trim()) {
    ctx.addIssue({ code: 'custom', path: ['address'], message: BUSINESS_FORM_ERRORS.addressRequired });
  }
  if (!values.city.trim()) {
    ctx.addIssue({ code: 'custom', path: ['city'], message: BUSINESS_FORM_ERRORS.cityRequired });
  }
});

/**
 * The schema of the form in edit mode. The reviewed fields are shown read-only and never
 * sent, so they are not validated (an older document may hold values today's signup rules
 * would refuse). The public name becomes required: it is what every card shows, and the rules
 * refuse a blank one.
 */
export const businessEditSchema = businessFieldsSchema.extend({
  legalName: z.string(),
  vatNumber: z.string(),
  affiliationNumber: z.string(),
  // Shown read-only (reviewed with the application); never sent, so never checked.
  venueType: z.enum(BUSINESS_VENUE_TYPES).or(z.literal('')),
  address: z.string(),
  displayName: z
    .string()
    .refine((v) => v.trim().length > 0, { message: BUSINESS_FORM_ERRORS.displayNameRequired })
    .refine((v) => v.trim().length <= BUSINESS_FIELD_LIMITS.displayName, {
      message: BUSINESS_FORM_ERRORS.nameInvalid,
    }),
});

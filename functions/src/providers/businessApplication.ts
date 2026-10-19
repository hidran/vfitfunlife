import type { BusinessDetails, BusinessVenueType, ProviderType } from "../types";
import { isValidItalianVat, normalizeVatNumber } from "./vatNumber";

/**
 * Pure validation of a company's provider application, kept free of firebase-admin so it
 * can be unit-tested directly (same split as applicationDecision.ts). applyAsProvider
 * turns a BusinessApplicationError into an `invalid-argument` HttpsError whose message is
 * the `code`, which the signup form maps to a localised inline error — so the codes here
 * are a contract with the client and must stay stable.
 */

/** Field length caps; the client form enforces the same numbers. */
export const BUSINESS_LIMITS = {
  legalName: 120,
  displayName: 120,
  description: 2000,
  website: 300,
  city: 120,
  address: 200,
} as const;

export type BusinessApplicationErrorCode =
  | "provider_type_invalid"
  | "business_required"
  | "business_vat_invalid"
  | "business_vat_taken"
  | "business_legal_name_required"
  | "business_legal_name_too_long"
  | "business_display_name_required"
  | "business_display_name_too_long"
  | "business_description_invalid"
  | "business_description_too_long"
  | "business_website_invalid"
  | "business_website_too_long"
  | "business_city_invalid"
  | "business_city_too_long"
  | "business_address_invalid"
  | "business_address_too_long"
  | "business_venue_type_invalid";

export class BusinessApplicationError extends Error {
  constructor(public readonly code: BusinessApplicationErrorCode) {
    super(code);
    this.name = "BusinessApplicationError";
  }
}

/**
 * The validated, normalised shape written to `instructors/{uid}.business`. Every field is
 * present (empty string / null rather than absent) so the stored map has one shape and a
 * later approval step can rely on `venueType` and `address` existing.
 */
export interface ValidatedBusiness extends BusinessDetails {
  legalName: string;
  vatNumber: string;
  displayName: string;
  description: string;
  website: string | null;
  city: string;
  venueType: BusinessVenueType;
  address: string | null;
}

const VENUE_TYPES: ReadonlyArray<BusinessVenueType> = ["gym", "school", "studio", "none"];

/** Absent means an individual, so every existing caller keeps its behaviour. */
export function parseProviderType(input: unknown): ProviderType {
  if (input === undefined || input === null) return "individual";
  if (input === "individual" || input === "business") return input;
  throw new BusinessApplicationError("provider_type_invalid");
}

function requiredText(
  value: unknown,
  max: number,
  missing: BusinessApplicationErrorCode,
  tooLong: BusinessApplicationErrorCode,
): string {
  if (typeof value !== "string") throw new BusinessApplicationError(missing);
  const text = value.trim();
  if (!text) throw new BusinessApplicationError(missing);
  if (text.length > max) throw new BusinessApplicationError(tooLong);
  return text;
}

function optionalText(
  value: unknown,
  max: number,
  invalid: BusinessApplicationErrorCode,
  tooLong: BusinessApplicationErrorCode,
): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new BusinessApplicationError(invalid);
  const text = value.trim();
  if (text.length > max) throw new BusinessApplicationError(tooLong);
  return text;
}

/**
 * Only absolute http(s) URLs: the value is rendered as a link on the public profile, so a
 * `javascript:` or bare-host value must never be stored. Blank means no website.
 */
function website(value: unknown): string | null {
  const text = optionalText(value, BUSINESS_LIMITS.website, "business_website_invalid", "business_website_too_long");
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BusinessApplicationError("business_website_invalid");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    throw new BusinessApplicationError("business_website_invalid");
  }
  return text;
}

/**
 * Validate the `business` payload of an application. Every field is `typeof`-guarded before
 * use because the payload comes straight from the client. Throws BusinessApplicationError
 * with a stable code; never coerces a wrong type into a string.
 */
export function validateBusinessApplication(input: unknown): ValidatedBusiness {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BusinessApplicationError("business_required");
  }
  const raw = input as Record<string, unknown>;

  if (typeof raw.vatNumber !== "string" || !isValidItalianVat(raw.vatNumber)) {
    throw new BusinessApplicationError("business_vat_invalid");
  }
  const vatNumber = normalizeVatNumber(raw.vatNumber);

  const legalName = requiredText(
    raw.legalName, BUSINESS_LIMITS.legalName, "business_legal_name_required", "business_legal_name_too_long");
  const displayName = requiredText(
    raw.displayName, BUSINESS_LIMITS.displayName, "business_display_name_required", "business_display_name_too_long");
  const description = optionalText(
    raw.description, BUSINESS_LIMITS.description, "business_description_invalid", "business_description_too_long");
  const city = optionalText(raw.city, BUSINESS_LIMITS.city, "business_city_invalid", "business_city_too_long");
  const addressText = optionalText(
    raw.address, BUSINESS_LIMITS.address, "business_address_invalid", "business_address_too_long");

  let venueType: BusinessVenueType = "gym";
  if (raw.venueType !== undefined && raw.venueType !== null) {
    if (typeof raw.venueType !== "string" || !VENUE_TYPES.includes(raw.venueType as BusinessVenueType)) {
      throw new BusinessApplicationError("business_venue_type_invalid");
    }
    venueType = raw.venueType as BusinessVenueType;
  }

  return {
    legalName,
    vatNumber,
    displayName,
    description,
    website: website(raw.website),
    city,
    venueType,
    address: addressText || null,
  };
}

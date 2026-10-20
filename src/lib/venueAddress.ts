// `venues/{id}.address` is a street-line STRING with a top-level `city` (see Venue in
// src/types/venue.ts). Early admin edits wrote an object `{ street, city, zipCode, country }`
// instead; scripts/migrate-venue-address.mjs repairs those documents. Until it has run on an
// environment, readers go through these helpers so an object never reaches the DOM.

/** The fields the admin venue form edits for a venue's location. */
export interface VenueLocationFormValues {
  street: string;
  city: string;
  zipCode: string;
  country: string;
}

interface LegacyAddressObject {
  street?: unknown;
  city?: unknown;
  zipCode?: unknown;
  country?: unknown;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * The address line to print: the string as stored, or - for a not yet migrated legacy object -
 * "street, zip city". Anything else (missing, null, number) is the empty string.
 */
export function venueAddressText(venue: { address?: unknown } | null | undefined): string {
  const raw = venue?.address;
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const a = raw as LegacyAddressObject;
    const zipCity = [text(a.zipCode), text(a.city)].filter(Boolean).join(' ');
    return [text(a.street), zipCity].filter(Boolean).join(', ');
  }
  return '';
}

/**
 * The Firestore fields that carry a venue's location, from the admin form: the canonical
 * string `address` (street line), the top-level `city` every search and card reads, and the
 * separate `zipCode` / `country`. Never an object `address`.
 */
export function venueLocationFields(values: VenueLocationFormValues): {
  address: string;
  city: string;
  zipCode: string;
  country: string;
} {
  return {
    address: values.street.trim(),
    city: values.city.trim(),
    zipCode: values.zipCode.trim(),
    country: values.country.trim(),
  };
}

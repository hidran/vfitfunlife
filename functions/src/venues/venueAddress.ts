/**
 * How a venue's address reads as one line, whatever shape the document carries.
 *
 * Canonical venue shape (venueSchema.ts): `address` is the street line as a STRING and `city` /
 * `zipCode` / `country` are top-level fields. Early prod venues (the old admin form, the old
 * seeders) wrote `address: { street, city, zipCode, country, latitude, longitude, neighborhood }`
 * instead; scripts/migrate-venue-address.mjs repairs them, but a reader must not depend on the
 * migration having run: a booking that copied `venue.address` raw would store the object.
 *
 * The pure logic is the TypeScript twin of scripts/lib/venueAddress.mjs (the migration's
 * module). venueAddress.test.ts runs both on the same fixtures, so they cannot drift.
 */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** "street, zip city" - street first, then the zip and city together, each part only when present. */
export function addressLine(obj: Record<string, unknown>): string {
  const zipCity = [text(obj.zipCode), text(obj.city)].filter(Boolean).join(" ");
  return [text(obj.street), zipCity].filter(Boolean).join(", ");
}

/**
 * The address of a venue document as text, for every place that copies or shows it (a booking's
 * `venueAddress`, the assistant's venue cards): a string is trimmed, a legacy object is joined
 * with addressLine, anything else (missing, blank, a number, an array) is null — never an object.
 */
export function venueAddressText(address: unknown): string | null {
  if (typeof address === "string") return address.trim() || null;
  if (isPlainObject(address)) return addressLine(address) || null;
  return null;
}

export interface VenueAddressPatch {
  patch: Record<string, unknown> & { address: string };
  /** The names of the extra fields set, for the migration's report. */
  filled: string[];
}

/**
 * The update that repairs one venue document, or null when it needs none (address is already a
 * string, missing, ...):
 *  - patch.address: the joined string;
 *  - city / zipCode / country (and the unread `neighborhood`): copied from the object ONLY when the
 *    document has no non-empty top-level value - an existing top-level value is never overwritten;
 *  - lat / lng: copied from the object's latitude / longitude when the document has no numeric pair
 *    (replacing the object would otherwise drop the only coordinates a legacy doc has).
 */
export function venueAddressPatch(data: Record<string, unknown> | undefined): VenueAddressPatch | null {
  const raw = data?.address;
  if (!isPlainObject(raw) || !data) return null;

  const patch: VenueAddressPatch["patch"] = { address: addressLine(raw) };
  const filled: string[] = [];

  for (const field of ["city", "zipCode", "country", "neighborhood"]) {
    const fromObject = text(raw[field]);
    if (fromObject && !text(data[field])) {
      patch[field] = fromObject;
      filled.push(field);
    }
  }
  if (isNum(raw.latitude) && isNum(raw.longitude) && !(isNum(data.lat) && isNum(data.lng))) {
    patch.lat = raw.latitude;
    patch.lng = raw.longitude;
    filled.push("lat/lng");
  }
  return { patch, filled };
}

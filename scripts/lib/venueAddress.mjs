// Pure transformation behind scripts/migrate-venue-address.mjs (tested in venueAddress.test.mjs).
// JavaScript twin of functions/src/venues/venueAddress.ts: functions/src/venues/venueAddress.test.ts
// runs both on the same fixtures, so a change here must land there too (and vice versa).
//
// Canonical venue shape: `address` is a street-line STRING and `city` / `zipCode` / `country` are
// top-level fields (src/types/venue.ts, seeds, businessVenue.ts). The old admin venue form wrote
// `address: { street, city, zipCode, country }` instead.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const text = (v) => (typeof v === "string" ? v.trim() : "");
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** "street, zip city" - street first, then the zip and city together, each part only when present. */
export function addressLine(obj) {
  const zipCity = [text(obj.zipCode), text(obj.city)].filter(Boolean).join(" ");
  return [text(obj.street), zipCity].filter(Boolean).join(", ");
}

/**
 * The address of a venue document as text: a string is trimmed, a legacy object is joined with
 * addressLine, anything else is null — never an object.
 */
export function venueAddressText(address) {
  if (typeof address === "string") return address.trim() || null;
  if (isPlainObject(address)) return addressLine(address) || null;
  return null;
}

/**
 * The update that repairs one venue document, or null when it needs none (address is already a
 * string, missing, ...). Returns `{ patch, filled }`:
 *  - patch.address: the joined string;
 *  - city / zipCode / country (and the unread `neighborhood`): copied from the object ONLY when the
 *    document has no non-empty top-level value - an existing top-level value is never overwritten;
 *  - lat / lng: copied from the object's latitude / longitude when the document has no numeric pair
 *    (replacing the object would otherwise drop the only coordinates a legacy doc has);
 *  - filled: the names of the extra fields set, for the script's report.
 */
export function venueAddressPatch(data) {
  const raw = data?.address;
  if (!isPlainObject(raw)) return null;

  const patch = { address: addressLine(raw) };
  const filled = [];

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

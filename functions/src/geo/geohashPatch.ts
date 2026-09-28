import * as ngeohash from "ngeohash";

/**
 * Precision of every `geohash` field. ngeohash and the client's geofire-common produce
 * identical strings (same base32 alphabet and bit interleaving), and 10 is geofire's
 * default, so client-side geohashQueryBounds ranges match what is written here.
 */
export const GEOHASH_PRECISION = 10;

export interface Coords {
  lat: number;
  lng: number;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * A document's coordinates: the flat `lat`/`lng` pair every reader uses, or failing that
 * the legacy nested `address.latitude/longitude` some early prod venues were created with.
 */
export function coordsOf(data: Record<string, unknown>): Coords | null {
  if (isNum(data.lat) && isNum(data.lng)) return { lat: data.lat, lng: data.lng };
  const address = data.address;
  if (address && typeof address === "object") {
    const a = address as Record<string, unknown>;
    if (isNum(a.latitude) && isNum(a.longitude)) return { lat: a.latitude, lng: a.longitude };
  }
  return null;
}

/**
 * The write that brings a venue/provider document's geo fields in line with its
 * coordinates, or null when nothing needs writing (the idempotence that stops the
 * trigger re-firing on its own write forever).
 *
 *  - `geohash` = geohash(lat, lng) at GEOHASH_PRECISION;
 *  - legacy docs with only `address.latitude/longitude` also get the flat `lat`/`lng`;
 *  - no coordinates at all: a stale `geohash` is removed (`geohash: null` = delete), so
 *    the doc can't keep turning up in radius searches at its old position.
 */
export function geohashPatch(data: Record<string, unknown>): Record<string, unknown> | null {
  const coords = coordsOf(data);
  if (!coords) return data.geohash !== undefined ? { geohash: null } : null;

  const patch: Record<string, unknown> = {};
  if (!isNum(data.lat) || !isNum(data.lng)) {
    patch.lat = coords.lat;
    patch.lng = coords.lng;
  }
  const geohash = ngeohash.encode(coords.lat, coords.lng, GEOHASH_PRECISION);
  if (data.geohash !== geohash) patch.geohash = geohash;
  return Object.keys(patch).length ? patch : null;
}

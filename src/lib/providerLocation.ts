import { coordsOf, geohashFor, type LatLng } from '@/lib/geo';

/**
 * A provider's own search location, as stored on `instructors/{uid}`: the flat `lat`/`lng`
 * pair that "near me" search (searchProvidersNear → geoRangeQuery) reads, the `geohash` it
 * orders by, and the `city` the search cards and profile show.
 */
export interface MyLocation {
  coords: LatLng | null;
  city: string;
}

/**
 * Decimals kept when a provider saves their location. The instructor doc is publicly
 * readable, and a trainer's position is often their home: 3 decimals is about 110 m, precise
 * enough for a 5 km radius search, too coarse to point at a front door.
 */
export const LOCATION_DECIMALS = 3;

const roundTo = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

export function isValidLatLng(point: { lat: unknown; lng: unknown } | null | undefined): point is LatLng {
  return (
    !!point &&
    typeof point.lat === 'number' &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180 &&
    // (0, 0) is what a failed geocoder/GPS read looks like, never a trainer's real position.
    !(point.lat === 0 && point.lng === 0)
  );
}

/** The provider's saved location from their instructor document. */
export function myLocationFromDoc(data: Record<string, unknown>): MyLocation {
  const coords = coordsOf(data);
  return {
    coords: coords && isValidLatLng(coords) ? coords : null,
    city: typeof data.city === 'string' ? data.city : '',
  };
}

/** Whether to nudge the provider to set a location: they have a profile but no coordinates. */
export function needsLocation(location: MyLocation | null | undefined): boolean {
  return !!location && location.coords === null;
}

/**
 * The instructor-doc update for a location the provider picked. Writes the geohash itself so
 * the provider shows up in radius search right away; syncInstructorGeohash computes the same
 * string (precision 10) and so finds nothing to change. `location` is the display label
 * flattenProvider prefers over `city`: overwritten so an old label cannot contradict the pin.
 */
export function buildLocationPatch(input: { lat: number; lng: number; city: string }): {
  lat: number;
  lng: number;
  geohash: string;
  city: string;
  location: string;
} {
  if (!isValidLatLng(input)) throw new Error('invalid-coordinates');
  const city = input.city.trim();
  if (!city) throw new Error('city-required');
  const lat = roundTo(input.lat, LOCATION_DECIMALS);
  const lng = roundTo(input.lng, LOCATION_DECIMALS);
  return { lat, lng, geohash: geohashFor({ lat, lng }), city, location: city };
}

interface AddressComponent {
  long_name: string;
  types: string[];
}

/**
 * The city of a geocoder result: the locality, else the postal town, else the comune
 * (administrative_area_level_3), else the province — the first that is present.
 */
export function cityFromAddressComponents(components: AddressComponent[] | undefined): string {
  if (!components?.length) return '';
  for (const type of ['locality', 'postal_town', 'administrative_area_level_3', 'administrative_area_level_2']) {
    const match = components.find((c) => c.types.includes(type));
    if (match?.long_name) return match.long_name;
  }
  return '';
}

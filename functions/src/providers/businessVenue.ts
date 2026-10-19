import { BUSINESS_VENUE_TYPES, type BusinessVenueType } from "../types";

/** Same rule as the client's isValidLatLng: finite, in range, and not the (0, 0) of a failed read. */
function validCoords(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

const nonEmpty = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Hero slide a venue gets until an admin or the owner dresses it (same palette as the seeded venues). */
const DEFAULT_HERO_GRADIENT = "from-vfit-secondary/40 via-vfit-primary/30 to-transparent";

/** Letters NFD does not decompose into base + accent, so they would otherwise be dropped. */
const LETTER_MAP: Record<string, string> = { "ß": "ss", "ø": "o", "æ": "ae", "œ": "oe", "ł": "l", "đ": "d" };

/** URL-safe kebab-case ASCII (the seeders' toSlug, plus the extra letters above). */
function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ßøæœłđ]/g, (c) => LETTER_MAP[c])
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Seeders slug the name alone; a business venue appends the city so same-named venues differ. */
export function venueSlug(name: string, city: string): string {
  return toSlug([name, city].filter(Boolean).join(" ")) || "venue";
}

/**
 * The venue type a business asked for: absent ⇒ "gym" (the form's default), an unknown
 * value ⇒ "none" so a corrupt map never produces a venue of a type nobody chose.
 */
export function businessVenueType(business: Record<string, unknown>): BusinessVenueType {
  const t = business.venueType;
  if (t === undefined || t === null) return "gym";
  return BUSINESS_VENUE_TYPES.includes(t as BusinessVenueType) ? (t as BusinessVenueType) : "none";
}

export interface BusinessVenueInput {
  providerId: string;
  /** The stored instructors/{providerId} data. */
  instructor: Record<string, unknown>;
  /** The write timestamp (FieldValue.serverTimestamp()). */
  now: unknown;
}

/**
 * The `venues` document an approved business gets for its premises, or null when it must
 * not get one: no `business` map, `venueType: "none"` (no fixed premises), a venue already
 * linked (`business.venueId` — approval is re-runnable), or nothing to name it after.
 *
 * Starts as a pending, non-partner venue the admin can promote. Coordinates are copied only
 * when the provider already saved a valid location; otherwise the geo fields are left out
 * and the venue stays out of radius searches until syncBusinessVenueLocation mirrors one.
 */
export function buildBusinessVenue(input: BusinessVenueInput): Record<string, unknown> | null {
  const { providerId, instructor } = input;
  const business = instructor.business;
  if (!business || typeof business !== "object") return null;
  const b = business as Record<string, unknown>;

  if (nonEmpty(b.venueId)) return null;
  const type = businessVenueType(b);
  if (type === "none") return null;

  const name = nonEmpty(b.displayName) ?? nonEmpty(b.legalName);
  if (!name) return null;

  const city = nonEmpty(instructor.city) ?? nonEmpty(b.city) ?? "";
  const geo = validCoords(instructor.lat, instructor.lng) ?
    { lat: instructor.lat as number, lng: instructor.lng as number } :
    {};

  return {
    name,
    slug: venueSlug(name, city),
    type,
    city,
    address: nonEmpty(b.address) ?? "",
    ...geo,
    ownerId: providerId,
    partnerStatus: "pending",
    isPartner: false,
    isActive: true,
    memberDiscountPercent: 0,
    partnerInstructorExtraPercent: 0,
    rating: 0,
    reviewCount: 0,
    description: nonEmpty(b.description) ?? "",
    heroGradients: [DEFAULT_HERO_GRADIENT],
    amenities: [],
    hours: [],
    photoUrls: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/**
 * The venue's document id. Deterministic on purpose: the approval batch `create`s it, so
 * two approvals racing past the `business.venueId` check collide on this one id (the loser
 * fails ALREADY_EXISTS) instead of each minting a venue, and a venue already living at this
 * id, say one an admin has promoted, can never be overwritten.
 */
export function businessVenueId(providerId: string): string {
  return `biz_${providerId}`;
}

export interface BusinessVenuePlan {
  venueId: string;
  /** The `venues/{venueId}` document, to be written with `create`. */
  venue: Record<string, unknown>;
  /** Merged into the instructors patch: a nested map, never the dotted `business.venueId`. */
  instructorPatch: { business: { venueId: string } };
}

/** buildBusinessVenue plus the id it goes under and the link back from the instructor. */
export function planBusinessVenue(input: BusinessVenueInput): BusinessVenuePlan | null {
  const venue = buildBusinessVenue(input);
  if (!venue) return null;
  const venueId = businessVenueId(input.providerId);
  return { venueId, venue, instructorPatch: { business: { venueId } } };
}

/**
 * What to copy from a provider's location onto their venue when the instructor document
 * changes: lat/lng when they moved (and are valid), city when it changed (and is not empty).
 * Null when there is nothing to mirror — including a deletion, an invalid read, or an
 * unrelated edit — so the venue is never blanked and the trigger stops after one write.
 */
export function venueLocationPatch(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): { lat?: number; lng?: number; city?: string } | null {
  if (!after) return null;
  const patch: { lat?: number; lng?: number; city?: string } = {};
  if (validCoords(after.lat, after.lng) && (before?.lat !== after.lat || before?.lng !== after.lng)) {
    patch.lat = after.lat as number;
    patch.lng = after.lng as number;
  }
  const city = nonEmpty(after.city);
  if (city && city !== before?.city) patch.city = city;
  return Object.keys(patch).length ? patch : null;
}

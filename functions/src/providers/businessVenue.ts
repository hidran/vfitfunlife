import { HttpsError } from "firebase-functions/v2/https";
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
 * The venue type a business asked for: absent ⇒ "none" (a company that predates the field,
 * or an old cached client, never asked for premises, so approval must not invent a gym), an
 * unknown value ⇒ "none" too, so a corrupt map never produces a venue of a type nobody chose.
 * Any explicit venue type of the platform (gym, school, studio, event space, beauty salon, …)
 * plans a venue; only gym, school and studio host courses.
 */
export function businessVenueType(business: Record<string, unknown>): BusinessVenueType {
  const t = business.venueType;
  if (t === undefined || t === null) return "none";
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
 * The `venues` document a company gets for its premises when none exists yet, or null when it
 * must not get one: no `business` map, `venueType` absent or "none" (no fixed premises), or
 * nothing to name it after. (Whether a venue is already linked or living at the deterministic
 * id is decided by planBusinessVenue, which reads the venue.)
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
 * The venue's document id. Deterministic on purpose: the approval `create`s it, so two
 * approvals racing past the existence read collide on this one id (the loser fails
 * ALREADY_EXISTS) instead of each minting a venue, and a venue already living at this id,
 * say one an admin has promoted, is never overwritten.
 */
export function businessVenueId(providerId: string): string {
  return `biz_${providerId}`;
}

/** What the decision transaction read of `venues/biz_<uid>`. */
export interface ExistingVenue {
  exists: boolean;
  data?: Record<string, unknown>;
}

export type BusinessVenuePlan =
  | {
    kind: "create";
    venueId: string;
    /** The `venues/{venueId}` document, to be written with `create`. */
    venue: Record<string, unknown>;
    /** Merged into the instructors patch: a nested map, never the dotted `business.venueId`. */
    instructorPatch: { business: { venueId: string } };
  }
  | {
    kind: "reactivate";
    venueId: string;
    /**
     * `update()`d onto the venue: only these fields, so admin edits, photos and partnerStatus
     * survive. The lifecycle marker is cleared (set to null) when there was one to clear.
     */
    venuePatch: { isActive: true; updatedAt: unknown; deactivatedBy?: null; deactivatedAt?: null };
    /** Present only when the link is missing (never when it points elsewhere: that link is kept). */
    instructorPatch: { business: { venueId: string } } | null;
  }
  | {
    kind: "deactivate";
    venueId: string;
    /** `ownerId` stays, for audit; the venue just leaves public listings. */
    venuePatch: VenueDeactivation;
  };

/**
 * The system's own deactivation of a company venue (rejection, conversion to individual, account
 * deletion). `deactivatedBy: 'lifecycle'` is what lets a later approval bring the venue back: an
 * admin who switched a venue off by hand leaves no marker, and that stays off.
 */
export const LIFECYCLE_DEACTIVATION = "lifecycle";

export type VenueDeactivation = {
  isActive: false;
  updatedAt: unknown;
  deactivatedBy: typeof LIFECYCLE_DEACTIVATION;
  deactivatedAt: unknown;
};

export function venueDeactivation(now: unknown): VenueDeactivation {
  return { isActive: false, updatedAt: now, deactivatedBy: LIFECYCLE_DEACTIVATION, deactivatedAt: now };
}

/** A venue the company owns (ownerId == uid), as read. */
const ownedBy = (
  venue: ExistingVenue | undefined,
  providerId: string,
): venue is { exists: true; data: Record<string, unknown> } =>
  !!venue?.exists && venue.data?.ownerId === providerId;

/**
 * What a decision does to the company's venue, given what the transaction read of
 * `venues/biz_<uid>`.
 *
 * Approval of a company with premises (venueType gym / school / studio; absent and "none" mean
 * none):
 * - no venue at the id and nothing linked ⇒ create it;
 * - the company's own venue (ownerId == uid) that the SYSTEM deactivated (`deactivatedBy:
 *   'lifecycle'`: a rejection, a conversion to individual, an account deletion) ⇒ reactivate it,
 *   clear the marker and link `business.venueId` if it is empty — a patch of isActive/updatedAt and
 *   the marker only, so everything an admin or the owner added since survives;
 * - the company's own venue that is inactive WITHOUT the marker (an admin switched it off) ⇒
 *   nothing: it stays off, and the instructor's link is left as it is;
 * - the company's own venue already active (isActive absent counts as active, like the rules)
 *   and linked ⇒ nothing (re-running an approval changes nothing);
 * - `business.venueId` already pointing at ANOTHER venue ⇒ that link is kept, never silently
 *   replaced by `biz_<uid>`;
 * - a venue at the id owned by someone else ⇒ `venue_exists`: a genuine clash that nobody
 *   should resolve by overwriting it;
 * - nothing at the id but `business.venueId` still set (an admin deleted the venue) ⇒ nothing:
 *   a deleted venue is not recreated behind the admin's back.
 *
 * Rejection: the company's own active venue is deactivated; anything else is left alone.
 * Individuals (no `business` map) never have a venue plan.
 */
export function planBusinessVenue(
  input: BusinessVenueInput & { decision: "verified" | "rejected"; existing: ExistingVenue | undefined },
): BusinessVenuePlan | null {
  const { providerId, instructor, decision, existing, now } = input;
  const business = instructor.business;
  if (!business || typeof business !== "object") return null;
  const b = business as Record<string, unknown>;
  const venueId = businessVenueId(providerId);

  if (decision === "rejected") {
    if (!ownedBy(existing, providerId) || existing.data.isActive === false) return null;
    return { kind: "deactivate", venueId, venuePatch: venueDeactivation(now) };
  }

  if (businessVenueType(b) === "none") return null;

  if (existing?.exists) {
    if (!ownedBy(existing, providerId)) throw new HttpsError("already-exists", "venue_exists");
    const linked = b.venueId === venueId;
    const linkable = !nonEmpty(b.venueId);
    const inactive = existing.data.isActive === false;
    if (inactive && existing.data.deactivatedBy !== LIFECYCLE_DEACTIVATION) return null;
    if (!inactive && (linked || !linkable)) return null;
    return {
      kind: "reactivate",
      venueId,
      venuePatch: inactive ?
        { isActive: true, updatedAt: now, deactivatedBy: null, deactivatedAt: null } :
        { isActive: true, updatedAt: now },
      instructorPatch: linkable ? { business: { venueId } } : null,
    };
  }

  if (nonEmpty(b.venueId)) return null;
  const venue = buildBusinessVenue(input);
  if (!venue) return null;
  return { kind: "create", venueId, venue, instructorPatch: { business: { venueId } } };
}

/** The patch that takes the company's own venue out of public listings; null if it is not, or no longer, active. */
export function venueDeactivationPatch(
  providerId: string,
  existing: ExistingVenue | undefined,
  now: unknown,
): VenueDeactivation | null {
  if (!ownedBy(existing, providerId) || existing.data.isActive === false) return null;
  return venueDeactivation(now);
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

/** The trimmed public name of an instructors document's `business` map, or null. */
function publicNameOf(instructor: Record<string, unknown> | undefined): string | null {
  const business = instructor?.business;
  if (!business || typeof business !== "object") return null;
  return nonEmpty((business as Record<string, unknown>).displayName);
}

/**
 * What to copy from a business's public name onto its venue: `{ name }` when
 * `business.displayName` changed to a non-empty value, else null (unrelated edit, an emptied
 * or non-string name, a deletion), so the venue is never blanked. Only the name: the slug
 * was minted at creation and stays, since the venue's URL must not move under its links.
 * With no `before` (the re-read of the current document) it yields the current name.
 */
export function venueNamePatch(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): { name: string } | null {
  if (!after) return null;
  const name = publicNameOf(after);
  if (!name || name === publicNameOf(before)) return null;
  return { name };
}

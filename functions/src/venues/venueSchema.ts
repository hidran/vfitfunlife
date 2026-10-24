import { z } from "zod";
import type { VenueType } from "../types";

/**
 * Every venue type of the platform, as a runtime list (`VenueType` in ../types is the union).
 * `satisfies` pins the two together: adding a member to one without the other fails to compile.
 */
export const VENUE_TYPES = [
  "gym", "wellness_center", "spa", "beauty_salon", "school", "studio", "outdoor_space", "event_space",
] as const satisfies readonly VenueType[];

export const VENUE_PARTNER_STATUSES = ["pending", "active", "suspended"] as const;

/**
 * The canonical `venues/{id}` document (src/types/venue.ts, businessVenue.ts, the admin venue
 * form, scripts/lib/venueAddress.mjs). The one definition every seeder is checked against, so
 * no seed can bring the legacy shape back:
 *
 * - `address` is the street line as a STRING; `city`, `zipCode`, `country` are top-level
 *   fields (the old admin form and the old seeders wrote `address: { street, city, ... }`);
 * - coordinates are the flat `lat` / `lng` pair (not `address.latitude/longitude`);
 * - `type` is one of VENUE_TYPES (not the old `fitness` / `wellness`);
 * - `hours` is the `{ day, time }` list the venue page renders (not an `openingHours` map),
 *   `photoUrls` the photo list (not `images`), `amenities` a list of `{ kind }`.
 *
 * `.strict()` on purpose: an unknown key is a legacy field creeping back in, not an extension.
 * Server-written timestamps are `unknown` because a seed passes a Timestamp while a callable
 * passes FieldValue.serverTimestamp().
 */
export const venueDocSchema = z.object({
  /** Some seeders mirror the document id into the doc; readers use the snapshot id. */
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case ASCII slug"),
  type: z.enum(VENUE_TYPES),
  city: z.string().trim().min(1),
  /** Street line only; empty for a company that declared premises without an address. */
  address: z.string(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Written by syncVenueGeohash from lat/lng; a seed never needs to supply it. */
  geohash: z.string().optional(),
  rating: z.number().min(0).max(5),
  reviewCount: z.number().int().min(0),
  isPartner: z.boolean(),
  partnerStatus: z.enum(VENUE_PARTNER_STATUSES).optional(),
  memberDiscountPercent: z.number().int().min(0).max(100).optional(),
  partnerInstructorExtraPercent: z.number().int().min(0).max(100).optional(),
  ownerId: z.string().min(1).optional(),
  isActive: z.boolean(),
  description: z.string(),
  heroGradients: z.array(z.string().min(1)),
  amenities: z.array(z.object({ kind: z.string().min(1), labelKey: z.string().optional() })),
  hours: z.array(z.object({ day: z.string().min(1), time: z.string().min(1) })),
  photoUrls: z.array(z.string().min(1)).max(10).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
}).strict();

export type VenueDoc = z.infer<typeof venueDocSchema>;

/** `venues/{id}/services/{sid}`: what a venue sells, as the seeders and the venue page agree. */
export const venueServiceDocSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  price: z.number().min(0),
  durationMinutes: z.number().int().positive().optional(),
  description: z.string().optional(),
  isActive: z.boolean(),
}).strict();

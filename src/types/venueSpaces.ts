/** A site of a venue (venues/{v}/locations/{l}); its IANA timezone becomes the timezone of the courses held there. */
export interface VenueLocation {
  id: string; name: string; address: string; city: string; timezone: string; isActive: boolean;
}
/** A room of a location (venues/{v}/locations/{l}/rooms/{r}); a room hosts one lesson at a time. */
export interface VenueRoom { id: string; name: string; isActive: boolean }
/**
 * An instructor linked to the venue (venues/{v}/instructors/{i}), set by an admin through configureGymInstructor.
 * `partnerStatus` lives on instructors/{i} (one status per instructor, not per venue); fetchVenueInstructorLinks joins it.
 */
export interface VenueInstructorLink {
  id: string; name: string; photoUrl?: string; isActive: boolean;
  partnerStatus?: 'pending' | 'active' | 'suspended';
}

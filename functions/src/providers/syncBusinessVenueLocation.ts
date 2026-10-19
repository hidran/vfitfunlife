import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
  type FirestoreEvent,
} from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import { venueLocationPatch, venueNamePatch } from "./businessVenue";

/** gRPC status code: the venue was deleted. */
const NOT_FOUND = 5;

type InstructorWriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/**
 * A business's venue follows its owner's saved location and public name. The provider sets
 * lat/lng/city on their instructors document from the browser (saveMyLocation) and renames
 * the company through updateBusinessDetails (`business.displayName`), but venue writes are
 * admin-only in the rules, so the copy has to happen here. Writing lat/lng onto the venue
 * is what makes syncVenueGeohash recompute its geohash and put it on the radius search. The
 * venue's slug is NOT touched by a rename: it is minted once, and its URL must stay put.
 *
 * The event only decides WHAT to act on (see venueLocationPatch and venueNamePatch: the
 * location or the public name itself changed, so the unrelated writes an instructor
 * document sees all day cost two comparisons). What gets written is the instructor's
 * CURRENT values, read fresh: the trigger retries, and a retried or out-of-order event must
 * not put an older position or name over a newer one. Only the parts the event announced
 * are written, so a move does not rewrite a name an admin edited on the venue. The owner's
 * moves and renames win over an admin's hand-edit of the same fields — intended: the venue
 * is where, and called what, the owner says.
 *
 * `update()`, never `set()`: a deleted venue fails NOT_FOUND and stays deleted.
 */
export async function mirrorBusinessVenueLocation(event: InstructorWriteEvent): Promise<void> {
  const after = event.data?.after;
  if (!after?.exists) return;
  const before = event.data?.before?.data();
  const locationChanged = venueLocationPatch(before, after.data()) !== null;
  const nameChanged = venueNamePatch(before, after.data()) !== null;
  if (!locationChanged && !nameChanged) return;

  const current = (await after.ref.get()).data();
  const venueId = (current?.business as { venueId?: unknown } | undefined)?.venueId;
  if (typeof venueId !== "string" || !venueId) return;
  const patch = {
    ...(locationChanged ? venueLocationPatch(undefined, current) : null),
    ...(nameChanged ? venueNamePatch(undefined, current) : null),
  };
  if (!Object.keys(patch).length) return;

  try {
    await getFirestore().collection("venues").doc(venueId).update(patch);
  } catch (err) {
    if ((err as { code?: unknown }).code === NOT_FOUND) return;
    throw err;
  }
}

export const syncBusinessVenueLocation = onDocumentWritten(
  // retry: a transient failure must not leave the venue at the old position or name until
  // the owner happens to change it again. The mirror is idempotent, so redelivery is harmless.
  { region, retry: true, document: "instructors/{instructorId}" },
  mirrorBusinessVenueLocation,
);

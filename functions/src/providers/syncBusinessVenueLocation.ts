import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
  type FirestoreEvent,
} from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import { venueLocationPatch } from "./businessVenue";

/** gRPC status code: the venue was deleted. */
const NOT_FOUND = 5;

type InstructorWriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/**
 * A business's venue follows its owner's saved location. The provider sets lat/lng/city on
 * their instructors document from the browser (saveMyLocation), but venue writes are
 * admin-only in the rules, so the copy has to happen here. Writing lat/lng onto the venue
 * is what makes syncVenueGeohash recompute its geohash and put it on the radius search.
 *
 * The event only decides WHETHER to act (see venueLocationPatch: the location itself
 * changed, so the unrelated writes an instructor document sees all day cost one
 * comparison). What gets written is the instructor's CURRENT location, read fresh: the
 * trigger retries, and a retried or out-of-order event must not put an older position over
 * a newer one. The owner's moves win over an admin's hand-edit of the venue's
 * city/lat/lng — intended: the venue is where the owner says it is.
 *
 * `update()`, never `set()`: a deleted venue fails NOT_FOUND and stays deleted.
 */
export async function mirrorBusinessVenueLocation(event: InstructorWriteEvent): Promise<void> {
  const after = event.data?.after;
  if (!after?.exists) return;
  if (!venueLocationPatch(event.data?.before?.data(), after.data())) return;

  const current = (await after.ref.get()).data();
  const venueId = (current?.business as { venueId?: unknown } | undefined)?.venueId;
  if (typeof venueId !== "string" || !venueId) return;
  const patch = venueLocationPatch(undefined, current);
  if (!patch) return;

  try {
    await getFirestore().collection("venues").doc(venueId).update(patch);
  } catch (err) {
    if ((err as { code?: unknown }).code === NOT_FOUND) return;
    throw err;
  }
}

export const syncBusinessVenueLocation = onDocumentWritten(
  // retry: a transient failure must not leave the venue at the old position until the
  // owner happens to move again. The mirror is idempotent, so redelivery is harmless.
  { region, retry: true, document: "instructors/{instructorId}" },
  mirrorBusinessVenueLocation,
);

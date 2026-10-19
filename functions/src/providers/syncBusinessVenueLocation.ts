import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
  type FirestoreEvent,
} from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { venueLocationPatch } from "./businessVenue";

const region = "europe-west1";

/** gRPC status code: the venue was deleted. */
const NOT_FOUND = 5;

type InstructorWriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/**
 * A business's venue follows its owner's saved location. The provider sets lat/lng/city on
 * their instructors document from the browser (saveMyLocation), but venue writes are
 * admin-only in the rules, so the copy has to happen here. Writing lat/lng onto the venue
 * is what makes syncVenueGeohash recompute its geohash and put it on the radius search.
 *
 * Only reacts when the location itself changed (see venueLocationPatch), so the unrelated
 * writes an instructor document sees all day cost one comparison. `update()`, never
 * `set()`: a deleted venue fails NOT_FOUND and stays deleted.
 */
export async function mirrorBusinessVenueLocation(event: InstructorWriteEvent): Promise<void> {
  const after = event.data?.after;
  if (!after?.exists) return;
  const afterData = after.data() ?? {};
  const business = afterData.business as { venueId?: unknown } | undefined;
  const venueId = business?.venueId;
  if (typeof venueId !== "string" || !venueId) return;

  const patch = venueLocationPatch(event.data?.before?.data(), afterData);
  if (!patch) return;

  try {
    await getFirestore().collection("venues").doc(venueId).update(patch);
  } catch (err) {
    if ((err as { code?: unknown }).code === NOT_FOUND) return;
    throw err;
  }
}

export const syncBusinessVenueLocation = onDocumentWritten(
  { region, document: "instructors/{instructorId}" },
  mirrorBusinessVenueLocation,
);

import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
  type FirestoreEvent,
} from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { geohashPatch } from "./geohashPatch";

const region = "europe-west1";

/** gRPC status codes: the doc was deleted / changed after this event's snapshot. */
const NOT_FOUND = 5;
const FAILED_PRECONDITION = 9;

/**
 * Keep `geohash` (the key the client's radius search orders by) in sync with lat/lng on
 * every write, whichever writer made it: admin venue forms, the provider profile editor,
 * seeders, migrations. Idempotent: when the stored geohash already matches, nothing is
 * written, so the trigger's own update fires it once more and stops there.
 *
 * `update()`, never `set()`: a write racing a delete fails NOT_FOUND (swallowed) instead
 * of resurrecting the deleted document with only geo fields.
 */
async function syncGeohash(
  event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>,
): Promise<void> {
  const after = event.data?.after;
  if (!after?.exists) return;
  const patch = geohashPatch(after.data() ?? {});
  if (!patch) return;
  const write: Record<string, unknown> = { ...patch };
  if (write.geohash === null) write.geohash = FieldValue.delete();
  try {
    // Precondition on the version we read: if the doc changed since, that newer write
    // fires its own trigger with the fresh coordinates.
    await after.ref.update(write, { lastUpdateTime: after.updateTime });
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === NOT_FOUND || code === FAILED_PRECONDITION) return;
    throw err;
  }
}

export const syncVenueGeohash = onDocumentWritten({ region, document: "venues/{venueId}" }, syncGeohash);

export const syncInstructorGeohash = onDocumentWritten(
  { region, document: "instructors/{instructorId}" },
  syncGeohash,
);

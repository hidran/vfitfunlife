import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { lowestActivePrice, type ServiceLike } from "./lowestPrice";
import { activeCategoryIds } from "./deriveCategories";

const region = "europe-west1";

/** gRPC status code 5: NOT_FOUND. */
const NOT_FOUND = 5;

/** Whether an error is Firestore's NOT_FOUND — e.g. `update()` on a document that doesn't exist. */
export function isParentNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === NOT_FOUND;
}

export interface SyncInstructorDeps {
  getServices: () => Promise<ServiceLike[]>;
  updateInstructor: (patch: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Recomputes and writes an instructor's denormalized service-derived fields.
 *
 * Split out from the trigger so it's testable without firebase-admin or an emulator — the
 * trigger itself is then only Firestore plumbing (see below).
 *
 * Uses `updateInstructor` (an `update()`, never `set()`/merge) deliberately: this runs for
 * every service write, including the ones `deleteUserCascade`'s `recursiveDelete` fires while
 * deleting `instructors/{uid}/services/*` on the way to deleting `instructors/{uid}` itself.
 * `set(..., { merge: true })` would recreate `instructors/{uid}` as a ghost document
 * (`{ categoryIds: [] }`) moments after the cascade deleted it. `update()` fails instead when
 * the parent is gone — NOT_FOUND (gRPC code 5) just means there is nothing left to sync, so
 * it's swallowed; any other error still propagates.
 */
export async function syncInstructorFromServices(deps: SyncInstructorDeps): Promise<void> {
  // Re-read the whole subcollection rather than diffing the single write: both derived
  // values are properties of the set, not of the document that changed.
  const services = await deps.getServices();

  const lowest = lowestActivePrice(services);
  const categoryIds = activeCategoryIds(services);

  const patch: Record<string, unknown> = {
    // Empty array rather than a deleted field: array-contains simply never matches an
    // empty array, whereas a missing field would need every reader to handle undefined.
    categoryIds,
  };

  if (lowest === null) {
    // No sellable service left. Deleting beats writing 0 — flattenProvider treats the
    // field as optional, so cards fall back to their no-price rendering instead of
    // advertising a free session.
    patch.lowestPrice = FieldValue.delete();
    patch.hourlyRate = FieldValue.delete();
  } else {
    patch.lowestPrice = lowest;
    patch.hourlyRate = lowest;
  }

  try {
    await deps.updateInstructor(patch);
  } catch (err) {
    if (isParentNotFound(err)) return;
    throw err;
  }
}

/**
 * Keeps the instructor document's denormalized fields in sync with its services.
 *
 * Two derived values, both computed from the same read:
 *
 * - `lowestPrice` / `hourlyRate` drive the "Da €N" card label, provider price sorting
 *   and the AI search cards.
 * - `categoryIds` is the search key. It replaces `specialties`, which matched on Italian
 *   display names — renaming a category orphaned every provider carrying the old string.
 *   A provider stops declaring what they do and simply offers it.
 *
 * Recomputing here rather than in the client keeps both correct for admin edits, seeds and
 * migrations, and the Admin SDK bypasses the rule that stops a trainer writing their own
 * root document fields.
 *
 * Specs: 2026-08-10-trainer-services-design.md §6,
 *        2026-08-13-service-taxonomy-cutover-design.md §3
 */
export const onProviderServiceWrite = onDocumentWritten(
  { region, document: "instructors/{instructorId}/services/{serviceId}" },
  async (event) => {
    const { instructorId } = event.params;
    const instructorRef = getFirestore().collection("instructors").doc(instructorId);

    await syncInstructorFromServices({
      getServices: async () => {
        const snap = await instructorRef.collection("services").get();
        return snap.docs.map((d) => d.data() as ServiceLike);
      },
      updateInstructor: (patch) => instructorRef.update(patch),
    });
  },
);

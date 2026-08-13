import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { lowestActivePrice, type ServiceLike } from "./lowestPrice";
import { activeCategoryIds } from "./deriveCategories";

const region = "europe-west1";

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

    // Re-read the whole subcollection rather than diffing the single write: both derived
    // values are properties of the set, not of the document that changed.
    const snap = await instructorRef.collection("services").get();
    const services = snap.docs.map((d) => d.data() as ServiceLike);

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

    await instructorRef.set(patch, { merge: true });
  },
);

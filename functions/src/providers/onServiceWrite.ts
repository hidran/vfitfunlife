import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { lowestActivePrice, type ServiceLike } from "./lowestPrice";

const region = "europe-west1";

/**
 * Keeps the instructor document's denormalized price in sync with its services.
 *
 * `lowestPrice` drives the "Da €N" card label, provider price sorting
 * (src/lib/firebase/firebookings.ts) and the AI search cards. Recomputing it here rather
 * than in the client keeps it correct for admin edits, seeds and migrations too — and the
 * Admin SDK bypasses the rule that stops a trainer writing their own root document fields.
 *
 * Spec: docs/superpowers/specs/2026-08-10-trainer-services-design.md §6
 */
export const onProviderServiceWrite = onDocumentWritten(
  { region, document: "instructors/{instructorId}/services/{serviceId}" },
  async (event) => {
    const { instructorId } = event.params;
    const instructorRef = getFirestore().collection("instructors").doc(instructorId);

    // Re-read the whole subcollection rather than diffing the single write: the event
    // gives us one service, but the minimum is a property of the set.
    const snap = await instructorRef.collection("services").get();
    const lowest = lowestActivePrice(snap.docs.map((d) => d.data() as ServiceLike));

    if (lowest === null) {
      // No sellable service left. Deleting beats writing 0 — flattenProvider treats the
      // field as optional, so the cards fall back to their no-price rendering instead of
      // advertising a free session.
      await instructorRef.set(
        { lowestPrice: FieldValue.delete(), hourlyRate: FieldValue.delete() },
        { merge: true },
      );
      return;
    }

    await instructorRef.set({ lowestPrice: lowest, hourlyRate: lowest }, { merge: true });
  },
);

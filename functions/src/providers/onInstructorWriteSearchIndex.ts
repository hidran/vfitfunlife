import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { providerSearchPatch } from "./searchIndex";
import { region } from "../lib/runtimeOptions";

/** gRPC status codes this trigger treats as "nothing left to do". */
const NOT_FOUND = 5;
const FAILED_PRECONDITION = 9;

/**
 * Keeps `searchTerms` (see searchIndex.ts) on `instructors/{id}` current, whoever wrote the
 * document: applyAsProvider, the profile editor, onProviderServiceWrite's categoryIds, seeds.
 *
 * No reads (the event carries the document) and no write unless the terms changed, so the
 * trigger's own write re-fires it once as a no-op. `update()` guarded by the event's
 * updateTime: a stale event never overwrites a newer document, and a write racing a delete
 * fails NOT_FOUND instead of resurrecting the provider.
 */
export const onInstructorWriteSearchIndex = onDocumentWritten(
  { region, document: "instructors/{instructorId}", retry: true },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const patch = providerSearchPatch(after.data() ?? {});
    if (!patch) return;
    try {
      await getFirestore()
        .collection("instructors")
        .doc(event.params.instructorId)
        .update(patch, { lastUpdateTime: after.updateTime });
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      if (code === NOT_FOUND || code === FAILED_PRECONDITION) return;
      throw err;
    }
  },
);

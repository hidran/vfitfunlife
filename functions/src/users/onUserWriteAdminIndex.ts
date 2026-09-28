import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { adminIndexPatch } from "./adminIndex";
import { region } from "../lib/runtimeOptions";

/** gRPC status codes this trigger treats as "nothing left to do". */
const NOT_FOUND = 5;
const FAILED_PRECONDITION = 9;

export interface AdminIndexWriteDeps {
  /** Applies the patch only if the document is still the version the event carried. */
  update: (patch: Record<string, unknown>) => Promise<unknown>;
}

/**
 * The patch that brings `users/{id}` in line with its derived admin-index fields (see
 * adminIndex.ts), plus the two normalizations every admin list query now depends on:
 * `createdAt` (every list is `orderBy('createdAt')`, which silently drops a document without
 * it) and `isSuspended` (the active/suspended filters are equality filters, which never
 * match an absent field). Both only fill a missing value; they never overwrite one.
 *
 * null when nothing needs writing — the common case, and the one that ends the loop when
 * the trigger sees its own write.
 */
export function userAdminIndexPatch(
  id: string,
  data: Record<string, unknown>,
  createTime: Timestamp | undefined
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = { ...(adminIndexPatch(id, data) ?? {}) };
  if ((data.createdAt === undefined || data.createdAt === null) && createTime) {
    patch.createdAt = createTime;
  }
  if (!Object.prototype.hasOwnProperty.call(data, "isSuspended")) patch.isSuspended = false;
  return Object.keys(patch).length ? patch : null;
}

/** Writes the patch; a doc deleted or rewritten since the event is not an error (see below). */
export async function applyUserAdminIndex(
  id: string,
  data: Record<string, unknown>,
  createTime: Timestamp | undefined,
  deps: AdminIndexWriteDeps
): Promise<boolean> {
  const patch = userAdminIndexPatch(id, data, createTime);
  if (!patch) return false;
  try {
    await deps.update(patch);
    return true;
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    // NOT_FOUND: deleted in the meantime. FAILED_PRECONDITION: written again in the
    // meantime — that newer write fires this trigger itself, with fresher data.
    if (code === NOT_FOUND || code === FAILED_PRECONDITION) return false;
    throw err;
  }
}

/**
 * Keeps `searchTokens`, `adminHidden` and `providerVerification` on `users/{uid}` current,
 * whoever wrote the document (the app, an admin, a callable, a seed script).
 *
 * A trigger rather than client-side writes: user documents are written from many places
 * (registration, profile edits, admin edits, decideProviderApplication, applyAsProvider,
 * bulk delete, seeds), the Firestore rules' field allowlists don't admit these fields from a
 * client anyway, and a value computed server-side can't be forged.
 *
 * Cheap and idempotent: no reads — the event carries the document — and no write unless a
 * derived field actually differs, so the trigger's own write re-fires it exactly once, as a
 * no-op. The write is guarded by the event's updateTime so a stale event never overwrites a
 * newer document. `retry: true` because a missed run would leave a new user out of every
 * admin list; a retried run is harmless for the same reasons.
 */
export const onUserWriteAdminIndex = onDocumentWritten(
  { region, document: "users/{userId}", retry: true },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // deleted: nothing to index
    const data = after.data() ?? {};
    await applyUserAdminIndex(event.params.userId, data, after.createTime, {
      update: (patch) =>
        getFirestore()
          .collection("users")
          .doc(event.params.userId)
          .update(patch, { lastUpdateTime: after.updateTime }),
    });
  },
);

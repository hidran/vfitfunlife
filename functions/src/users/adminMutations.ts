import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { writeAuditLog } from "../lib/audit";
import { adminCascadeDeps, deleteUserCascade } from "./deleteUserCascade";
import { truncateError } from "./bulkDeleteJob";

interface AdminDeleteUserData {
  uid: string;
  reason: string;
}

/** 1s, then 2s: up to 3 total attempts. The cascade is idempotent, so a retry is safe. */
const RETRY_DELAYS_MS = [1000, 2000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Superadmin-only: hard-delete a user via deleteUserCascade.
 * Writes an audit_logs entry capturing the previous user doc.
 */
export const adminDeleteUser = onCall<AdminDeleteUserData>(
  { region: "europe-west1" },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const callerSnap = await getFirestore()
      .collection("users")
      .doc(callerUid)
      .get();
    const caller = callerSnap.data();
    if (caller?.role !== "superadmin") {
      throw new HttpsError("permission-denied", "Superadmin required");
    }

    const { uid, reason } = req.data;
    if (!uid || !reason) {
      throw new HttpsError("invalid-argument", "uid and reason required");
    }
    if (uid === callerUid) {
      throw new HttpsError("failed-precondition", "Cannot self-delete");
    }

    const targetSnap = await getFirestore().collection("users").doc(uid).get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "User not found");
    }
    const before = targetSnap.data();

    // Same definition of "delete" as the bulk job: Auth, the user's subcollections, their
    // provider record and their files — not just the top-level document. The cascade is
    // idempotent, so a transient failure gets a couple of quick retries before giving up.
    let lastError: unknown;
    let succeeded = false;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        await deleteUserCascade(uid, adminCascadeDeps());
        succeeded = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) await delay(RETRY_DELAYS_MS[attempt]);
      }
    }

    if (!succeeded) {
      await writeAuditLog({
        actorUid: callerUid,
        actorEmail: caller?.email ?? "",
        actorRole: "superadmin",
        action: "delete",
        entityType: "user",
        entityId: uid,
        before,
        after: { partial: true, error: truncateError(lastError) },
        reason,
      });
      throw new HttpsError("internal", "Could not fully delete the user; see audit_logs for what happened so far");
    }

    await writeAuditLog({
      actorUid: callerUid,
      actorEmail: caller?.email ?? "",
      actorRole: "superadmin",
      action: "delete",
      entityType: "user",
      entityId: uid,
      before,
      reason,
    });

    return { ok: true };
  },
);

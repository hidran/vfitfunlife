import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { writeAuditLog } from "../lib/audit";

interface AdminDeleteUserData {
  uid: string;
  reason: string;
}

/**
 * Superadmin-only: hard-delete a user document and its Firebase Auth record.
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

    await getFirestore().collection("users").doc(uid).delete();

    try {
      await getAuth().deleteUser(uid);
    } catch (e) {
      console.warn(
        "[adminDeleteUser] auth deletion failed (ok if user already gone)",
        e,
      );
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

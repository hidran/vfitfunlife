import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, FieldPath } from "firebase-admin/firestore";
import { writeAuditLog } from "../lib/audit";
import { adminCascadeDeps, deleteUserCascade } from "./deleteUserCascade";
import { processBulkDeleteJob, type UserOutcome } from "./bulkDeleteJob";

const region = "europe-west1";
export const MAX_BULK_DELETE = 500;
const JOBS = "adminJobs";

export function validateBulkDeleteInput(data: unknown): { uids: string[]; reason: string } {
  const d = (data ?? {}) as { uids?: unknown; reason?: unknown };
  if (!Array.isArray(d.uids) || d.uids.length === 0) {
    throw new HttpsError("invalid-argument", "uids required");
  }
  if (d.uids.some((u) => typeof u !== "string" || u === "" || u.includes("/"))) {
    throw new HttpsError("invalid-argument", "every uid must be a non-empty string without '/'");
  }
  const uids = [...new Set(d.uids as string[])];
  if (uids.length > MAX_BULK_DELETE) {
    throw new HttpsError("invalid-argument", `at most ${MAX_BULK_DELETE} users per job`);
  }
  const reason = typeof d.reason === "string" ? d.reason.trim() : "";
  if (!reason) throw new HttpsError("invalid-argument", "reason required");
  return { uids, reason };
}

/** Superadmin-only: queue a bulk delete and return at once. The work runs in onAdminJobCreated. */
export const adminBulkDeleteUsers = onCall({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");

  const db = getFirestore();
  const caller = (await db.collection("users").doc(callerUid).get()).data();
  if (caller?.role !== "superadmin") throw new HttpsError("permission-denied", "Superadmin required");

  const { uids, reason } = validateBulkDeleteInput(req.data);
  const actorEmail = (caller?.email as string | undefined) ?? req.auth?.token?.email ?? "";
  const ref = db.collection(JOBS).doc();
  await ref.set({
    type: "bulk_delete_users",
    status: "queued",
    uids,
    reason,
    actorUid: callerUid,
    actorEmail,
    total: uids.length,
    done: 0,
    failed: 0,
    skipped: 0,
    results: {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUid: callerUid,
    actorEmail,
    actorRole: "superadmin",
    action: "create",
    entityType: "admin_job",
    entityId: ref.id,
    after: { type: "bulk_delete_users", total: uids.length, uids },
    reason,
  });

  return { jobId: ref.id };
});

export const onAdminJobCreated = onDocumentCreated(
  { region, document: `${JOBS}/{jobId}`, timeoutSeconds: 540, memory: "512MiB", retry: true },
  async (event) => {
    const created = event.data;
    if (!created) return;
    // A retry delivers the snapshot from creation time; read the live doc for progress so far.
    const snap = await created.ref.get();
    const data = snap.data();
    if (!data || data.type !== "bulk_delete_users") return;
    if (data.status === "completed" || data.status === "completed_with_errors") return;

    await snap.ref.update({ status: "running", startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });

    const db = getFirestore();
    const cascadeDeps = adminCascadeDeps();
    const summary = await processBulkDeleteJob(
      {
        id: snap.id,
        uids: data.uids as string[],
        reason: data.reason as string,
        actorUid: data.actorUid as string,
        actorEmail: (data.actorEmail as string) ?? "",
        results: (data.results as Record<string, UserOutcome>) ?? {},
      },
      {
        getUser: async (uid) => {
          const u = await db.collection("users").doc(uid).get();
          return u.exists ? (u.data() ?? {}) : null;
        },
        cascade: (uid) => deleteUserCascade(uid, cascadeDeps),
        audit: writeAuditLog,
        // FieldPath, not a dotted string: seeded ids contain characters a dotted path would split on.
        recordOutcome: async (uid, outcome) => {
          await snap.ref.update(new FieldPath("results", uid), outcome, "updatedAt", FieldValue.serverTimestamp());
        },
      },
    );

    await snap.ref.update({
      status: summary.failed > 0 ? "completed_with_errors" : "completed",
      done: summary.deleted,
      failed: summary.failed,
      skipped: summary.skipped,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  },
);

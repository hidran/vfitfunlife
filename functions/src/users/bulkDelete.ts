import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, FieldPath, type DocumentReference } from "firebase-admin/firestore";
import { auditLogData, auditLogDocWithId, writeAuditLogOnce, auditLogExists } from "../lib/audit";
import { adminCascadeDeps, deleteUserCascade } from "./deleteUserCascade";
import { processBulkDeleteJob, giveUpOnPending, truncateError, type BulkDeleteJob, type UserOutcome } from "./bulkDeleteJob";

const region = "europe-west1";
export const MAX_BULK_DELETE = 500;
/** Attempts (including the first) before a job gives up on its still-failing uids. */
export const MAX_ATTEMPTS = 3;
const JOBS = "adminJobs";
const MAX_UID_LENGTH = 128;
const RESERVED_UID_PATTERN = /^__.*__$/;

export function validateBulkDeleteInput(data: unknown): { uids: string[]; reason: string } {
  const d = (data ?? {}) as { uids?: unknown; reason?: unknown };
  if (!Array.isArray(d.uids) || d.uids.length === 0) {
    throw new HttpsError("invalid-argument", "uids required");
  }
  if (d.uids.some((u) => typeof u !== "string" || u === "" || u.includes("/"))) {
    throw new HttpsError("invalid-argument", "every uid must be a non-empty string without '/'");
  }
  if (
    d.uids.some((u) => {
      const s = u as string;
      return s.length > MAX_UID_LENGTH || s === "." || s === ".." || RESERVED_UID_PATTERN.test(s);
    })
  ) {
    throw new HttpsError("invalid-argument", "every uid must be a valid Firestore document id");
  }
  const uids = [...new Set(d.uids as string[])];
  if (uids.length > MAX_BULK_DELETE) {
    throw new HttpsError("invalid-argument", `at most ${MAX_BULK_DELETE} users per job`);
  }
  const reason = typeof d.reason === "string" ? d.reason.trim() : "";
  if (!reason) throw new HttpsError("invalid-argument", "reason required");
  return { uids, reason };
}

/** After a processing attempt: keep retrying, or the job is done (successfully or not). */
export function decideAfterRun(input: { finalAttempt: boolean; summary: { failed: number } }): "retry" | "finish" {
  return input.summary.failed > 0 && !input.finalAttempt ? "retry" : "finish";
}

/** Superadmin-only: queue a bulk delete and return at once. The work runs in onAdminJobCreated. */
export const adminBulkDeleteUsers = onCall({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");

  const db = getFirestore();
  const caller = (await db.collection("users").doc(callerUid).get()).data();
  if (caller?.role !== "superadmin") throw new HttpsError("permission-denied", "Superadmin required");

  const { uids, reason } = validateBulkDeleteInput(req.data);

  // One job at a time per actor: a second bulk delete before the first finishes would
  // interleave two sets of retries against the same adminJobs doc semantics.
  const existing = await db
    .collection(JOBS)
    .where("actorUid", "==", callerUid)
    .where("status", "in", ["queued", "running"])
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new HttpsError("failed-precondition", "You already have a bulk delete running");
  }

  const actorEmail = (caller?.email as string | undefined) ?? req.auth?.token?.email ?? "";
  const ref = db.collection(JOBS).doc();

  const batch = db.batch();
  batch.set(ref, {
    type: "bulk_delete_users",
    status: "queued",
    uids,
    reason,
    actorUid: callerUid,
    actorEmail,
    total: uids.length,
    attempts: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    results: {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(
    auditLogDocWithId(`bulk_${ref.id}_queued`),
    auditLogData({
      actorUid: callerUid,
      actorEmail,
      actorRole: "superadmin",
      action: "create",
      entityType: "admin_job",
      entityId: ref.id,
      after: { type: "bulk_delete_users", total: uids.length, uids },
      reason,
    }),
  );
  await batch.commit();

  return { jobId: ref.id };
});

/** Writes several {uid: outcome} pairs via FieldPath (dotted strings would split on odd uids). */
async function saveOutcomeBatch(ref: DocumentReference, batch: Record<string, UserOutcome>): Promise<void> {
  const args: unknown[] = [];
  for (const [uid, outcome] of Object.entries(batch)) {
    args.push(new FieldPath("results", uid), outcome);
  }
  args.push("updatedAt", FieldValue.serverTimestamp());
  await (ref.update as unknown as (...a: unknown[]) => Promise<unknown>)(...args);
}

async function writeSummaryAudit(job: BulkDeleteJob, summary: { deleted: number; skipped: number; failed: number }): Promise<void> {
  await writeAuditLogOnce(`bulk_${job.id}_summary`, {
    actorUid: job.actorUid,
    actorEmail: job.actorEmail,
    actorRole: "superadmin",
    action: "update",
    entityType: "admin_job",
    entityId: job.id,
    after: { type: "bulk_delete_users", total: job.uids.length, ...summary },
    reason: job.reason,
  });
}

export const onAdminJobCreated = onDocumentCreated(
  { region, document: `${JOBS}/{jobId}`, timeoutSeconds: 540, memory: "512MiB", retry: true },
  async (event) => {
    const created = event.data;
    if (!created) return;
    const ref = created.ref;

    // A retry (or a stray duplicate delivery) redelivers the snapshot from creation time, not
    // current progress — read the live doc, and check for a terminal status BEFORE touching
    // attempts/status, so a late delivery after the job already finished can't resurrect it
    // back to "running".
    const snap = await ref.get();
    const data = snap.data();
    if (!data || data.type !== "bulk_delete_users") return;
    if (data.status === "completed" || data.status === "completed_with_errors" || data.status === "failed") return;

    const attempts = ((data.attempts as number) ?? 0) + 1;
    await ref.update({
      attempts: FieldValue.increment(1),
      status: "running",
      updatedAt: FieldValue.serverTimestamp(),
    });

    const job: BulkDeleteJob = {
      id: snap.id,
      uids: data.uids as string[],
      reason: data.reason as string,
      actorUid: data.actorUid as string,
      actorEmail: (data.actorEmail as string) ?? "",
      results: (data.results as Record<string, UserOutcome>) ?? {},
    };

    // Safety net: if something kept making every attempt throw before it could finalize
    // (Gen2 retries for up to 24h), the job would otherwise stay "running" forever. Finish
    // it here instead, without running anything further.
    if (attempts > MAX_ATTEMPTS) {
      const { outcomes, summary } = giveUpOnPending(job);
      await ref.update({ results: outcomes, updatedAt: FieldValue.serverTimestamp() });
      await writeSummaryAudit(job, summary);
      await ref.update({
        status: "completed_with_errors",
        done: summary.deleted,
        failed: summary.failed,
        skipped: summary.skipped,
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const finalAttempt = attempts >= MAX_ATTEMPTS;
    const db = getFirestore();
    const cascadeDeps = adminCascadeDeps();

    try {
      const summary = await processBulkDeleteJob(
        job,
        {
          getUser: async (uid) => {
            const u = await db.collection("users").doc(uid).get();
            return u.exists ? (u.data() ?? {}) : null;
          },
          cascade: (uid) => deleteUserCascade(uid, cascadeDeps),
          auditOnce: writeAuditLogOnce,
          auditExists: auditLogExists,
          saveOutcomes: (batch) => saveOutcomeBatch(ref, batch),
        },
        { finalAttempt },
      );

      if (decideAfterRun({ finalAttempt, summary }) === "retry") {
        // Not the last attempt and users are still failing: throw so the platform retries.
        // The job doc is left at status "running"; processBulkDeleteJob has not written a
        // summary audit for this attempt.
        throw new Error(`${summary.failed} user(s) failed; retrying`);
      }

      await ref.update({
        status: summary.failed > 0 ? "completed_with_errors" : "completed",
        done: summary.deleted,
        failed: summary.failed,
        skipped: summary.skipped,
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if (finalAttempt) {
        // No more retries left and something still went wrong beyond individual user
        // failures (already captured in results/summary above when reachable). Stop here
        // instead of rethrowing into another 24h of platform retries.
        await ref.update({
          status: "failed",
          error: truncateError(err),
          finishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      throw err;
    }
  },
);

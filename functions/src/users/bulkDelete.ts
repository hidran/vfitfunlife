import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, FieldPath, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import {
  auditLogData,
  auditLogDocWithId,
  writeAuditLogOnce,
  auditLogExists,
  type ServerAuditPayload,
} from "../lib/audit";
import { truncateError } from "../lib/errors";
import { isValidUid } from "../lib/uid";
import { adminCascadeDeps, deleteUserCascade } from "./deleteUserCascade";
import {
  processBulkDeleteJob,
  giveUpOnPending,
  isFinishing,
  buildSummaryAuditPayload,
  summaryAuditId,
  type BulkDeleteJob,
  type JobSummary,
  type ProcessOptions,
  type UserOutcome,
} from "./bulkDeleteJob";

const region = "europe-west1";
export const MAX_BULK_DELETE = 500;
/** Attempts (including the first) before a job gives up on its still-failing uids. */
export const MAX_ATTEMPTS = 3;
/** A queued/running job idle longer than this is presumed dead (trigger never ran, or the event was lost). */
export const STALE_JOB_MS = 30 * 60 * 1000;
const JOBS = "adminJobs";

export function validateBulkDeleteInput(data: unknown): { uids: string[]; reason: string } {
  const d = (data ?? {}) as { uids?: unknown; reason?: unknown };
  if (!Array.isArray(d.uids) || d.uids.length === 0) {
    throw new HttpsError("invalid-argument", "uids required");
  }
  if (d.uids.some((u) => !isValidUid(u))) {
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

/**
 * After a processing attempt: keep retrying, or the job is done (successfully or not). Thin
 * wrapper over the one shared `isFinishing` predicate (also used inside processBulkDeleteJob)
 * so the two never drift.
 */
export function decideAfterRun(input: { finalAttempt: boolean; summary: { failed: number } }): "retry" | "finish" {
  return isFinishing({ finalAttempt: input.finalAttempt, failed: input.summary.failed }) ? "finish" : "retry";
}

/**
 * A queued/running job idle longer than STALE_JOB_MS is presumed dead — its trigger never
 * ran, or the triggering event was lost — so a superadmin is never locked out of bulk delete
 * permanently by the one-job-per-actor guard.
 */
export function isStaleJob(updatedAtMillis: number, nowMillis: number = Date.now()): boolean {
  return nowMillis - updatedAtMillis > STALE_JOB_MS;
}

export type ExistingJobAction = "proceed" | "block" | "abandon";

/**
 * What to do about an existing queued/running job for this actor, if any: proceed (there is
 * none), block (one is genuinely still active), or abandon it (it's stale — its trigger
 * never ran, or the event was lost — and must be marked terminal instead of blocking a new
 * one forever). Pure, so the one-job-per-actor guard's actual decision is unit-tested
 * without a real Firestore doc.
 */
export function decideExistingJobAction(
  existing: { updatedAtMillis: number | null } | null,
  nowMillis: number = Date.now(),
): ExistingJobAction {
  if (!existing) return "proceed";
  // No updatedAt at all is anomalous, not evidence of staleness — block, the safer default.
  if (existing.updatedAtMillis === null) return "block";
  return isStaleJob(existing.updatedAtMillis, nowMillis) ? "abandon" : "block";
}

const ABANDONED_ERROR = "abandoned: no progress for 30 minutes";

/** Superadmin-only: queue a bulk delete and return at once. The work runs in onAdminJobCreated. */
export const adminBulkDeleteUsers = onCall({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");

  const db = getFirestore();
  const caller = (await db.collection("users").doc(callerUid).get()).data();
  if (caller?.role !== "superadmin") throw new HttpsError("permission-denied", "Superadmin required");

  const { uids, reason } = validateBulkDeleteInput(req.data);
  const actorEmail = (caller?.email as string | undefined) ?? req.auth?.token?.email ?? "";

  const batch = db.batch();

  // One job at a time per actor: a second bulk delete before the first finishes would
  // interleave two sets of retries against the same adminJobs doc semantics. A stale entry
  // (its trigger never ran, or the event was lost) doesn't count — it would otherwise lock
  // the superadmin out of bulk delete forever, so it's marked terminal (in this same batch)
  // instead of just being ignored: a late trigger delivery for it then finds a terminal
  // status and stops immediately.
  const existingSnap = await db
    .collection(JOBS)
    .where("actorUid", "==", callerUid)
    .where("status", "in", ["queued", "running"])
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  const existingDoc = existingSnap.empty ? null : existingSnap.docs[0];
  const existingUpdatedAt = existingDoc?.data().updatedAt as Timestamp | undefined;
  const action = decideExistingJobAction(
    existingDoc ? { updatedAtMillis: existingUpdatedAt ? existingUpdatedAt.toMillis() : null } : null,
  );

  if (action === "block") {
    throw new HttpsError("failed-precondition", "You already have a bulk delete running");
  }
  if (action === "abandon" && existingDoc) {
    batch.update(existingDoc.ref, {
      status: "failed",
      error: ABANDONED_ERROR,
      updatedAt: FieldValue.serverTimestamp(),
      finishedAt: FieldValue.serverTimestamp(),
    });
    batch.set(
      auditLogDocWithId(`bulk_${existingDoc.id}_abandoned`),
      auditLogData({
        actorUid: callerUid,
        actorEmail,
        actorRole: "superadmin",
        action: "update",
        entityType: "admin_job",
        entityId: existingDoc.id,
        after: { status: "failed", error: ABANDONED_ERROR },
        reason: "superseded by a new bulk delete after 30 minutes with no progress",
      }),
    );
  }

  const ref = db.collection(JOBS).doc();
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

/** The raw fields `runAdminJobAttempt` needs from the adminJobs doc — Firestore-glue-free. */
export interface AttemptInput {
  id: string;
  type?: string;
  status?: string;
  attempts?: number;
  uids: string[];
  reason: string;
  actorUid: string;
  actorEmail?: string;
  results?: Record<string, UserOutcome>;
}

export interface AttemptDeps {
  /**
   * Applies a patch of semantic fields; the real implementation adds updatedAt (and finishedAt
   * when `finished` is set) itself.
   */
  update: (patch: Record<string, unknown> & { finished?: boolean }) => Promise<void>;
  /**
   * Re-reads just the results map — used when finalizing after an unexpected failure, since
   * saveOutcomes may have persisted progress this attempt's in-memory job object doesn't reflect.
   */
  readResults: () => Promise<Record<string, UserOutcome>>;
  auditOnce: (id: string, payload: ServerAuditPayload) => Promise<void>;
  process: (job: BulkDeleteJob, opts: ProcessOptions) => Promise<JobSummary>;
}

export type AttemptResult = "not_a_bulk_delete_job" | "already_terminal" | "gave_up" | "finished" | "failed_terminal";

/**
 * The trigger's entire control flow, extracted so it can be unit-tested without a real
 * Firestore document: terminal early return, the give-up-on-entry safety net, the normal
 * process/retry/finish path, and finalizing as a terminal failure on the last attempt.
 */
export async function runAdminJobAttempt(input: AttemptInput, deps: AttemptDeps): Promise<AttemptResult> {
  if (input.type !== "bulk_delete_users") return "not_a_bulk_delete_job";
  if (input.status === "completed" || input.status === "completed_with_errors" || input.status === "failed") {
    return "already_terminal";
  }

  const attempts = (input.attempts ?? 0) + 1;
  await deps.update({ attempts, status: "running" });

  const job: BulkDeleteJob = {
    id: input.id,
    uids: input.uids,
    reason: input.reason,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail ?? "",
    results: input.results ?? {},
  };

  // Safety net: if something kept making every attempt throw before it could finalize (Gen2
  // retries for up to 24h), the job would otherwise stay "running" forever.
  if (attempts > MAX_ATTEMPTS) {
    await finalizeGaveUp(job, deps);
    return "gave_up";
  }

  const finalAttempt = attempts >= MAX_ATTEMPTS;

  try {
    const summary = await deps.process(job, { finalAttempt });

    if (decideAfterRun({ finalAttempt, summary }) === "retry") {
      // Not the last attempt and users are still failing: throw so the platform retries.
      // processBulkDeleteJob has not written a summary audit for this attempt.
      throw new Error(`${summary.failed} user(s) failed; retrying`);
    }

    await deps.update({
      status: summary.failed > 0 ? "completed_with_errors" : "completed",
      done: summary.deleted,
      failed: summary.failed,
      skipped: summary.skipped,
      finished: true,
    });
    return "finished";
  } catch (err) {
    if (finalAttempt) {
      // No more retries left and something went wrong beyond individual user failures (those
      // are already reflected in the live results doc via saveOutcomes, which this in-memory
      // `job.results` snapshot predates — re-read before finalizing).
      const results = await deps.readResults();
      await finalizeGaveUp({ ...job, results }, deps, truncateError(err));
      return "failed_terminal";
    }
    throw err;
  }
}

/** Shared by both terminal paths: mark every still-pending uid failed, audit once, set final counts. */
async function finalizeGaveUp(job: BulkDeleteJob, deps: AttemptDeps, terminalError?: string): Promise<void> {
  const { outcomes, summary } = giveUpOnPending(job);
  await deps.update({ results: outcomes });
  await deps.auditOnce(summaryAuditId(job.id), buildSummaryAuditPayload(job, summary));
  await deps.update({
    status: terminalError ? "failed" : "completed_with_errors",
    ...(terminalError ? { error: terminalError } : {}),
    done: summary.deleted,
    failed: summary.failed,
    skipped: summary.skipped,
    finished: true,
  });
}

export const onAdminJobCreated = onDocumentCreated(
  { region, document: `${JOBS}/{jobId}`, timeoutSeconds: 540, memory: "512MiB", retry: true },
  async (event) => {
    const created = event.data;
    if (!created) return;
    const ref = created.ref;

    // A retry (or a stray duplicate delivery) redelivers the snapshot from creation time, not
    // current progress — read the live doc; runAdminJobAttempt checks for a terminal status
    // before touching attempts/status, so a late delivery after the job already finished
    // can't resurrect it back to "running". (A duplicate delivery arriving WHILE the job is
    // genuinely still running has no lease to stop it running concurrently with itself — see
    // the design doc's Known limitations.)
    const snap = await ref.get();
    const data = snap.data();
    if (!data) return;

    const db = getFirestore();
    const cascadeDeps = adminCascadeDeps();

    await runAdminJobAttempt(
      {
        id: snap.id,
        type: data.type as string | undefined,
        status: data.status as string | undefined,
        attempts: data.attempts as number | undefined,
        uids: data.uids as string[],
        reason: data.reason as string,
        actorUid: data.actorUid as string,
        actorEmail: data.actorEmail as string | undefined,
        results: (data.results as Record<string, UserOutcome>) ?? {},
      },
      {
        update: async (patch) => {
          const { finished, ...rest } = patch;
          await ref.update({
            ...rest,
            updatedAt: FieldValue.serverTimestamp(),
            ...(finished ? { finishedAt: FieldValue.serverTimestamp() } : {}),
          });
        },
        readResults: async () => {
          const fresh = await ref.get();
          return (fresh.data()?.results as Record<string, UserOutcome>) ?? {};
        },
        auditOnce: writeAuditLogOnce,
        process: (job, opts) =>
          processBulkDeleteJob(
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
            opts,
          ),
      },
    );
  },
);

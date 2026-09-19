import type { ServerAuditPayload } from "../lib/audit";
import { truncateError } from "../lib/errors";

export type SkipReason = "self" | "not_found" | "superadmin";

export type UserOutcome =
  | { status: "deleted" }
  | { status: "skipped"; reason: SkipReason }
  | { status: "failed"; error: string };

export interface BulkDeleteJob {
  id: string;
  uids: string[];
  reason: string;
  actorUid: string;
  actorEmail: string;
  results: Record<string, UserOutcome>;
}

export interface JobDeps {
  getUser: (uid: string) => Promise<Record<string, unknown> | null>;
  cascade: (uid: string) => Promise<unknown>;
  /** Writes the pre-delete (or summary) audit exactly once per id; a repeat call is a no-op. */
  auditOnce: (id: string, payload: ServerAuditPayload) => Promise<void>;
  /**
   * Whether an audit entry already exists at this id — how a resumed uid is told apart from a
   * genuinely missing one.
   */
  auditExists: (id: string) => Promise<boolean>;
  /** Persists a batch of {uid: outcome} progress updates. Called at most once a second. */
  saveOutcomes: (batch: Record<string, UserOutcome>) => Promise<void>;
  concurrency?: number;
  /** Injected clock for the save throttle; defaults to Date.now. */
  now?: () => number;
}

export interface JobSummary {
  deleted: number;
  skipped: number;
  failed: number;
  failures: { uid: string; error: string }[];
  skippedDetail: { uid: string; reason: SkipReason }[];
}

export interface ProcessOptions {
  /** True on the last retry attempt: there is no next attempt, so the job must finish either way. */
  finalAttempt?: boolean;
}

export const GIVE_UP_ERROR = "gave up after 3 attempts";
const SAVE_INTERVAL_MS = 1000;

/**
 * Per-user audit ids live under a `_u_` segment so a uid literally spelled "queued" or
 * "summary" can never collide with the job-level `bulk_<job>_queued` / `bulk_<job>_summary`
 * ids — a collision would make writeAuditLogOnce see ALREADY_EXISTS and silently skip the
 * real per-user audit while the cascade still ran.
 */
function auditId(jobId: string, uid: string): string {
  return `bulk_${jobId}_u_${uid}`;
}

export function summaryAuditId(jobId: string): string {
  return `bulk_${jobId}_summary`;
}

/** The one place the summary audit's payload shape is built — the trigger's give-up/failure paths reuse it. */
export function buildSummaryAuditPayload(job: BulkDeleteJob, summary: JobSummary): ServerAuditPayload {
  return {
    actorUid: job.actorUid,
    actorEmail: job.actorEmail,
    actorRole: "superadmin",
    action: "update",
    entityType: "admin_job",
    entityId: job.id,
    after: { type: "bulk_delete_users", total: job.uids.length, ...summary },
    reason: job.reason,
  };
}

/**
 * Whether a job attempt is "finishing" — the one place this is decided, since bulkDelete.ts's
 * decideAfterRun needs the exact same boolean to choose between throwing (retry) and writing
 * the terminal status (finish).
 */
export function isFinishing(input: { finalAttempt: boolean; failed: number }): boolean {
  return input.finalAttempt || input.failed === 0;
}

/** An outcome the uid itself actually owns — never Object.prototype's inherited members. */
function getOutcome(outcomes: Record<string, UserOutcome>, uid: string): UserOutcome | undefined {
  return Object.hasOwn(outcomes, uid) ? outcomes[uid] : undefined;
}

/**
 * A uid needs (re)processing: it has never been attempted, or its last attempt failed.
 *
 * Reads via Object.hasOwn, not a bare `outcomes[uid]` truthiness check — a uid literally
 * named "constructor" (or "toString", "hasOwnProperty", …) would otherwise read an inherited
 * Object.prototype value, look like it already has a (non-failed) outcome, and never run.
 */
export function isPending(outcomes: Record<string, UserOutcome>, uid: string): boolean {
  const outcome = getOutcome(outcomes, uid);
  return !outcome || outcome.status === "failed";
}

export async function processBulkDeleteJob(
  job: BulkDeleteJob,
  deps: JobDeps,
  opts: ProcessOptions = {},
): Promise<JobSummary> {
  const outcomes: Record<string, UserOutcome> = { ...job.results };
  const pending = job.uids.filter((uid) => isPending(outcomes, uid));
  const buffer = createOutcomeBuffer(deps);

  try {
    await runPool(pending, deps.concurrency ?? 5, async (uid) => {
      const outcome = await deleteOne(uid, job, deps);
      outcomes[uid] = outcome;
      buffer.stage(uid, outcome);
      await buffer.maybeFlush();
    });
  } finally {
    // Whatever didn't hit the once-a-second threshold yet must still land before we return —
    // including right before the exception above propagates, so progress survives a crash.
    await buffer.flush();
  }

  const summary = summarize(job.uids, outcomes);
  if (isFinishing({ finalAttempt: opts.finalAttempt ?? false, failed: summary.failed })) {
    await deps.auditOnce(summaryAuditId(job.id), buildSummaryAuditPayload(job, summary));
  }
  return summary;
}

/**
 * Retries are exhausted: every still-pending uid becomes a terminal failure. Pure — no I/O —
 * so the caller (the trigger, on its give-up/final-failure paths) does the actual persisting.
 *
 * A uid that already failed keeps its previous error, prefixed with the give-up message —
 * losing the last real error behind a generic "gave up" would erase the one clue about what
 * was actually wrong. A uid that was never even attempted gets the bare message.
 */
export function giveUpOnPending(job: BulkDeleteJob): { outcomes: Record<string, UserOutcome>; summary: JobSummary } {
  const outcomes: Record<string, UserOutcome> = { ...job.results };
  for (const uid of job.uids) {
    const existing = getOutcome(outcomes, uid);
    if (isPending(outcomes, uid)) {
      const error = existing?.status === "failed" ?
        truncateError(`${GIVE_UP_ERROR}: ${existing.error}`) :
        GIVE_UP_ERROR;
      outcomes[uid] = { status: "failed", error };
    }
  }
  return { outcomes, summary: summarize(job.uids, outcomes) };
}

async function deleteOne(uid: string, job: BulkDeleteJob, deps: JobDeps): Promise<UserOutcome> {
  if (uid === job.actorUid) return { status: "skipped", reason: "self" };
  try {
    const before = await deps.getUser(uid);
    if (!before) {
      // The doc is gone. Either it never existed, or an earlier attempt got as far as
      // writing the pre-delete audit and crashed before (or during) the cascade — finish it.
      const alreadyStarted = await deps.auditExists(auditId(job.id, uid));
      if (!alreadyStarted) return { status: "skipped", reason: "not_found" };
      await deps.cascade(uid);
      return { status: "deleted" };
    }
    // Deleting another superadmin is a single, deliberate act, never a side effect of a selection.
    if (before.role === "superadmin") return { status: "skipped", reason: "superadmin" };

    // Audit before cascade: if the process dies between these two lines, the audit already
    // proves the delete was started, and the resume branch above finishes it next time.
    await deps.auditOnce(auditId(job.id, uid), {
      actorUid: job.actorUid,
      actorEmail: job.actorEmail,
      actorRole: "superadmin",
      action: "delete",
      entityType: "user",
      entityId: uid,
      before,
      reason: `${job.reason} [bulk job ${job.id}]`,
    });
    await deps.cascade(uid);
    return { status: "deleted" };
  } catch (err) {
    console.error(`[bulkDelete] job ${job.id}: ${uid} failed`, err);
    return { status: "failed", error: truncateError(err) };
  }
}

function summarize(uids: string[], outcomes: Record<string, UserOutcome>): JobSummary {
  const summary: JobSummary = { deleted: 0, skipped: 0, failed: 0, failures: [], skippedDetail: [] };
  for (const uid of uids) {
    const o = getOutcome(outcomes, uid);
    if (o?.status === "deleted") summary.deleted++;
    else if (o?.status === "skipped") {
      summary.skipped++;
      summary.skippedDetail.push({ uid, reason: o.reason });
    } else if (o?.status === "failed") {
      summary.failed++;
      summary.failures.push({ uid, error: o.error });
    }
  }
  return summary;
}

/**
 * Runs `work` over `items` with up to `size` items in flight. On a failure, no new item is
 * started, every item already in flight is allowed to finish, and only then is the first
 * error rethrown — never a silent partial run continuing under an unhandled rejection while
 * other lanes keep going.
 */
async function runPool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try {
        await work(item);
      } catch (err) {
        failed = true;
        firstError = err;
      }
    }
  });
  await Promise.all(lanes);
  if (failed) throw firstError;
}

/** Buffers progress writes and flushes at most once a second, plus a caller-driven final flush. */
function createOutcomeBuffer(deps: JobDeps) {
  const now = deps.now ?? Date.now;
  let pending: Record<string, UserOutcome> = {};
  let lastFlush: number | null = null;

  async function flushNow(): Promise<void> {
    if (Object.keys(pending).length === 0) return;
    const batch = pending;
    pending = {};
    lastFlush = now();
    try {
      await deps.saveOutcomes(batch);
    } catch (err) {
      // Don't lose this batch: put it back so the next flush attempt (including the
      // mandatory final one) retries it. Anything staged since this flush started wins over
      // what's being restored, since it's newer.
      pending = { ...batch, ...pending };
      throw err;
    }
  }

  return {
    stage(uid: string, outcome: UserOutcome): void {
      pending[uid] = outcome;
    },
    async maybeFlush(): Promise<void> {
      if (lastFlush === null || now() - lastFlush >= SAVE_INTERVAL_MS) {
        await flushNow();
      }
    },
    async flush(): Promise<void> {
      await flushNow();
    },
  };
}


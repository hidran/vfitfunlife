import type { ServerAuditPayload } from "../lib/audit";

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
  /** Whether an audit entry already exists at this id — how a resumed uid is told apart from a genuinely missing one. */
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

export const MAX_ERROR_LENGTH = 300;
export const GIVE_UP_ERROR = "gave up after 3 attempts";
const SAVE_INTERVAL_MS = 1000;

function auditId(jobId: string, uid: string): string {
  return `bulk_${jobId}_${uid}`;
}

function summaryAuditId(jobId: string): string {
  return `bulk_${jobId}_summary`;
}

/** A uid needs (re)processing: it has never been attempted, or its last attempt failed. */
export function isPending(outcome: UserOutcome | undefined): boolean {
  return !outcome || outcome.status === "failed";
}

export async function processBulkDeleteJob(
  job: BulkDeleteJob,
  deps: JobDeps,
  opts: ProcessOptions = {},
): Promise<JobSummary> {
  const outcomes: Record<string, UserOutcome> = { ...job.results };
  const pending = job.uids.filter((uid) => isPending(outcomes[uid]));
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
  const finishing = (opts.finalAttempt ?? false) || summary.failed === 0;
  if (finishing) {
    await deps.auditOnce(summaryAuditId(job.id), {
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
  return summary;
}

/**
 * Retries are exhausted: every still-pending uid becomes a terminal failure. Pure — no I/O —
 * so the caller (the trigger, on its give-up path) does the actual persisting.
 */
export function giveUpOnPending(job: BulkDeleteJob): { outcomes: Record<string, UserOutcome>; summary: JobSummary } {
  const outcomes: Record<string, UserOutcome> = { ...job.results };
  for (const uid of job.uids) {
    if (isPending(outcomes[uid])) outcomes[uid] = { status: "failed", error: GIVE_UP_ERROR };
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
    const o = outcomes[uid];
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
    await deps.saveOutcomes(batch);
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

/** Caps a recorded error at MAX_ERROR_LENGTH; prefers "<code>: <message>" when the error has a code. */
export function truncateError(err: unknown): string {
  const message = errorMessage(err);
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH - 1)}…` : message;
}

function errorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as { code?: unknown; message?: unknown; stack?: unknown };
  let message = typeof e.message === "string" ? e.message : String(err);
  // A Firestore BulkWriter failure's own message is just "... failed with: " — the real
  // cause is only in the stack trace, as a "Caused by" line.
  if (message.endsWith("failed with: ") && typeof e.stack === "string") {
    const causedBy = e.stack.split("\n").find((line) => line.trim().startsWith("Caused by"));
    if (causedBy) message = causedBy.trim();
  }
  return e.code !== undefined ? `${String(e.code)}: ${message}` : message;
}

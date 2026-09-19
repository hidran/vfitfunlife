import type { ServerAuditPayload } from "../lib/audit";

export type SkipReason = "self" | "not_found" | "superadmin";

/** `deleting` is transient: written before the cascade so a crashed run can finish the user. */
export type UserOutcome =
  | { status: "deleting" }
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
  audit: (payload: ServerAuditPayload) => Promise<void>;
  recordOutcome: (uid: string, outcome: UserOutcome) => Promise<void>;
  concurrency?: number;
}

export interface JobSummary {
  deleted: number;
  skipped: number;
  failed: number;
  failures: { uid: string; error: string }[];
  skippedDetail: { uid: string; reason: SkipReason }[];
}

export async function processBulkDeleteJob(job: BulkDeleteJob, deps: JobDeps): Promise<JobSummary> {
  const outcomes: Record<string, UserOutcome> = { ...job.results };
  const pending = job.uids.filter((uid) => !outcomes[uid] || outcomes[uid].status === "deleting");

  await runPool(pending, deps.concurrency ?? 5, async (uid) => {
    const outcome = await deleteOne(uid, job, outcomes[uid]?.status === "deleting", deps);
    outcomes[uid] = outcome;
    await deps.recordOutcome(uid, outcome);
  });

  const summary = summarize(job.uids, outcomes);
  await deps.audit({
    actorUid: job.actorUid,
    actorEmail: job.actorEmail,
    actorRole: "superadmin",
    action: "update",
    entityType: "admin_job",
    entityId: job.id,
    after: { type: "bulk_delete_users", total: job.uids.length, ...summary },
    reason: job.reason,
  });
  return summary;
}

async function deleteOne(
  uid: string,
  job: BulkDeleteJob,
  resuming: boolean,
  deps: JobDeps,
): Promise<UserOutcome> {
  if (uid === job.actorUid) return { status: "skipped", reason: "self" };
  try {
    const before = await deps.getUser(uid);
    if (!before && !resuming) return { status: "skipped", reason: "not_found" };
    // Deleting another superadmin is a single, deliberate act, never a side effect of a selection.
    if (before?.role === "superadmin") return { status: "skipped", reason: "superadmin" };

    await deps.recordOutcome(uid, { status: "deleting" });
    await deps.cascade(uid);
    await deps.audit({
      actorUid: job.actorUid,
      actorEmail: job.actorEmail,
      actorRole: "superadmin",
      action: "delete",
      entityType: "user",
      entityId: uid,
      before,
      reason: `${job.reason} [bulk job ${job.id}]`,
    });
    return { status: "deleted" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[bulkDelete] job ${job.id}: ${uid} failed`, err);
    return { status: "failed", error };
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

async function runPool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
    }
  });
  await Promise.all(lanes);
}

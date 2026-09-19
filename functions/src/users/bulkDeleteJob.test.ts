import { describe, it, expect, vi } from "vitest";
import { processBulkDeleteJob, type BulkDeleteJob, type JobDeps, type UserOutcome } from "./bulkDeleteJob";

const USERS: Record<string, Record<string, unknown>> = {
  a: { role: "customer", email: "a@x.it" },
  b: { role: "provider", email: "b@x.it" },
  boss: { role: "superadmin", email: "boss@x.it" },
  me: { role: "superadmin", email: "me@x.it" },
};

function job(overrides: Partial<BulkDeleteJob> = {}): BulkDeleteJob {
  return { id: "job1", uids: ["a", "b"], reason: "demo cleanup", actorUid: "me", actorEmail: "me@x.it", results: {}, ...overrides };
}

function deps(overrides: Partial<JobDeps> = {}) {
  const outcomes: Record<string, UserOutcome[]> = {};
  const d: JobDeps = {
    getUser: vi.fn(async (uid: string) => USERS[uid] ?? null),
    cascade: vi.fn(async () => undefined),
    audit: vi.fn(async () => undefined),
    recordOutcome: vi.fn(async (uid: string, o: UserOutcome) => { (outcomes[uid] ??= []).push(o); }),
    concurrency: 2,
    ...overrides,
  };
  return { d, outcomes };
}

describe("processBulkDeleteJob", () => {
  it("deletes each user and audits it with the pre-delete snapshot", async () => {
    const { d, outcomes } = deps();
    const summary = await processBulkDeleteJob(job(), d);

    expect(d.cascade).toHaveBeenCalledTimes(2);
    expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "delete", entityType: "user", entityId: "a", before: USERS.a,
      actorUid: "me", actorRole: "superadmin", reason: "demo cleanup [bulk job job1]",
    }));
    expect(outcomes.a).toEqual([{ status: "deleting" }, { status: "deleted" }]);
    expect(summary).toMatchObject({ deleted: 2, skipped: 0, failed: 0 });
  });

  it("skips the caller, superadmins and missing users without deleting them", async () => {
    const { d, outcomes } = deps();
    const summary = await processBulkDeleteJob(job({ uids: ["me", "boss", "ghost", "a"] }), d);

    expect(d.cascade).toHaveBeenCalledTimes(1);
    expect(d.cascade).toHaveBeenCalledWith("a");
    expect(outcomes.me).toEqual([{ status: "skipped", reason: "self" }]);
    expect(outcomes.boss).toEqual([{ status: "skipped", reason: "superadmin" }]);
    expect(outcomes.ghost).toEqual([{ status: "skipped", reason: "not_found" }]);
    expect(summary).toMatchObject({ deleted: 1, skipped: 3, failed: 0 });
  });

  it("records a failure and carries on with the rest", async () => {
    const { d, outcomes } = deps({
      cascade: vi.fn(async (uid: string) => { if (uid === "a") throw new Error("storage down"); }),
    });
    const summary = await processBulkDeleteJob(job(), d);

    expect(outcomes.a.at(-1)).toEqual({ status: "failed", error: "storage down" });
    expect(outcomes.b.at(-1)).toEqual({ status: "deleted" });
    expect(summary.failures).toEqual([{ uid: "a", error: "storage down" }]);
  });

  it("resumes a retried job: finished users are not repeated, interrupted ones are completed", async () => {
    const { d } = deps({ getUser: vi.fn(async (uid: string) => (uid === "b" ? null : USERS[uid] ?? null)) });
    const summary = await processBulkDeleteJob(
      job({ uids: ["a", "b"], results: { a: { status: "deleted" }, b: { status: "deleting" } } }),
      d,
    );

    // a is done; b was mid-delete when the last run died (its doc is already gone) — finish and audit it.
    expect(d.cascade).toHaveBeenCalledTimes(1);
    expect(d.cascade).toHaveBeenCalledWith("b");
    expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "b", before: null }));
    expect(summary).toMatchObject({ deleted: 2, skipped: 0, failed: 0 });
  });

  it("writes one summary audit entry for the job", async () => {
    const { d } = deps({ cascade: vi.fn(async (uid: string) => { if (uid === "b") throw new Error("x"); }) });
    await processBulkDeleteJob(job(), d);

    expect(d.audit).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "update", entityType: "admin_job", entityId: "job1",
      after: expect.objectContaining({ deleted: 1, skipped: 0, failed: 1, failures: [{ uid: "b", error: "x" }] }),
    }));
  });
});

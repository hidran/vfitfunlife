import { describe, it, expect, vi } from "vitest";
import {
  processBulkDeleteJob,
  giveUpOnPending,
  truncateError,
  isPending,
  GIVE_UP_ERROR,
  MAX_ERROR_LENGTH,
  type BulkDeleteJob,
  type JobDeps,
  type UserOutcome,
} from "./bulkDeleteJob";

const USERS: Record<string, Record<string, unknown>> = {
  a: { role: "customer", email: "a@x.it" },
  b: { role: "provider", email: "b@x.it" },
  c: { role: "customer", email: "c@x.it" },
  boss: { role: "superadmin", email: "boss@x.it" },
  me: { role: "superadmin", email: "me@x.it" },
};

function job(overrides: Partial<BulkDeleteJob> = {}): BulkDeleteJob {
  return { id: "job1", uids: ["a", "b"], reason: "demo cleanup", actorUid: "me", actorEmail: "me@x.it", results: {}, ...overrides };
}

function deps(overrides: Partial<JobDeps> = {}) {
  const savedBatches: Record<string, UserOutcome>[] = [];
  const merged: Record<string, UserOutcome> = {};
  const d: JobDeps = {
    getUser: vi.fn(async (uid: string) => USERS[uid] ?? null),
    cascade: vi.fn(async () => undefined),
    auditOnce: vi.fn(async () => undefined),
    auditExists: vi.fn(async () => false),
    saveOutcomes: vi.fn(async (batch: Record<string, UserOutcome>) => {
      savedBatches.push(batch);
      Object.assign(merged, batch);
    }),
    concurrency: 2,
    ...overrides,
  };
  return { d, savedBatches, merged };
}

describe("processBulkDeleteJob", () => {
  it("audits each user once, before the cascade, with the pre-delete snapshot", async () => {
    const auditOnce = vi.fn(async () => undefined);
    const cascade = vi.fn(async (uid: string) => {
      // Audit-first: by the time the cascade runs, the pre-delete audit for this uid must
      // already have been written.
      expect(auditOnce).toHaveBeenCalledWith(`bulk_job1_${uid}`, expect.objectContaining({ entityId: uid }));
    });
    const { d } = deps({ auditOnce, cascade });
    const summary = await processBulkDeleteJob(job(), d);

    expect(auditOnce).toHaveBeenCalledWith("bulk_job1_a", expect.objectContaining({
      action: "delete", entityType: "user", entityId: "a", before: USERS.a,
      actorUid: "me", actorRole: "superadmin", reason: "demo cleanup [bulk job job1]",
    }));
    expect(cascade).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ deleted: 2, skipped: 0, failed: 0 });
  });

  it("skips the caller, superadmins and missing users without deleting them", async () => {
    const { d, merged } = deps();
    const summary = await processBulkDeleteJob(job({ uids: ["me", "boss", "ghost", "a"] }), d);

    expect(d.cascade).toHaveBeenCalledTimes(1);
    expect(d.cascade).toHaveBeenCalledWith("a");
    expect(merged.me).toEqual({ status: "skipped", reason: "self" });
    expect(merged.boss).toEqual({ status: "skipped", reason: "superadmin" });
    expect(merged.ghost).toEqual({ status: "skipped", reason: "not_found" });
    expect(summary).toMatchObject({ deleted: 1, skipped: 3, failed: 0 });
  });

  it("records a failure and carries on with the rest", async () => {
    const { d, merged } = deps({
      cascade: vi.fn(async (uid: string) => { if (uid === "a") throw new Error("storage down"); }),
    });
    const summary = await processBulkDeleteJob(job(), d);

    expect(merged.a).toEqual({ status: "failed", error: "storage down" });
    expect(merged.b).toEqual({ status: "deleted" });
    expect(summary.failures).toEqual([{ uid: "a", error: "storage down" }]);
  });

  it("a failing auditOnce fails the user without ever running the cascade", async () => {
    const cascade = vi.fn(async () => undefined);
    const { d, merged } = deps({ auditOnce: vi.fn(async () => { throw new Error("audit down"); }), cascade });
    const summary = await processBulkDeleteJob(job({ uids: ["a"] }), d);

    expect(cascade).not.toHaveBeenCalled();
    expect(merged.a).toEqual({ status: "failed", error: "audit down" });
    expect(summary).toMatchObject({ deleted: 0, failed: 1 });
  });

  it("resumes a retried job: a deleted uid is left alone, a previously-failed one is retried", async () => {
    const { d } = deps();
    const summary = await processBulkDeleteJob(
      job({ uids: ["a", "b"], results: { a: { status: "deleted" }, b: { status: "failed", error: "x" } } }),
      d,
    );

    expect(d.cascade).toHaveBeenCalledTimes(1);
    expect(d.cascade).toHaveBeenCalledWith("b");
    expect(summary).toMatchObject({ deleted: 2, skipped: 0, failed: 0 });
  });

  it("resumes a crash mid-delete: doc gone but its audit exists -> finishes the cascade, no duplicate audit", async () => {
    const { d } = deps({
      getUser: vi.fn(async (uid: string) => (uid === "b" ? null : USERS[uid] ?? null)),
      auditExists: vi.fn(async (id: string) => id === "bulk_job1_b"),
    });
    const summary = await processBulkDeleteJob(job({ uids: ["a", "b"] }), d);

    expect(d.cascade).toHaveBeenCalledWith("b");
    expect(d.auditOnce).not.toHaveBeenCalledWith("bulk_job1_b", expect.anything());
    expect(summary).toMatchObject({ deleted: 2, skipped: 0, failed: 0 });
  });

  it("a doc that is genuinely gone, with no audit ever written, is skipped as not_found", async () => {
    const { d } = deps({ getUser: vi.fn(async (uid: string) => (uid === "b" ? null : USERS[uid] ?? null)) });
    const summary = await processBulkDeleteJob(job({ uids: ["a", "b"] }), d);

    expect(d.cascade).toHaveBeenCalledTimes(1);
    expect(d.cascade).toHaveBeenCalledWith("a");
    expect(summary).toMatchObject({ deleted: 1, skipped: 1, failed: 0 });
  });

  it("does not write a summary audit while users failed and this is not the final attempt", async () => {
    const { d } = deps({ cascade: vi.fn(async (uid: string) => { if (uid === "b") throw new Error("x"); }) });
    await processBulkDeleteJob(job(), d);
    expect(d.auditOnce).not.toHaveBeenCalledWith("bulk_job1_summary", expect.anything());
  });

  it("writes the summary audit on the final attempt even with failures", async () => {
    const { d } = deps({ cascade: vi.fn(async (uid: string) => { if (uid === "b") throw new Error("x"); }) });
    const summary = await processBulkDeleteJob(job(), d, { finalAttempt: true });

    expect(d.auditOnce).toHaveBeenCalledWith("bulk_job1_summary", expect.objectContaining({
      action: "update", entityType: "admin_job", entityId: "job1",
      after: expect.objectContaining({ deleted: 1, skipped: 0, failed: 1, failures: [{ uid: "b", error: "x" }] }),
    }));
    expect(summary).toMatchObject({ deleted: 1, failed: 1 });
  });

  it("writes the summary audit as soon as nothing failed, final attempt or not", async () => {
    const { d } = deps();
    await processBulkDeleteJob(job(), d);
    expect(d.auditOnce).toHaveBeenCalledWith("bulk_job1_summary", expect.objectContaining({
      after: expect.objectContaining({ deleted: 2, failed: 0 }),
    }));
  });

  it("buffers outcome writes and flushes at most once a second, plus a final flush", async () => {
    const clock = { now: 1_000 };
    const { d } = deps({
      concurrency: 5,
      now: () => clock.now,
      getUser: vi.fn(async (uid: string) => ({ role: "customer", email: `${uid}@x.it` })),
    });
    await processBulkDeleteJob(job({ uids: ["a", "b", "c", "d", "e"] }), d);
    // The clock never advances in this test, so only the very first (immediate) flush and
    // the mandatory final flush should have happened — not one write per user.
    expect(d.saveOutcomes).toHaveBeenCalledTimes(2);
  });

  it("propagates a saveOutcomes failure only after in-flight cascades finish, starting nothing new", async () => {
    const cascaded: string[] = [];
    let resolveB!: () => void;
    const bGate = new Promise<void>((resolve) => { resolveB = resolve; });

    const saveOutcomes = vi.fn(async (batch: Record<string, UserOutcome>) => {
      if ("a" in batch) throw new Error("save failed");
    });
    const { d } = deps({
      concurrency: 2,
      saveOutcomes,
      cascade: vi.fn(async (uid: string) => {
        cascaded.push(uid);
        if (uid === "b") await bGate;
      }),
    });

    const run = processBulkDeleteJob(job({ uids: ["a", "b", "c"] }), d);

    await vi.waitFor(() => expect(saveOutcomes).toHaveBeenCalled());
    resolveB();

    await expect(run).rejects.toThrow("save failed");
    expect(cascaded).toEqual(["a", "b"]);
  });
});

describe("isPending", () => {
  it("is pending with no outcome yet, or a failed one; terminal otherwise", () => {
    expect(isPending(undefined)).toBe(true);
    expect(isPending({ status: "failed", error: "x" })).toBe(true);
    expect(isPending({ status: "deleted" })).toBe(false);
    expect(isPending({ status: "skipped", reason: "self" })).toBe(false);
  });
});

describe("giveUpOnPending", () => {
  it("marks every unfinished uid a terminal failure, leaving finished ones alone", () => {
    const { outcomes, summary } = giveUpOnPending(job({
      uids: ["a", "b", "c"],
      results: { a: { status: "deleted" }, b: { status: "failed", error: "x" } },
    }));

    expect(outcomes.a).toEqual({ status: "deleted" });
    expect(outcomes.b).toEqual({ status: "failed", error: GIVE_UP_ERROR });
    expect(outcomes.c).toEqual({ status: "failed", error: GIVE_UP_ERROR });
    expect(summary).toMatchObject({ deleted: 1, failed: 2 });
  });
});

describe("truncateError", () => {
  it("truncates long messages to MAX_ERROR_LENGTH characters", () => {
    const result = truncateError(new Error("x".repeat(400)));
    expect(result.length).toBe(MAX_ERROR_LENGTH);
  });

  it("prefers `${code}: ${message}` when the error carries a code", () => {
    const err = Object.assign(new Error("boom"), { code: 7 });
    expect(truncateError(err)).toBe("7: boom");
  });

  it("uses the first Caused-by stack line for a BulkWriter-style failure", () => {
    const err = Object.assign(new Error("A write batch operation failed with: "), {
      stack: "Error: A write batch operation failed with: \n    at x\nCaused by: Error: permission denied\n    at y",
    });
    expect(truncateError(err)).toBe("Caused by: Error: permission denied");
  });

  it("falls back to String(err) for a non-object throw", () => {
    expect(truncateError("just a string")).toBe("just a string");
  });
});

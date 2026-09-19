import { describe, it, expect, vi } from "vitest";
import {
  validateBulkDeleteInput,
  MAX_BULK_DELETE,
  MAX_ATTEMPTS,
  decideAfterRun,
  runAdminJobAttempt,
  isStaleJob,
  decideExistingJobAction,
  STALE_JOB_MS,
  type AttemptInput,
  type AttemptDeps,
} from "./bulkDelete";

describe("validateBulkDeleteInput", () => {
  it("accepts uids and a reason, de-duplicating and trimming", () => {
    expect(validateBulkDeleteInput({ uids: ["a", "b", "a"], reason: "  demo  " })).toEqual({ uids: ["a", "b"], reason: "demo" });
  });

  it("requires at least one uid", () => {
    expect(() => validateBulkDeleteInput({ uids: [], reason: "x" })).toThrow(/uids/);
    expect(() => validateBulkDeleteInput({ reason: "x" })).toThrow(/uids/);
  });

  it("requires a reason", () => {
    expect(() => validateBulkDeleteInput({ uids: ["a"], reason: "   " })).toThrow(/reason/);
  });

  it("rejects malformed uids", () => {
    expect(() => validateBulkDeleteInput({ uids: ["a/b"], reason: "x" })).toThrow(/uid/);
    expect(() => validateBulkDeleteInput({ uids: [42], reason: "x" })).toThrow(/uid/);
  });

  it(`caps a job at ${MAX_BULK_DELETE} users`, () => {
    const uids = Array.from({ length: MAX_BULK_DELETE + 1 }, (_, i) => `u${i}`);
    expect(() => validateBulkDeleteInput({ uids, reason: "x" })).toThrow(/500/);
  });

  it("rejects a uid longer than 128 characters", () => {
    expect(() => validateBulkDeleteInput({ uids: ["u".repeat(129)], reason: "x" })).toThrow(/uid/);
  });

  it('rejects "." and ".." as uids', () => {
    expect(() => validateBulkDeleteInput({ uids: ["."], reason: "x" })).toThrow(/uid/);
    expect(() => validateBulkDeleteInput({ uids: [".."], reason: "x" })).toThrow(/uid/);
  });

  it("rejects reserved __x__-style ids", () => {
    expect(() => validateBulkDeleteInput({ uids: ["__proto__"], reason: "x" })).toThrow(/uid/);
    expect(() => validateBulkDeleteInput({ uids: ["__x__"], reason: "x" })).toThrow(/uid/);
  });

  it("still accepts an ordinary uid that merely contains dots or underscores", () => {
    expect(validateBulkDeleteInput({ uids: ["a.b_c"], reason: "x" })).toEqual({ uids: ["a.b_c"], reason: "x" });
  });
});

describe("decideAfterRun", () => {
  it("retries when users failed and this was not the final attempt", () => {
    expect(decideAfterRun({ finalAttempt: false, summary: { failed: 2 } })).toBe("retry");
  });

  it("finishes when nothing failed, even mid-attempts", () => {
    expect(decideAfterRun({ finalAttempt: false, summary: { failed: 0 } })).toBe("finish");
  });

  it("finishes on the final attempt even if users are still failing", () => {
    expect(decideAfterRun({ finalAttempt: true, summary: { failed: 3 } })).toBe("finish");
  });
});

describe("MAX_ATTEMPTS", () => {
  it("is 3", () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });
});

describe("isStaleJob", () => {
  it("is not stale within the window", () => {
    const now = Date.now();
    expect(isStaleJob(now - 10 * 60 * 1000, now)).toBe(false);
  });

  it("is stale past 30 minutes", () => {
    const now = Date.now();
    expect(isStaleJob(now - 31 * 60 * 1000, now)).toBe(true);
  });

  it("is not yet stale exactly at the boundary", () => {
    const now = Date.now();
    expect(isStaleJob(now - STALE_JOB_MS, now)).toBe(false);
  });
});

describe("decideExistingJobAction", () => {
  it("proceeds when there is no existing queued/running job", () => {
    expect(decideExistingJobAction(null)).toBe("proceed");
  });

  it("blocks when an existing job is still within the staleness window", () => {
    const now = Date.now();
    expect(decideExistingJobAction({ updatedAtMillis: now - 10 * 60 * 1000 }, now)).toBe("block");
  });

  it("abandons a stale existing job instead of blocking forever", () => {
    const now = Date.now();
    expect(decideExistingJobAction({ updatedAtMillis: now - 31 * 60 * 1000 }, now)).toBe("abandon");
  });

  it("blocks (the safer default) when the existing job has no updatedAt at all", () => {
    expect(decideExistingJobAction({ updatedAtMillis: null })).toBe("block");
  });
});

function baseInput(overrides: Partial<AttemptInput> = {}): AttemptInput {
  return {
    id: "j1",
    type: "bulk_delete_users",
    status: "queued",
    attempts: 0,
    uids: ["a", "b"],
    reason: "demo",
    actorUid: "me",
    actorEmail: "me@x.it",
    results: {},
    ...overrides,
  };
}

function attemptDeps(overrides: Partial<AttemptDeps> = {}) {
  const deps: AttemptDeps = {
    update: vi.fn(async () => undefined),
    readResults: vi.fn(async () => ({})),
    auditOnce: vi.fn(async () => undefined),
    process: vi.fn(async () => ({ deleted: 0, skipped: 0, failed: 0, failures: [], skippedDetail: [] })),
    ...overrides,
  };
  return deps;
}

describe("runAdminJobAttempt", () => {
  it("does nothing for a doc that isn't a bulk_delete_users job", async () => {
    const deps = attemptDeps();
    const result = await runAdminJobAttempt(baseInput({ type: "something_else" }), deps);

    expect(result).toBe("not_a_bulk_delete_job");
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.process).not.toHaveBeenCalled();
  });

  it.each(["completed", "completed_with_errors", "failed"] as const)(
    "does nothing once status is already terminal (%s)",
    async (status) => {
      const deps = attemptDeps();
      const result = await runAdminJobAttempt(baseInput({ status }), deps);

      expect(result).toBe("already_terminal");
      expect(deps.update).not.toHaveBeenCalled();
      expect(deps.process).not.toHaveBeenCalled();
    },
  );

  it("bumps attempts, marks running, runs the processor, and finishes when nothing failed", async () => {
    const process = vi.fn(async () => ({ deleted: 2, skipped: 0, failed: 0, failures: [], skippedDetail: [] }));
    const deps = attemptDeps({ process });

    const result = await runAdminJobAttempt(baseInput({ attempts: 0 }), deps);

    expect(deps.update).toHaveBeenCalledWith({ attempts: 1, status: "running" });
    expect(process).toHaveBeenCalledWith(expect.objectContaining({ id: "j1", uids: ["a", "b"] }), { finalAttempt: false });
    expect(deps.update).toHaveBeenCalledWith({ status: "completed", done: 2, failed: 0, skipped: 0, finished: true });
    expect(result).toBe("finished");
  });

  it("throws to force a platform retry when users failed and this was not the final attempt", async () => {
    const process = vi.fn(async () => ({ deleted: 0, skipped: 0, failed: 1, failures: [{ uid: "a", error: "x" }], skippedDetail: [] }));
    const deps = attemptDeps({ process });

    await expect(runAdminJobAttempt(baseInput({ attempts: 0 }), deps)).rejects.toThrow(/failed; retrying/);
    expect(deps.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed_with_errors" }));
    expect(deps.readResults).not.toHaveBeenCalled();
  });

  it("finishes with completed_with_errors on the final attempt even if users are still failing", async () => {
    const process = vi.fn(async () => ({ deleted: 1, skipped: 0, failed: 1, failures: [{ uid: "b", error: "x" }], skippedDetail: [] }));
    const deps = attemptDeps({ process });

    const result = await runAdminJobAttempt(baseInput({ attempts: MAX_ATTEMPTS - 1 }), deps);

    expect(process).toHaveBeenCalledWith(expect.anything(), { finalAttempt: true });
    expect(deps.update).toHaveBeenCalledWith({ status: "completed_with_errors", done: 1, failed: 1, skipped: 0, finished: true });
    expect(result).toBe("finished");
  });

  it("gives up on entry when attempts already exceeds MAX_ATTEMPTS, without running the processor", async () => {
    const deps = attemptDeps();
    const input = baseInput({ attempts: MAX_ATTEMPTS, uids: ["a"], results: { a: { status: "failed", error: "storage down" } } });

    const result = await runAdminJobAttempt(input, deps);

    expect(deps.process).not.toHaveBeenCalled();
    expect(deps.update).toHaveBeenCalledWith({ results: { a: { status: "failed", error: "gave up after 3 attempts: storage down" } } });
    expect(deps.auditOnce).toHaveBeenCalledWith("bulk_j1_summary", expect.objectContaining({ after: expect.objectContaining({ failed: 1 }) }));
    expect(deps.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed_with_errors", finished: true }));
    expect(result).toBe("gave_up");
  });

  it("finalizes as a terminal failure on the final attempt when the processor itself throws", async () => {
    const process = vi.fn(async () => { throw new Error("infra exploded"); });
    const readResults = vi.fn(async () => ({ a: { status: "deleted" as const } }));
    const deps = attemptDeps({ process, readResults });

    const result = await runAdminJobAttempt(baseInput({ attempts: MAX_ATTEMPTS - 1, uids: ["a", "b"] }), deps);

    expect(readResults).toHaveBeenCalled();
    expect(deps.auditOnce).toHaveBeenCalledWith("bulk_j1_summary", expect.anything());
    expect(deps.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "infra exploded", done: 1, failed: 1, skipped: 0, finished: true }),
    );
    expect(result).toBe("failed_terminal");
  });

  it("rethrows without finalizing when the processor throws on a non-final attempt", async () => {
    const process = vi.fn(async () => { throw new Error("infra exploded"); });
    const deps = attemptDeps({ process });

    await expect(runAdminJobAttempt(baseInput({ attempts: 0 }), deps)).rejects.toThrow("infra exploded");
    expect(deps.readResults).not.toHaveBeenCalled();
    expect(deps.auditOnce).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  applyChallengeProgress,
  CHALLENGE_LEDGER,
  computeChallengeProgress,
  isCompletionTransition,
  isUserInboxNotification,
  runPaginatedCleanup,
  type ChallengeDef,
} from "./maintenance";

// ─── A minimal in-memory Firestore: just the surface applyChallengeProgress touches ───────

type Data = Record<string, unknown>;

function fakeDb(initial: Record<string, Data>) {
  const store = new Map<string, Data>(Object.entries(initial));
  let autoId = 0;

  const snap = (path: string) => ({
    id: path.split("/").pop() as string,
    ref: { path },
    exists: store.has(path),
    data: () => (store.has(path) ? { ...store.get(path) } : undefined),
  });

  const docRef = (path: string): Data => ({
    path,
    id: path.split("/").pop(),
    collection: (name: string) => collRef(`${path}/${name}`),
  });

  const collRef = (path: string): Data => ({
    path,
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${++autoId}`}`),
    where: (field: string, _op: string, value: unknown) => ({
      __query: true,
      run: () =>
        [...store.keys()]
          .filter((k) => k.startsWith(`${path}/`) && k.split("/").length === path.split("/").length + 1)
          .filter((k) => store.get(k)?.[field] === value)
          .map(snap),
    }),
  });

  const reads = { get: 0, getAll: 0 };

  const db = {
    collection: (name: string) => collRef(name),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (target: { __query?: boolean; run?: () => unknown[]; path?: string }) => {
          reads.get++;
          if (target.__query) return { docs: target.run!() };
          return snap(target.path as string);
        },
        getAll: async (...refs: Array<{ path: string }>) => {
          reads.getAll++;
          return refs.map((r) => snap(r.path));
        },
        set: (ref: { path: string }, data: Data) => writes.push(() => store.set(ref.path, { ...data })),
        update: (ref: { path: string }, data: Data) => writes.push(() => {
          const cur = store.get(ref.path) ?? {};
          const next: Data = { ...cur };
          for (const [k, v] of Object.entries(data)) {
            // FieldValue.increment: apply the operand so balances are checkable.
            const inc = (v as { operand?: number })?.operand;
            next[k] = typeof inc === "number" ? Number(cur[k] ?? 0) + inc : v;
          }
          store.set(ref.path, next);
        }),
      };
      const result = await fn(tx);
      writes.forEach((w) => w()); // commit
      return result;
    },
  };

  return { db: db as unknown as import("firebase-admin").firestore.Firestore, store, reads };
}

function seed(): Record<string, Data> {
  return {
    "users/u1": { pointsBalance: 100 },
    "users/u1/userChallenges/ucA": { challengeId: "cA", currentProgress: 4, status: "in_progress" },
    "users/u1/userChallenges/ucB": { challengeId: "cB", currentProgress: 0, status: "in_progress" },
    "users/u1/userChallenges/ucDone": { challengeId: "cA", currentProgress: 5, status: "completed" },
    "challenges/cA": { id: "cA", title: "Five classes", challengeType: "total_classes", targetValue: 5, pointsReward: 50 },
    "challenges/cB": { id: "cB", title: "Ten classes", challengeType: "total_classes", targetValue: 10, pointsReward: 200 },
  };
}

// ─── Early exit ──────────────────────────────────────────────────────────────────────────

describe("isCompletionTransition", () => {
  it("is true only for the transition into completed", () => {
    expect(isCompletionTransition({ status: "accepted" }, { status: "completed" })).toBe(true);
  });

  it("is false for updates that are not that transition", () => {
    expect(isCompletionTransition({ status: "completed" }, { status: "completed" })).toBe(false);
    expect(isCompletionTransition({ status: "pending" }, { status: "accepted" })).toBe(false);
    expect(isCompletionTransition({ status: "completed" }, { status: "payment_confirmed" })).toBe(false);
    expect(isCompletionTransition(undefined, { status: "completed" })).toBe(false);
    expect(isCompletionTransition({ status: "accepted" }, undefined)).toBe(false);
  });
});

// ─── Challenge progress ──────────────────────────────────────────────────────────────────

describe("computeChallengeProgress", () => {
  const defs = new Map<string, ChallengeDef>([
    ["cA", { id: "cA", title: "A", challengeType: "total_classes", targetValue: 2, pointsReward: 10 }],
    ["cX", { id: "cX", title: "X", challengeType: "distance", targetValue: 2, pointsReward: 10 }],
  ]);

  it("increments counting challenges and flags the ones that reach their target", () => {
    const out = computeChallengeProgress(
      [{ id: "u1", challengeId: "cA", currentProgress: 1 }, { id: "u2", challengeId: "cA", currentProgress: 0 }],
      defs
    );
    expect(out.map((u) => [u.userChallengeId, u.newProgress, u.completed])).toEqual([
      ["u1", 2, true],
      ["u2", 1, false],
    ]);
  });

  it("skips challenges whose definition is missing and leaves unknown types unchanged", () => {
    const out = computeChallengeProgress(
      [{ id: "u1", challengeId: "gone", currentProgress: 1 }, { id: "u2", challengeId: "cX", currentProgress: 1 }],
      defs
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ userChallengeId: "u2", newProgress: 1, completed: false });
  });
});

describe("applyChallengeProgress", () => {
  it("applies progress, awards points once, and records the booking in the ledger", async () => {
    const { db, store, reads } = fakeDb(seed());

    const res = await applyChallengeProgress(db, { userId: "u1", bookingId: "b1", eventId: "e1" });

    expect(res.alreadyApplied).toBe(false);
    expect(res.updated).toBe(2);
    expect(res.completed.map((c) => c.id)).toEqual(["cA"]);
    expect(store.get("users/u1/userChallenges/ucA")).toMatchObject({ currentProgress: 5, status: "completed" });
    expect(store.get("users/u1/userChallenges/ucB")).toMatchObject({ currentProgress: 1, status: "in_progress" });
    // the already-completed challenge is not touched
    expect(store.get("users/u1/userChallenges/ucDone")).toMatchObject({ currentProgress: 5 });
    expect(store.get("users/u1")?.pointsBalance).toBe(150);
    const txns = [...store.entries()].filter(([k]) => k.startsWith("users/u1/pointsTransactions/"));
    expect(txns).toHaveLength(1);
    expect(txns[0][1]).toMatchObject({ points: 50, sourceId: "cA", balanceAfter: 150 });
    expect(store.get(`users/u1/${CHALLENGE_LEDGER}/b1`)).toMatchObject({ bookingId: "b1", eventId: "e1" });
    // Challenge definitions come from a single batched getAll.
    expect(reads.getAll).toBe(1);
  });

  it("is idempotent: a retried delivery for the same booking changes nothing and reports no completions", async () => {
    const { db, store } = fakeDb(seed());
    await applyChallengeProgress(db, { userId: "u1", bookingId: "b1", eventId: "e1" });
    const snapshot = JSON.stringify([...store.entries()]);

    const retry = await applyChallengeProgress(db, { userId: "u1", bookingId: "b1", eventId: "e1-retry" });

    expect(retry).toEqual({ alreadyApplied: true, completed: [], updated: 0 });
    expect(JSON.stringify([...store.entries()])).toBe(snapshot);
  });

  it("a different booking does count again", async () => {
    const { db, store } = fakeDb(seed());
    await applyChallengeProgress(db, { userId: "u1", bookingId: "b1" });
    await applyChallengeProgress(db, { userId: "u1", bookingId: "b2" });
    expect(store.get("users/u1/userChallenges/ucB")).toMatchObject({ currentProgress: 2 });
    // ucA completed on b1 and is no longer in_progress, so b2 awards nothing more
    expect(store.get("users/u1")?.pointsBalance).toBe(150);
  });

  it("writes nothing (not even a ledger entry) when the user has no in-progress challenges", async () => {
    const { db, store } = fakeDb({ "users/u2": { pointsBalance: 0 } });
    const res = await applyChallengeProgress(db, { userId: "u2", bookingId: "b1" });
    expect(res).toEqual({ alreadyApplied: false, completed: [], updated: 0 });
    expect(store.size).toBe(1);
  });
});

// ─── Notification cleanup ────────────────────────────────────────────────────────────────

describe("isUserInboxNotification", () => {
  it("accepts only users/{uid}/notifications/{id}", () => {
    expect(isUserInboxNotification({ path: "users/u1/notifications/n1" })).toBe(true);
    expect(isUserInboxNotification({ path: "notifications/n1" })).toBe(false);
    expect(isUserInboxNotification({ path: "providers/p1/notifications/n1" })).toBe(false);
  });
});

describe("runPaginatedCleanup", () => {
  type Doc = { id: number; eligible: boolean };
  const makeDocs = (n: number, ineligibleEvery = 0): Doc[] =>
    Array.from({ length: n }, (_, i) => ({ id: i, eligible: !(ineligibleEvery && i % ineligibleEvery === 0) }));

  function depsFor(docs: Doc[], clock: () => number = () => 0) {
    const cursors: Array<number | null> = [];
    const deleted: number[] = [];
    const flush = vi.fn(async () => undefined);
    return {
      cursors,
      deleted,
      flush,
      deps: {
        fetchPage: vi.fn(async (cursor: Doc | null, limit: number) => {
          cursors.push(cursor?.id ?? null);
          const start = cursor ? cursor.id + 1 : 0;
          return docs.slice(start, start + limit);
        }),
        isEligible: (d: Doc) => d.eligible,
        enqueueDelete: (d: Doc) => { deleted.push(d.id); },
        flush,
        now: clock,
      },
    };
  }

  it("pages with a cursor until a short page, deleting every eligible doc", async () => {
    const docs = makeDocs(1050, 10);
    const { deps, cursors, deleted, flush } = depsFor(docs);

    const res = await runPaginatedCleanup(deps, { pageSize: 500, deadlineMs: 1 });

    expect(res).toEqual({ deleted: 945, pages: 3, exhausted: true });
    expect(cursors).toEqual([null, 499, 999]);
    expect(deleted).toHaveLength(945);
    expect(deleted).not.toContain(0);
    expect(flush).toHaveBeenCalledTimes(3);
  });

  it("does one extra (empty) fetch when the total is an exact multiple of the page size", async () => {
    const { deps } = depsFor(makeDocs(1000));
    const res = await runPaginatedCleanup(deps, { pageSize: 500, deadlineMs: 1 });
    expect(res).toEqual({ deleted: 1000, pages: 3, exhausted: true });
  });

  it("does not loop on a page made entirely of ineligible docs", async () => {
    const { deps } = depsFor(makeDocs(3, 1)); // all ineligible
    const res = await runPaginatedCleanup(deps, { pageSize: 2, deadlineMs: 1 });
    expect(res).toEqual({ deleted: 0, pages: 2, exhausted: true });
  });

  it("stops at the time budget and reports it is not exhausted", async () => {
    let t = 0;
    const { deps, deleted } = depsFor(makeDocs(10_000), () => t);
    deps.fetchPage.mockImplementation(async (cursor: Doc | null, limit: number) => {
      t += 100; // each page costs 100ms
      const start = cursor ? cursor.id + 1 : 0;
      return makeDocs(10_000).slice(start, start + limit);
    });

    const res = await runPaginatedCleanup(deps, { pageSize: 100, deadlineMs: 250 });

    expect(res).toEqual({ deleted: 300, pages: 3, exhausted: false });
    expect(deleted).toHaveLength(300);
  });
});

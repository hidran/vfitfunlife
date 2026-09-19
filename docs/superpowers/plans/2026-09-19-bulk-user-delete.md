# Bulk User Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A superadmin bulk-deletes any selection of users for real (data, files, Auth), in a background job, with every step in `audit_logs`.

**Architecture:** A callable validates and writes an `adminJobs/{jobId}` doc, then returns. A Firestore `onDocumentCreated` trigger runs a pure, dependency-injected job processor that calls one shared `deleteUserCascade` per user and audits each. The single-user `adminDeleteUser` uses the same cascade. The client opens a reason dialog, calls the callable, and shows a live progress banner from the job doc.

**Tech Stack:** Firebase Functions v2 (Node 24, `firebase-functions` 7, `firebase-admin` 12), Firestore, Storage, Auth; Next.js 16 client with Zustand + TanStack Query; Vitest in both `src/` and `functions/`.

Spec: `docs/superpowers/specs/2026-09-19-bulk-user-delete-design.md`

## Conventions for every task

- Web tests: `npx vitest run <path>` from the repo root. Functions tests: `cd functions && npx vitest run <path>`.
- Typecheck: `npx tsc --noEmit -p .` (web) and `cd functions && npx tsc --noEmit -p .` (functions). Lint: `npx eslint <files>`.
- i18n: every new key goes into all five of `src/i18n/messages/{it,en,es,fr,de}.ts` (Italian is the source); `src/i18n/messages/completeness.test.ts` fails otherwise.
- Before each commit run `git branch --show-current` (must print `main`); another agent shares this checkout. Stage only the files the task names.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- ~39 web vitest failures are pre-existing (emulator/e2e/rules/home/login). Judge only the tests a task names.

## File map

| File | Responsibility |
|---|---|
| `functions/src/lib/auditEntityTypes.ts`, `src/types/audit.ts` | add `admin_job` (both halves, identical) |
| `functions/src/users/deleteUserCascade.ts` (new) | what "delete a user" removes; DI deps + admin-SDK deps |
| `functions/src/users/bulkDeleteJob.ts` (new) | pure job processor: skip rules, resume, per-user audit, summary |
| `functions/src/users/bulkDelete.ts` (new) | input validation, `adminBulkDeleteUsers` callable, `onAdminJobCreated` trigger |
| `functions/src/users/adminMutations.ts` | `adminDeleteUser` uses the cascade |
| `functions/src/users/index.ts` | export `./bulkDelete` |
| `firestore.rules` | `adminJobs` read: superadmin; no client writes |
| `src/types/admin.ts`, `src/lib/admin/usersListQuery.ts`, `src/lib/firebase/admin.ts` | `hidden` status ("Demo & eliminati"); drop soft-delete branch |
| `src/lib/firebase/bulkDelete.ts` (new) | client: start job, subscribe to a job, find my running job |
| `src/components/admin/users/BulkDeleteJobBanner.tsx` (new) | live progress banner |
| `src/components/admin/users/UsersListView.tsx` | dialog + banner wiring, hidden filter option |
| `src/components/admin/useEntityMutation.ts` | `audit` optional |
| `src/components/admin/users/UserRowQuickActions.tsx`, `UserDetailView.tsx` | drop duplicate client audit on delete |
| `src/stores/adminStore.ts` | `bulkUpdateUsersAction` no longer accepts `delete` |

---

### Task 1: `admin_job` audit entity type

**Files:**
- Modify: `functions/src/lib/auditEntityTypes.ts` (AUDIT_ENTITY_TYPES array)
- Modify: `src/types/audit.ts` (AUDIT_ENTITY_TYPES array)
- Test: `src/types/audit.test.ts`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe('audit vocabulary', …)` in `src/types/audit.test.ts`:

```ts
  it('knows admin_job, the bulk-delete job entity', () => {
    expect(AUDIT_ENTITY_TYPES).toContain('admin_job');
  });
```

- [ ] **Step 2: Run** `npx vitest run src/types/audit.test.ts` — expect FAIL (`admin_job` missing).

- [ ] **Step 3: Implement** — add `"admin_job",` as the last element of `AUDIT_ENTITY_TYPES` in `functions/src/lib/auditEntityTypes.ts` (after `"platform_settings",`), and `'admin_job',` as the last element in `src/types/audit.ts`. Same position in both — the parity test compares order.

- [ ] **Step 4: Run** `npx vitest run src/types/audit.test.ts` — expect PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/auditEntityTypes.ts src/types/audit.ts src/types/audit.test.ts
git commit -m "feat(audit): admin_job entity type for background admin jobs"
```

---

### Task 2: `deleteUserCascade`

**Files:**
- Create: `functions/src/users/deleteUserCascade.ts`
- Test: `functions/src/users/deleteUserCascade.test.ts`

- [ ] **Step 1: Write the failing test** — `functions/src/users/deleteUserCascade.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { deleteUserCascade, ownedStoragePrefixes, type CascadeDeps } from "./deleteUserCascade";

function fakeDeps(overrides: Partial<CascadeDeps> = {}) {
  const calls: string[] = [];
  const deps: CascadeDeps = {
    recursiveDelete: vi.fn(async (p: string) => { calls.push(`fs:${p}`); }),
    docExists: vi.fn(async () => true),
    deleteStoragePrefix: vi.fn(async (p: string) => { calls.push(`st:${p}`); }),
    deleteAuthUser: vi.fn(async (uid: string) => { calls.push(`auth:${uid}`); }),
    ...overrides,
  };
  return { deps, calls };
}

describe("deleteUserCascade", () => {
  it("deletes the Auth account first, then Firestore, then Storage", async () => {
    const { deps, calls } = fakeDeps();
    await deleteUserCascade("u1", deps);
    expect(calls[0]).toBe("auth:u1");
    expect(calls.slice(1, 3)).toEqual(["fs:users/u1", "fs:instructors/u1"]);
    expect(calls.slice(3)).toEqual(ownedStoragePrefixes("u1").map((p) => `st:${p}`));
  });

  it("treats a missing Auth account as already gone", async () => {
    const { deps } = fakeDeps({
      deleteAuthUser: vi.fn(async () => { throw Object.assign(new Error("gone"), { code: "auth/user-not-found" }); }),
    });
    await expect(deleteUserCascade("customer_1_0", deps)).resolves.toEqual({ authDeleted: false, hadInstructor: true });
    expect(deps.recursiveDelete).toHaveBeenCalledWith("users/customer_1_0");
  });

  it("stops on any other Auth error, before touching data", async () => {
    const { deps } = fakeDeps({ deleteAuthUser: vi.fn(async () => { throw new Error("quota"); }) });
    await expect(deleteUserCascade("u1", deps)).rejects.toThrow("quota");
    expect(deps.recursiveDelete).not.toHaveBeenCalled();
  });

  it("reports whether the user had a provider record", async () => {
    const { deps } = fakeDeps({ docExists: vi.fn(async () => false) });
    await expect(deleteUserCascade("u1", deps)).resolves.toEqual({ authDeleted: true, hadInstructor: false });
  });

  it("refuses a uid that would escape its document path", async () => {
    const { deps } = fakeDeps();
    await expect(deleteUserCascade("a/b", deps)).rejects.toThrow("Invalid uid");
    await expect(deleteUserCascade("", deps)).rejects.toThrow("Invalid uid");
  });
});
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/users/deleteUserCascade.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement** — `functions/src/users/deleteUserCascade.ts`:

```ts
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

/**
 * What deleting a user removes. Kept on purpose: bookings, payments, transactions and
 * audit_logs (financial and legal records), and reviews or client notes the user left on
 * someone else's document.
 */
export function ownedStoragePrefixes(uid: string): string[] {
  return [
    `users/${uid}/`,
    `avatars/${uid}/`,
    `profile-photos/${uid}/`,
    `certifications/${uid}/`,
    `portfolios/${uid}/`,
    `instructors/${uid}/`,
  ];
}

export interface CascadeDeps {
  recursiveDelete: (docPath: string) => Promise<void>;
  docExists: (docPath: string) => Promise<boolean>;
  deleteStoragePrefix: (prefix: string) => Promise<void>;
  deleteAuthUser: (uid: string) => Promise<void>;
}

export interface CascadeResult {
  /** false when there was no Auth account — seeded demo users never had one. */
  authDeleted: boolean;
  hadInstructor: boolean;
}

/**
 * Auth goes first: if a later step fails, the person can no longer sign in and a retry
 * finishes the job. The other order would leave a live login with no profile, which the app
 * routes to /auth/register — the account would quietly come back.
 */
export async function deleteUserCascade(uid: string, deps: CascadeDeps): Promise<CascadeResult> {
  if (!uid || uid.includes("/")) throw new Error(`Invalid uid: "${uid}"`);

  let authDeleted = true;
  try {
    await deps.deleteAuthUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    authDeleted = false;
  }

  await deps.recursiveDelete(`users/${uid}`);
  const hadInstructor = await deps.docExists(`instructors/${uid}`);
  // Unconditional: recursiveDelete also clears subcollections left under a missing parent.
  await deps.recursiveDelete(`instructors/${uid}`);

  for (const prefix of ownedStoragePrefixes(uid)) {
    await deps.deleteStoragePrefix(prefix);
  }

  return { authDeleted, hadInstructor };
}

/** The real dependencies, backed by the Admin SDK. */
export function adminCascadeDeps(): CascadeDeps {
  const db = getFirestore();
  return {
    recursiveDelete: (path) => db.recursiveDelete(db.doc(path)),
    docExists: async (path) => (await db.doc(path).get()).exists,
    deleteStoragePrefix: async (prefix) => {
      await getStorage().bucket().deleteFiles({ prefix });
    },
    deleteAuthUser: (uid) => getAuth().deleteUser(uid),
  };
}
```

Note: the test for "missing Auth account" expects `docExists` default `true` → `hadInstructor: true`.

- [ ] **Step 4: Run** `cd functions && npx vitest run src/users/deleteUserCascade.test.ts` — expect PASS (5 tests). Then `cd functions && npx tsc --noEmit -p .` — no errors.

- [ ] **Step 5: Commit**

```bash
git add functions/src/users/deleteUserCascade.ts functions/src/users/deleteUserCascade.test.ts
git commit -m "feat(users): deleteUserCascade — one definition of deleting a user"
```

---

### Task 3: Bulk delete job processor

**Files:**
- Create: `functions/src/users/bulkDeleteJob.ts`
- Test: `functions/src/users/bulkDeleteJob.test.ts`

- [ ] **Step 1: Write the failing test** — `functions/src/users/bulkDeleteJob.test.ts`:

```ts
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
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/users/bulkDeleteJob.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement** — `functions/src/users/bulkDeleteJob.ts`:

```ts
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
```

- [ ] **Step 4: Run** `cd functions && npx vitest run src/users/bulkDeleteJob.test.ts` — expect PASS (5 tests). `cd functions && npx tsc --noEmit -p .` — no errors.

- [ ] **Step 5: Commit**

```bash
git add functions/src/users/bulkDeleteJob.ts functions/src/users/bulkDeleteJob.test.ts
git commit -m "feat(users): bulk delete job processor — resumable, per-user audit"
```

---

### Task 4: Callable, trigger, and single delete on the cascade

**Files:**
- Create: `functions/src/users/bulkDelete.ts`
- Test: `functions/src/users/bulkDelete.test.ts`
- Modify: `functions/src/users/adminMutations.ts` (body of `adminDeleteUser`, the `delete()` + `deleteUser` lines)
- Modify: `functions/src/users/index.ts` (add export next to `export * from "./adminMutations";`)

- [ ] **Step 1: Write the failing test** — `functions/src/users/bulkDelete.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateBulkDeleteInput, MAX_BULK_DELETE } from "./bulkDelete";

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
});
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/users/bulkDelete.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement** — `functions/src/users/bulkDelete.ts`:

```ts
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
```

- [ ] **Step 4: Point `adminDeleteUser` at the cascade** — in `functions/src/users/adminMutations.ts` add the import `import { adminCascadeDeps, deleteUserCascade } from "./deleteUserCascade";` and replace:

```ts
    await getFirestore().collection("users").doc(uid).delete();

    try {
      await getAuth().deleteUser(uid);
    } catch (e) {
      console.warn(
        "[adminDeleteUser] auth deletion failed (ok if user already gone)",
        e,
      );
    }
```

with:

```ts
    // Same definition of "delete" as the bulk job: Auth, the user's subcollections, their
    // provider record and their files — not just the top-level document.
    await deleteUserCascade(uid, adminCascadeDeps());
```

Remove the now-unused `import { getAuth } from "firebase-admin/auth";` and update the JSDoc line "hard-delete a user document and its Firebase Auth record" to "hard-delete a user via deleteUserCascade".

- [ ] **Step 5: Export** — in `functions/src/users/index.ts`, directly after `export * from "./adminMutations";` add:

```ts
export * from "./bulkDelete";
```

- [ ] **Step 6: Run** `cd functions && npx vitest run src/users` — expect all users tests PASS (bulkDelete 5, bulkDeleteJob 5, deleteUserCascade 5, plus existing). `cd functions && npx tsc --noEmit -p .` and `cd functions && npm run build` — no errors.

- [ ] **Step 7: Commit**

```bash
git add functions/src/users/bulkDelete.ts functions/src/users/bulkDelete.test.ts functions/src/users/adminMutations.ts functions/src/users/index.ts
git commit -m "feat(users): adminBulkDeleteUsers callable + background job; single delete cascades"
```

---

### Task 5: Firestore rules for `adminJobs`

**Files:**
- Modify: `firestore.rules` — insert immediately before the `match /audit_logs/{logId} {` block (near the end).

- [ ] **Step 1: Add the rule**

```
    // Background admin jobs (bulk user delete). Written only by Cloud Functions; the
    // superadmin reads one to follow its progress.
    match /adminJobs/{jobId} {
      allow read: if isSuperAdmin();
      allow write: if false;
    }

```

- [ ] **Step 2: Validate** — `npx firebase-tools --version >/dev/null && firebase deploy -P staging --only firestore:rules --dry-run` is not supported for rules; instead compile-check with the Firebase MCP `firebase_validate_security_rules` (source: firestore.rules) or `firebase emulators:exec --only firestore "true"`. Expect no errors.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): superadmin can read adminJobs; clients never write them"
```

---

### Task 6: "Demo & eliminati" status filter

**Files:**
- Modify: `src/types/admin.ts` — `UserFilters.status`
- Modify: `src/lib/admin/usersListQuery.ts` — `STATUSES`
- Modify: `src/lib/firebase/admin.ts` — `getUsers`
- Modify: `src/components/admin/users/UsersListView.tsx` — status filter options
- Modify: `src/i18n/messages/{it,en,es,fr,de}.ts` — `admin.users.filter.hidden`
- Test: `src/lib/firebase/admin.getUsers.test.ts`, `src/lib/admin/usersListQuery.test.ts`

- [ ] **Step 1: Write the failing tests** — append to the `describe('getUsers', …)` block in `src/lib/firebase/admin.getUsers.test.ts`:

```ts
  it('shows only hidden accounts (soft-deleted or seeded demo) under the hidden status', async () => {
    vi.mocked(getDocs).mockResolvedValue(
      snapshotOf({
        alive: { fullName: 'Anna', email: 'anna@example.com' },
        gone: { fullName: 'Gone', email: 'gone@example.com', isDeleted: true },
        customer_1_0: { fullName: 'Seed', email: 'seed@demo.vfit' },
      })
    );

    expect((await getUsers({ status: 'hidden' })).users.map((u) => u.id)).toEqual(['gone', 'customer_1_0']);
    expect((await getUsers({ status: 'all' })).users.map((u) => u.id)).toEqual(['alive']);
  });
```

and append to `src/lib/admin/usersListQuery.test.ts`:

```ts
  it('round-trips the hidden status', () => {
    const filters = { ...DEFAULT_USER_FILTERS, status: 'hidden' as const };
    expect(filtersFromParams(new URLSearchParams(queryFromFilters(filters)))).toEqual(filters);
  });
```

- [ ] **Step 2: Run** `npx vitest run src/lib/firebase/admin.getUsers.test.ts src/lib/admin/usersListQuery.test.ts` — expect the two new tests FAIL (type error / hidden not honored).

- [ ] **Step 3: Implement**
  - `src/types/admin.ts`: `status?: "active" | "suspended" | "hidden" | "all";` with a comment above the field: `/** hidden = soft-deleted or seeded demo accounts, excluded from every other status. */`
  - `src/lib/admin/usersListQuery.ts`: `const STATUSES = ['all', 'active', 'suspended', 'hidden'] as const;`
  - `src/lib/firebase/admin.ts` in `getUsers`, replace

```ts
    let users = snapshot.docs
      .filter((doc) => !isHiddenAccount(doc.id, doc.data()))
```

with

```ts
    // "hidden" is the only way to reach these accounts — which the bulk delete needs.
    const wantHidden = filters.status === "hidden";
    let users = snapshot.docs
      .filter((doc) => isHiddenAccount(doc.id, doc.data()) === wantHidden)
```

  - `UsersListView.tsx` status filter `options`: add after the suspended option
    `{ value: "hidden", label: t('admin.users.filter.hidden') },`
  - i18n `admin.users.filter.hidden` (insert after `admin.users.filter.suspended` in each file):
    it `'Demo ed eliminati'`, en `'Demo & deleted'`, es `'Demo y eliminados'`, fr `'Démo et supprimés'`, de `'Demo & gelöscht'`.

- [ ] **Step 4: Run** `npx vitest run src/lib/firebase/admin.getUsers.test.ts src/lib/admin/usersListQuery.test.ts src/i18n` — expect PASS. `npx tsc --noEmit -p .` — no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/admin.ts src/lib/admin/usersListQuery.ts src/lib/admin/usersListQuery.test.ts src/lib/firebase/admin.ts src/lib/firebase/admin.getUsers.test.ts src/components/admin/users/UsersListView.tsx src/i18n/messages/it.ts src/i18n/messages/en.ts src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts
git commit -m "feat(admin/users): 'Demo & eliminati' filter reaches hidden accounts"
```

---

### Task 7: Client — start job, progress banner, one delete path

**Files:**
- Create: `src/lib/firebase/bulkDelete.ts`
- Create: `src/components/admin/users/BulkDeleteJobBanner.tsx`
- Test: `src/components/admin/users/BulkDeleteJobBanner.test.tsx`
- Modify: `src/components/admin/users/UsersListView.tsx` (bulk delete button handler, render dialog + banner)
- Modify: `src/lib/firebase/admin.ts` (`bulkUpdateUsers`: remove `delete`)
- Modify: `src/stores/adminStore.ts` (`bulkUpdateUsersAction` type: `"activate" | "suspend"`)
- Modify: `src/components/admin/useEntityMutation.ts` (`audit` optional)
- Modify: `src/components/admin/users/UserRowQuickActions.tsx`, `src/components/admin/users/UserDetailView.tsx` (drop `audit` on `deleteMut`)
- Modify: `src/i18n/messages/{it,en,es,fr,de}.ts`

- [ ] **Step 1: Client job API** — `src/lib/firebase/bulkDelete.ts`:

```ts
import { httpsCallable } from 'firebase/functions';
import { collection, doc, limit, onSnapshot, orderBy, query, where, getDocs } from 'firebase/firestore';
import { db, functions } from './config';

export type JobStatus = 'queued' | 'running' | 'completed' | 'completed_with_errors';
type Outcome = { status: 'deleting' | 'deleted' | 'skipped' | 'failed'; reason?: string; error?: string };

export interface BulkDeleteJobView {
  id: string;
  status: JobStatus;
  total: number;
  deleted: number;
  skipped: number;
  failed: number;
}

export async function startBulkDelete(uids: string[], reason: string): Promise<string> {
  const fn = httpsCallable<{ uids: string[]; reason: string }, { jobId: string }>(functions, 'adminBulkDeleteUsers');
  return (await fn({ uids, reason })).data.jobId;
}

/** Counts come from `results` so progress moves per user, not only when the job ends. */
export function toJobView(id: string, data: Record<string, unknown>): BulkDeleteJobView {
  const results = Object.values((data.results ?? {}) as Record<string, Outcome>);
  const count = (s: Outcome['status']) => results.filter((r) => r.status === s).length;
  return {
    id,
    status: data.status as JobStatus,
    total: (data.total as number) ?? 0,
    deleted: count('deleted'),
    skipped: count('skipped'),
    failed: count('failed'),
  };
}

export function watchBulkDeleteJob(jobId: string, onChange: (job: BulkDeleteJobView) => void): () => void {
  return onSnapshot(doc(db, 'adminJobs', jobId), (snap) => {
    if (snap.exists()) onChange(toJobView(snap.id, snap.data()));
  });
}

/** The caller's most recent unfinished job, so a reload mid-job brings the banner back. */
export async function findRunningBulkDelete(actorUid: string): Promise<string | null> {
  const snap = await getDocs(
    query(
      collection(db, 'adminJobs'),
      where('actorUid', '==', actorUid),
      where('status', 'in', ['queued', 'running']),
      orderBy('createdAt', 'desc'),
      limit(1),
    ),
  );
  return snap.empty ? null : snap.docs[0].id;
}
```

Note: the `findRunningBulkDelete` query needs a composite index (`actorUid` ASC, `status` ASC, `createdAt` DESC) on `adminJobs`. Add to `firestore.indexes.json` `indexes` array:

```json
    {
      "collectionGroup": "adminJobs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "actorUid", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
```

- [ ] **Step 2: Write the failing banner test** — `src/components/admin/users/BulkDeleteJobBanner.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BulkDeleteJobBanner } from './BulkDeleteJobBanner';

describe('BulkDeleteJobBanner', () => {
  it('shows progress while running', () => {
    render(<BulkDeleteJobBanner job={{ id: 'j', status: 'running', total: 36, deleted: 12, skipped: 0, failed: 1 }} onDismiss={vi.fn()} />);
    // Tests render in Italian, the source locale.
    expect(screen.getByText(/13\s*\/\s*36 · 12 eliminati, 0 saltati, 1 errori/)).toBeInTheDocument();
  });

  it('can be dismissed once finished, not before', () => {
    const { rerender } = render(<BulkDeleteJobBanner job={{ id: 'j', status: 'running', total: 2, deleted: 1, skipped: 0, failed: 0 }} onDismiss={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<BulkDeleteJobBanner job={{ id: 'j', status: 'completed', total: 2, deleted: 2, skipped: 0, failed: 0 }} onDismiss={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/components/admin/users/BulkDeleteJobBanner.test.tsx` — expect FAIL (module not found).

- [ ] **Step 4: Implement the banner** — `src/components/admin/users/BulkDeleteJobBanner.tsx`:

```tsx
'use client';

import { CheckCircle, Loader2, AlertTriangle, X } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { BulkDeleteJobView } from '@/lib/firebase/bulkDelete';

interface Props {
  job: BulkDeleteJobView;
  onDismiss: () => void;
}

export function BulkDeleteJobBanner({ job, onDismiss }: Props) {
  const { t } = useI18n();
  const finished = job.status === 'completed' || job.status === 'completed_with_errors';
  const processed = job.deleted + job.skipped + job.failed;
  const Icon = !finished ? Loader2 : job.failed > 0 ? AlertTriangle : CheckCircle;

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 p-4"
    >
      <Icon className={`h-5 w-5 flex-shrink-0 ${finished ? '' : 'animate-spin'} ${job.failed > 0 ? 'text-[#F59E0B]' : 'text-[#10B981]'}`} />
      <div className="flex-1 text-sm text-content">
        <p className="font-medium">
          {finished ? t('admin.users.bulkDeleteJob.finished') : t('admin.users.bulkDeleteJob.running')}
        </p>
        <p className="text-content-muted">
          {t('admin.users.bulkDeleteJob.progress', {
            done: String(processed),
            total: String(job.total),
            deleted: String(job.deleted),
            skipped: String(job.skipped),
            failed: String(job.failed),
          })}
        </p>
      </div>
      {finished && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('common.close')}
          className="touch-target flex items-center justify-center rounded-full text-content-muted hover:text-content"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
```

i18n keys (all five files, next to the other `admin.users.bulk*` keys):

| key | it | en | es | fr | de |
|---|---|---|---|---|---|
| `admin.users.bulkDeleteJob.running` | `Eliminazione in corso…` | `Deleting…` | `Eliminando…` | `Suppression en cours…` | `Wird gelöscht…` |
| `admin.users.bulkDeleteJob.finished` | `Eliminazione completata` | `Deletion finished` | `Eliminación completada` | `Suppression terminée` | `Löschen abgeschlossen` |
| `admin.users.bulkDeleteJob.progress` | `{{done}} / {{total}} · {{deleted}} eliminati, {{skipped}} saltati, {{failed}} errori` | `{{done}} / {{total}} · {{deleted}} deleted, {{skipped}} skipped, {{failed}} failed` | `{{done}} / {{total}} · {{deleted}} eliminados, {{skipped}} omitidos, {{failed}} errores` | `{{done}} / {{total}} · {{deleted}} supprimés, {{skipped}} ignorés, {{failed}} erreurs` | `{{done}} / {{total}} · {{deleted}} gelöscht, {{skipped}} übersprungen, {{failed}} Fehler` |
| `admin.users.bulkDeleteEntity` | `utenti` | `users` | `usuarios` | `utilisateurs` | `Benutzer` |

- [ ] **Step 5: Run** `npx vitest run src/components/admin/users/BulkDeleteJobBanner.test.tsx src/i18n` — expect PASS.

- [ ] **Step 6: Wire `UsersListView`**
  - Imports: `ConfirmDeleteDialog` from `@/components/admin` (already exported there), `BulkDeleteJobBanner`, and `startBulkDelete, watchBulkDeleteJob, findRunningBulkDelete, type BulkDeleteJobView` from `@/lib/firebase/bulkDelete`.
  - State: `const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);` `const [jobId, setJobId] = useState<string | null>(null);` `const [job, setJob] = useState<BulkDeleteJobView | null>(null);`
  - Effects:

```tsx
  // A reload mid-job brings the banner back.
  useEffect(() => {
    if (!authUser?.id || authUser.role !== 'superadmin') return;
    let cancelled = false;
    findRunningBulkDelete(authUser.id)
      .then((id) => { if (!cancelled && id) setJobId(id); })
      .catch((err) => console.error('Could not look up running bulk delete:', err));
    return () => { cancelled = true; };
  }, [authUser?.id, authUser?.role]);

  useEffect(() => {
    if (!jobId) return;
    return watchBulkDeleteJob(jobId, setJob);
  }, [jobId]);

  // Refresh the list once, when the job finishes.
  const jobFinished = job?.status === 'completed' || job?.status === 'completed_with_errors';
  useEffect(() => {
    if (jobFinished) fetchUsers(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobFinished]);
```

  - `handleBulkAction` type becomes `(action: "activate" | "suspend")`; the bulk delete button's `onClick` becomes `() => setConfirmBulkDelete(true)`.
  - Render the banner right above `{/* Bulk Actions */}`:

```tsx
      {job && (
        <BulkDeleteJobBanner
          job={job}
          onDismiss={() => { setJob(null); setJobId(null); }}
        />
      )}
```

  - Render the dialog just before the closing `</div>` of the component:

```tsx
      <ConfirmDeleteDialog
        open={confirmBulkDelete}
        entityLabel={t('admin.users.bulkDeleteEntity')}
        entityName={String(selectedIds.length)}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={async (reason) => {
          // ConfirmDeleteDialog has no catch of its own: a throw here would be an unhandled
          // rejection with no message on screen. Report it in the page instead.
          try {
            const id = await startBulkDelete([...selectedIds], reason);
            setSelectedIds([]);
            setJobId(id);
            setBulkDeleteError(null);
          } catch (err) {
            console.error('Bulk delete could not start:', err);
            setBulkDeleteError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
```

  Also add `const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);` and render it directly under the existing `{error && (…)}` block, reusing that block's markup with `t('admin.users.bulkDeleteJob.startError')` as the title and `bulkDeleteError` as the detail, and `onClick={() => setBulkDeleteError(null)}` on its close button. i18n `admin.users.bulkDeleteJob.startError`: it `Impossibile avviare l'eliminazione`, en `Could not start the deletion`, es `No se pudo iniciar la eliminación`, fr `Impossible de lancer la suppression`, de `Löschen konnte nicht gestartet werden`.

  (The dialog makes the admin type the selection count and a reason before the button enables.)

- [ ] **Step 7: Remove the soft-delete path**
  - `src/lib/firebase/admin.ts` `bulkUpdateUsers`: signature `action: "activate" | "suspend"`; delete the `if (action === "delete") { … }` branch (the `// Soft delete` block) so the chain starts at `if (action === "suspend")`.
  - `src/stores/adminStore.ts`: both the interface line `bulkUpdateUsersAction: (userIds: string[], action: "activate" | "suspend" | "delete")` and the implementation's parameter type become `"activate" | "suspend"`.

- [ ] **Step 8: One audit entry per single delete**
  - `src/components/admin/useEntityMutation.ts`: make `audit` optional and skip when absent:

```ts
interface Options<TInput, TResult> {
  mutate: (input: TInput) => Promise<TResult>;
  /** Omit when the server already audits the operation, so it is not recorded twice. */
  audit?: (input: TInput, result: TResult) => AuditPayload;
  invalidateKeys?: QueryKey[];
  onSuccess?: (result: TResult, input: TInput) => void;
}
```

  and in `onSuccess`: `if (opts.audit) await recordAudit(actor, opts.audit(input, result));`
  - In `UserRowQuickActions.tsx` and `UserDetailView.tsx`, delete the `audit: ({ reason }) => ({ action: 'delete', … }),` property of `deleteMut` (adminDeleteUser writes the entry server-side).

- [ ] **Step 9: Verify** — `npx vitest run src/components/admin src/lib/firebase src/lib/admin src/stores src/i18n src/types` (expect the named new tests PASS and no new failures vs `git stash` baseline), `npx tsc --noEmit -p .`, `npx eslint src/components/admin src/lib/firebase/bulkDelete.ts src/lib/firebase/admin.ts src/stores/adminStore.ts` — clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/firebase/bulkDelete.ts src/components/admin/users/BulkDeleteJobBanner.tsx src/components/admin/users/BulkDeleteJobBanner.test.tsx src/components/admin/users/UsersListView.tsx src/lib/firebase/admin.ts src/stores/adminStore.ts src/components/admin/useEntityMutation.ts src/components/admin/users/UserRowQuickActions.tsx src/components/admin/users/UserDetailView.tsx firestore.indexes.json src/i18n/messages/it.ts src/i18n/messages/en.ts src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts
git commit -m "feat(admin/users): bulk delete runs as a background job with live progress"
```

---

### Task 8: Staging, then production (controller, not a subagent)

- [ ] Push. Deploy staging: `cd functions && npm run build`, `firebase deploy -P staging --only functions:adminBulkDeleteUsers,functions:onAdminJobCreated,functions:adminDeleteUser,firestore:rules,firestore:indexes`, then `npm run build:staging && firebase deploy -P staging --only hosting`.
- [ ] Seed three throwaway staging users via the Firestore/Auth tools (one provider with `instructors/{uid}` and one `instructors/{uid}/services/x` doc; one soft-deleted `@demo.vfit`).
- [ ] As `admin@vfit.com` on https://vfit-app-staging.web.app/admin/users at 375px: filter "Demo & eliminati", select, bulk delete with a reason; watch the banner reach completion; list refreshes.
- [ ] Verify: users docs, subcollections, `instructors/{uid}` + services gone; Auth accounts gone; `audit_logs` has 1 job-queued + 3 user deletes + 1 summary; zero console errors.
- [ ] Production: same deploy with `-P production` and `build:prod`. Do not run a delete in production.

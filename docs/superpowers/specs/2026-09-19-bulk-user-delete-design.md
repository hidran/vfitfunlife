# Bulk user delete — design

Status: approved 2026-09-19

## Problem

`/admin/users` has two delete buttons that do different things. The row/detail delete calls
`adminDeleteUser`: it hard-deletes the `users/{uid}` document and the Auth account, but
leaves every subcollection and the provider's `instructors/{uid}` record orphaned. Bulk
"Elimina" writes `isDeleted: true` from the client: the account can still sign in, and since
the list now hides soft-deleted accounts, they cannot be found again to finish the job.
Production holds 36 such hidden accounts (25 seeded `@demo.vfit`, 11 older test/seed ones).

## Goal

A superadmin can bulk delete any selection of users. Deletion is real, runs in the background,
and every step is in `audit_logs`.

## Design

### One cascade, two entry points

`functions/src/users/deleteUserCascade.ts` — `deleteUserCascade(uid)` removes, in order:

1. the Auth account; `auth/user-not-found` is not an error (seeded ids never had one)
2. `instructors/{uid}` and all its subcollections, when present (`recursiveDelete`)
3. `providerApplications` docs with `userId == uid` — personal data, not a legal record,
   deleted in batches of ≤400 (rules let a user create arbitrarily many)
4. Storage prefixes `users/{uid}/`, `avatars/{uid}/`, `profile-photos/{uid}/`,
   `certifications/{uid}/`, `portfolios/{uid}/`, `instructors/{uid}/`
5. `users/{uid}` and all its subcollections (`recursiveDelete`) — **last, deliberately**

It keeps bookings, payments, transactions, audit logs, and reviews/client notes the user left
on other people's documents — financial and legal records. Every step is safe to run twice: a
retried or resumed call finishes whatever an earlier, interrupted attempt started, rather than
erroring on data that is already gone.

`users/{uid}` is deleted last so a partial failure anywhere earlier leaves the user still
listed in `/admin/users`, and either delete path (single, or a new bulk job) can find it again
and re-run the rest of this idempotent cascade. Deleting it earlier (steps 2-5 in the original
order) meant a partial failure made the user vanish from the list while its instructor
profile, provider applications and files were still orphaned, with no way to find and finish
them — single delete says not-found, and a bulk job's own not-found check only recognizes its
own audit id, not one from an earlier job. `users/{uid}`'s own `recursiveDelete` can still fail
partway through and leave the doc gone before the rest finishes — that's what the
audit-existence resume path (see Audit, below) is for.

`adminDeleteUser` (single) and the bulk job both call it. It also shares the bulk job's uid
shape check (`isValidUid` in `functions/src/lib/uid.ts`: non-empty, ≤128 chars, no `/`, not
`.`/`..`, not `/^__.*__$/`).

Single delete (`timeoutSeconds: 300`) is audit-first, mirroring the bulk job: before the
retry loop, it writes `writeAuditLogOnce(single_{uid}_{Date.now()}, { action: 'delete', … })`
and confirms it succeeded — if that write itself fails, the callable throws
`HttpsError('internal', …)` and deletes nothing. Only then does the (up to 3 attempts, 1s
then 2s backoff) cascade run, logging each failed attempt with the uid and attempt number. A
final cascade failure gets a second, separate audit entry at `{auditId}_partial` (also
`writeAuditLogOnce`) with `after: { partial: true, error }`; if THAT write also fails, the
callable's error message says so instead of pointing the admin at `audit_logs` for a record
that was never written. The old order — Auth deleted first inside the cascade, one
`writeAuditLog` at the very end — meant a timeout or crash mid-cascade could leave a
locked-out, partly deleted user with no audit at all.

`onProviderServiceWrite` (`functions/src/providers/onServiceWrite.ts`) must not resurrect a
deleted provider. Deleting a provider's `instructors/{uid}` recursively deletes its
`services/*` subcollection first, and each of those deletes fires this trigger. It used to
`instructorRef.set(patch, { merge: true })`, which happily recreates the (just-deleted)
parent as a ghost `{ categoryIds: [] }` doc seconds after the cascade removed it — observed on
the staging deploy. It now uses `instructorRef.update(patch)` and treats gRPC NOT_FOUND (code
5) as "parent gone, nothing to sync" (returns quietly; any other error still propagates). No
legitimate write path adds a service before its parent `instructors/{uid}` doc exists (the
client's `submitProviderApplication` creates it; `decideProviderApplication` and
`backfillSelfRegisteredProviders` add services via `batch.update(instructorRef, …)` alongside
the service writes in the same atomic batch, so a missing parent fails the whole batch rather
than partially succeeding), so this is safe.

### Background job

- `adminBulkDeleteUsers` callable — superadmin only; `{ uids: string[1..500], reason }`
  (reason required, trimmed, non-empty; every uid validated by the shared `isValidUid`).
  `decideExistingJobAction` (pure, tested standalone) decides what to do about the caller's
  latest `queued`/`running` job, if any: `proceed` (none exists), `block`
  (`failed-precondition` — one bulk delete in flight per actor at a time, so retries from two
  overlapping jobs never interleave), or `abandon` (it's stale — `updatedAt` over 30 minutes
  old, so its trigger never ran or the event was lost). An `abandon` doesn't just get ignored:
  in the **same batch** that creates the new job, the stale job is marked
  `{ status: 'failed', error: 'abandoned: no progress for 30 minutes', updatedAt,
  finishedAt }` plus an audit entry (`bulk_{staleId}_abandoned`) — so a late trigger delivery
  for it hits `runAdminJobAttempt`'s terminal check and stops immediately instead of
  potentially running concurrently with the new job. Otherwise (or after queuing the
  abandonment) the same batch creates `adminJobs/{jobId}` (`{ type: 'bulk_delete_users',
  status: 'queued', uids, reason, actorUid, actorEmail, total, attempts: 0, done: 0,
  failed: 0, skipped: 0, results: {}, createdAt, updatedAt }`) and its own "job queued" audit
  entry, then returns `{ jobId }` at once.
- `onAdminJobCreated` — `onDocumentCreated('adminJobs/{jobId}')`, 540 s, 512 MiB,
  `retry: true`. Each invocation: reads the live doc (a retry redelivers the creation-time
  snapshot, not current progress) **first**, returns immediately if the job is already
  `completed`/`completed_with_errors`/`failed` (so a late duplicate delivery after the job
  finished can't resurrect it back to `running`), and only then increments `attempts` and
  marks `running`. The rest of the control flow (`runAdminJobAttempt` in `bulkDelete.ts`, unit
  tested without a real Firestore doc) is up to `MAX_ATTEMPTS = 3` attempts total; per uid:
  - a uid with a terminal outcome already recorded (`deleted` or `skipped`) is left alone —
    a retried run resumes, never repeats
  - `failed` uids **are** retried on the next attempt (see below)
  - the caller's own uid → skipped, `self`
  - target missing, with no pre-delete audit for it in this job → skipped, `not_found`
  - target missing, but its pre-delete audit *does* exist → a previous attempt started the
    cascade and crashed mid-way; run the cascade again (idempotent) to finish it, no second
    audit
  - target is superadmin → skipped, `superadmin` (single delete still allows it)
  - otherwise: write the pre-delete audit **before** the cascade runs (see Audit below),
    then `deleteUserCascade`
  - any thrown error (from the audit write or the cascade) is recorded as `failed`, with the
    error message truncated to 300 chars (preferring `<code>: <message>`, and the *last* of a
    BulkWriter error's two "Caused by" stack lines — the real cause, not the bare call site);
    the job continues with the remaining uids
  - a per-user failure never aborts the run, but an infrastructure failure (e.g. a progress
    write itself failing) does: no new uid is started, uids already in flight are allowed to
    finish, then the error is rethrown so the platform retries the whole attempt. A batch that
    failed to save is merged back into the next flush attempt instead of being dropped.
  - progress (`results.<uid>`) is buffered and flushed at most once a second, plus a final
    flush before the attempt returns — not one Firestore write per user, which would exceed
    the ~1 write/s per-doc soft limit at a 500-uid job with concurrency 5
  If uids are still `failed` after the run and this wasn't the final attempt, the trigger
  throws to force a platform retry (status stays `running`, no summary audit yet). Once the
  job is finishing — nothing failed, or this was the final attempt — the summary audit is
  written and `done`/`failed`/`skipped` and `status` (`completed` or
  `completed_with_errors`) are set; `isFinishing`/`decideAfterRun` is the one predicate for
  this, shared by the job processor and the trigger rather than duplicated. If `attempts` ever
  exceeds `MAX_ATTEMPTS` on entry (a safety net against a bug that made every attempt throw
  before it could finalize), every still-pending uid is marked `failed` (keeping its previous
  error, prefixed "gave up after 3 attempts: …" — a never-attempted uid just gets the bare
  message), the summary audit is written, and status becomes `completed_with_errors` without
  running anything further. An unexpected error on the final attempt does the same
  finalization (re-reading `results` first, since a buffered save may have persisted progress
  this attempt's in-memory job object predates) but sets a terminal `status: 'failed'` with a
  truncated `error` field, instead of rethrowing into another retry window. Both give-up paths
  share one `finalizeGaveUp` helper.
  - **Known limitation, not fixed:** there is no lease on a job. A duplicate event delivery
    while an attempt is genuinely still running can execute concurrently with it. The cascade
    is idempotent, so the worst case is a spurious `failed` outcome that the next attempt
    retries — not data loss or a corrupted count.
  - All maps keyed by uid (`outcomes`, the give-up pass) are read via `Object.hasOwn`, not
    bare bracket access — a uid literally spelled `"constructor"` would otherwise read an
    inherited `Object.prototype` value and never get processed.

### Audit

New entity type `admin_job` in both vocabulary halves (`functions/src/lib/auditEntityTypes.ts`,
`src/types/audit.ts`; parity test). Entries, each at a deterministic id so a retried step is a
no-op instead of a duplicate: job queued (`create`/`admin_job`, id `bulk_{jobId}_queued`), a
stale job abandoned (`update`/`admin_job`, id `bulk_{staleId}_abandoned`), one per deleted
user (`delete`/`user`, id `bulk_{jobId}_u_{uid}` — the `_u_` segment exists so a uid literally
spelled `"queued"` or `"summary"` can't collide with the job-level ids; **written before that
user's cascade runs** — the id's existence is exactly how a resumed run tells "already being
deleted" apart from "never existed"), job finished (`update`/`admin_job`, id
`bulk_{jobId}_summary`, counts + failures; built once, by `buildSummaryAuditPayload`, shared
by the normal finishing path and both give-up paths). Single delete uses the parallel
`single_{uid}_{Date.now()}` / `single_{uid}_{Date.now()}_partial` ids. `writeAuditLogOnce`
uses Firestore `create()` and treats `ALREADY_EXISTS` as success; unlike the general-purpose
`writeAuditLog`, it does not swallow other errors — a failed audit write must fail the
operation, not silently proceed to delete data with no record of it. Failures also go to
Cloud Logging. The client-side duplicate audit on single delete (row + detail) is removed —
the server entry is the record.

### Rules

`adminJobs/{jobId}`: read if superadmin; no client writes. `audit_logs/{logId}` create is
`isAdmin() && !logId.matches('(bulk|single)_.*')` — that id space is reserved for the server;
a client pre-creating one would make the real `writeAuditLogOnce` call silently no-op on
`ALREADY_EXISTS` while the cascade still ran, deleting a user with no audit entry to show for
it.

### Client

- Status filter gains `hidden` ("Demo & eliminati"): `getUsers` returns only
  `isHiddenAccount` users for it and excludes them otherwise. Its row mapping spreads the
  document data BEFORE `id`/`uid: doc.id` — the doc id must always win over a same-named
  field stored inside the document, or a row's checkbox/quick actions could act on a
  different account than the one displayed.
- Bulk "Elimina" opens `ConfirmDeleteDialog` (reason required) and calls
  `adminBulkDeleteUsers`; the `delete` branch of `bulkUpdateUsers` is removed. Bulk
  activate/suspend and the bulk role change all act on `visibleSelectedIds` (selection
  filtered to ids still present in the current `users` page), exactly like bulk delete
  already did — a stale selection (surviving a list refresh that isn't one of the explicit
  filter-change handlers) must never reach an id no longer on screen.
- Single delete (`UserRowQuickActions`, `UserDetailView`) calls `adminDeleteUser` with an
  explicit client `timeout: 300_000` to match the server's own `timeoutSeconds: 300` — the
  SDK's ~70s default would otherwise abort (and report failure for) a delete still running
  server-side.
- `BulkDeleteJobBanner` subscribes to `adminJobs/{jobId}`: "12 / 36 eliminati, 1 errore";
  on reload it finds the actor's latest unfinished job; refetches the list when it ends.

## Testing

Unit: job processor (skip rules, audit-before-cascade, resume via audit existence vs.
`not_found`, failed uids retried on the next attempt, summary written only when the job is
finishing, buffered/throttled progress writes recovering a failed flush's batch instead of
losing it, a pool that stops starting new work after a failure but lets in-flight work finish,
error-string truncation including the two-"Caused by"-lines case, prototype-safe `"constructor"`
uid handling), the pure `isFinishing`/`decideAfterRun`/`giveUpOnPending`/`isStaleJob`/
`decideExistingJobAction`/`isValidUid` decision helpers, `runAdminJobAttempt` (the trigger's
control flow extracted and dependency-injected: terminal early return, give-up-on-entry,
normal finish, final-attempt failure), callable validation (including the shared uid shape
check), cascade call order — `users/{uid}` last — and `providerApplications` cleanup with
injected deps, `writeAuditLogOnce`/`auditLogExists` against a mocked Firestore,
`syncInstructorFromServices` (the `onProviderServiceWrite` trigger body, extracted and
dependency-injected: computed patch, NOT_FOUND swallowed, any other error rethrown), audit
vocabulary parity, `getUsers` hidden filter and doc-id-wins-over-stored-field precedence,
`usersListQuery` round-trip with `hidden`, `UsersListView` bulk delete acting on exactly the
visible selection. Staging: three throwaway users (one provider with an instructors doc and a
subcollection doc), bulk-delete from the UI, confirm data, Auth and audit entries.
Production: deploy only; the superadmin runs the purge.

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

`functions/src/users/deleteUserCascade.ts` — `deleteUserCascade(uid)` removes:

- the Auth account first; `auth/user-not-found` is not an error (seeded ids never had one)
- `users/{uid}` and all its subcollections (`recursiveDelete`)
- `instructors/{uid}` and all its subcollections, when present
- `providerApplications` docs with `userId == uid` — personal data, not a legal record
- Storage prefixes `users/{uid}/`, `avatars/{uid}/`, `profile-photos/{uid}/`,
  `certifications/{uid}/`, `portfolios/{uid}/`, `instructors/{uid}/`

It keeps bookings, payments, transactions, audit logs, and reviews/client notes the user left
on other people's documents — financial and legal records. Every step is safe to run twice:
a retried or resumed call finishes whatever an earlier, interrupted attempt started, rather
than erroring on data that is already gone.

`adminDeleteUser` (single) and the bulk job both call it. Single delete retries the cascade up
to 3 times (1s, then 2s backoff) before giving up; a final failure is still audited — `after:
{ partial: true, error }` — and the callable fails with `HttpsError('internal', …)` so the
admin sees it did not fully succeed, instead of a silently orphaned user document.

### Background job

- `adminBulkDeleteUsers` callable — superadmin only; `{ uids: string[1..500], reason }`
  (reason required, trimmed, non-empty; each uid ≤128 chars, not `.`/`..`, not
  `/^__.*__$/`). Refuses with `failed-precondition` if the caller already has a job with
  status `queued` or `running` — one bulk delete in flight per actor at a time, so retries
  from two overlapping jobs never interleave. Otherwise creates `adminJobs/{jobId}`
  (`{ type: 'bulk_delete_users', status: 'queued', uids, reason, actorUid, actorEmail,
  total, attempts: 0, done: 0, failed: 0, skipped: 0, results: {}, createdAt, updatedAt }`)
  and the "job queued" audit entry in one batch, then returns `{ jobId }` at once.
- `onAdminJobCreated` — `onDocumentCreated('adminJobs/{jobId}')`, 540 s, 512 MiB,
  `retry: true`. Each invocation increments `attempts`, marks `running`, and re-reads the
  doc (a retry redelivers the creation-time snapshot, not current progress). Up to
  `MAX_ATTEMPTS = 3` attempts total; per uid:
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
    error message truncated to 300 chars; the job continues with the remaining uids
  - a per-user failure never aborts the run, but an infrastructure failure (e.g. a progress
    write itself failing) does: no new uid is started, uids already in flight are allowed to
    finish, then the error is rethrown so the platform retries the whole attempt
  - progress (`results.<uid>`) is buffered and flushed at most once a second, plus a final
    flush before the attempt returns — not one Firestore write per user, which would exceed
    the ~1 write/s per-doc soft limit at a 500-uid job with concurrency 5
  If uids are still `failed` after the run and this wasn't the final attempt, the trigger
  throws to force a platform retry (status stays `running`, no summary audit yet). Once the
  job is finishing — nothing failed, or this was the final attempt — the summary audit is
  written and `done`/`failed`/`skipped` and `status` (`completed` or
  `completed_with_errors`) are set. If `attempts` ever exceeds `MAX_ATTEMPTS` on entry (a
  safety net against a bug that made every attempt throw before it could finalize), every
  still-pending uid is marked `failed` ("gave up after 3 attempts"), the summary audit is
  written, and status becomes `completed_with_errors` without running anything further. An
  unexpected error on the final attempt itself sets a terminal `status: 'failed'` (with a
  truncated `error` field) instead of rethrowing into another retry window.

### Audit

New entity type `admin_job` in both vocabulary halves (`functions/src/lib/auditEntityTypes.ts`,
`src/types/audit.ts`; parity test). Entries, each at a deterministic id so a retried step is a
no-op instead of a duplicate: job queued (`create`/`admin_job`, id `bulk_{jobId}_queued`), one
per deleted user (`delete`/`user`, id `bulk_{jobId}_{uid}`, **written before that user's
cascade runs** — the id's existence is exactly how a resumed run tells "already being
deleted" apart from "never existed"), job finished (`update`/`admin_job`, id
`bulk_{jobId}_summary`, counts + failures). `writeAuditLogOnce` uses Firestore `create()` and
treats `ALREADY_EXISTS` as success; unlike the general-purpose `writeAuditLog`, it does not
swallow other errors — a failed audit write must fail the user's outcome, not silently proceed
to delete data with no record of it. Failures also go to Cloud Logging. The client-side
duplicate audit on single delete (row + detail) is removed — the server entry is the record.

### Rules

`adminJobs/{jobId}`: read if superadmin; no client writes.

### Client

- Status filter gains `hidden` ("Demo & eliminati"): `getUsers` returns only
  `isHiddenAccount` users for it and excludes them otherwise.
- Bulk "Elimina" opens `ConfirmDeleteDialog` (reason required) and calls
  `adminBulkDeleteUsers`; the `delete` branch of `bulkUpdateUsers` is removed.
- `BulkDeleteJobBanner` subscribes to `adminJobs/{jobId}`: "12 / 36 eliminati, 1 errore";
  on reload it finds the actor's latest unfinished job; refetches the list when it ends.

## Testing

Unit: job processor (skip rules, audit-before-cascade, resume via audit existence vs.
`not_found`, failed uids retried on the next attempt, summary written only when the job is
finishing, buffered/throttled progress writes, a pool that stops starting new work after a
failure but lets in-flight work finish, error-string truncation), the pure
`decideAfterRun`/`giveUpOnPending` decision helpers, callable validation (including the uid
shape checks), cascade call order and `providerApplications` cleanup with injected deps,
`writeAuditLogOnce`/`auditLogExists` against a mocked Firestore, audit vocabulary parity,
`getUsers` hidden filter, `usersListQuery` round-trip with `hidden`. Staging: three throwaway
users (one provider with an instructors doc and a subcollection doc), bulk-delete from the UI,
confirm data, Auth and audit entries. Production: deploy only; the superadmin runs the purge.

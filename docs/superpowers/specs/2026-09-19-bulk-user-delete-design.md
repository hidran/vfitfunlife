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

- `users/{uid}` and all its subcollections (`recursiveDelete`)
- `instructors/{uid}` and all its subcollections, when present
- Storage prefixes `users/{uid}/`, `avatars/{uid}/`, `profile-photos/{uid}/`,
  `certifications/{uid}/`, `portfolios/{uid}/`, `instructors/{uid}/`
- the Auth account; `auth/user-not-found` is not an error (seeded ids never had one)

It keeps bookings, payments, transactions, audit logs, and reviews/client notes the user left
on other people's documents — financial and legal records.

`adminDeleteUser` (single) and the bulk job both call it.

### Background job

- `adminBulkDeleteUsers` callable — superadmin only; `{ uids: string[1..500], reason }`
  (reason required, trimmed, non-empty). Creates `adminJobs/{jobId}`:
  `{ type: 'bulk_delete_users', status: 'queued', uids, reason, actorUid, actorEmail,
  total, done: 0, failed: 0, skipped: 0, results: {}, createdAt, updatedAt }`, writes the
  "job queued" audit entry, returns `{ jobId }` at once.
- `onAdminJobCreated` — `onDocumentCreated('adminJobs/{jobId}')`, 540 s, 512 MiB,
  `retry: true`. Marks `running`, then processes uids with concurrency 5:
  - already present in `results` → skip (a retried run resumes, never repeats)
  - the caller's own uid → skipped, `self`
  - target missing → skipped, `not_found`
  - target is superadmin → skipped, `superadmin` (single delete still allows it)
  - otherwise snapshot the doc, `deleteUserCascade`, audit `delete`/`user` with the snapshot
    as `before`, the reason, and the job id in `reason`
  - a thrown error is recorded as `failed` with its message; the job continues
  Progress is `results.<uid>`, written after each user (the banner counts from it); the
  `done`/`failed`/`skipped` totals are written once, when the job ends with `completed` or
  `completed_with_errors` and a summary audit entry listing every failure.

### Audit

New entity type `admin_job` in both vocabulary halves (`functions/src/lib/auditEntityTypes.ts`,
`src/types/audit.ts`; parity test). Entries: job queued (`create`/`admin_job`), one per deleted
user (`delete`/`user`), job finished (`update`/`admin_job`, counts + failures). Failures also
go to Cloud Logging. The client-side duplicate audit on single delete (row + detail) is
removed — the server entry is the record.

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

Unit: job processor (skip rules, idempotent resume, per-user audit, failure continues,
summary), callable validation, cascade call order with injected deps, audit vocabulary parity,
`getUsers` hidden filter, `usersListQuery` round-trip with `hidden`. Staging: three throwaway
users (one provider with an instructors doc and a subcollection doc), bulk-delete from the UI,
confirm data, Auth and audit entries. Production: deploy only; the superadmin runs the purge.

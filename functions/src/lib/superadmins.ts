/**
 * The only two accounts that may ever hold Firestore `users/{uid}.role == 'superadmin'`.
 * Every server-side path that can write a user's role, permissions, or suspend/delete a
 * user must check this allowlist and refuse to touch an existing superadmin doc — see
 * `functions/src/users/roles.ts`, `functions/src/users/adminMutations.ts` and
 * `functions/src/users/bulkDeleteJob.ts`.
 *
 * `firestore.rules` cannot import this file, so `match /users/{userId}` hardcodes the same
 * two uids in a comment pointing back here — keep both lists in sync if either ever changes.
 *
 * hidran@gmail.com, admin@vfit.com — production's only two superadmins (2026-09-20).
 */
export const PROTECTED_SUPERADMIN_UIDS = [
  "7MK6TgATIbhl3BkUksLNdGi7cMg1",
  "KTNK3mIMHqg8JNOQiVyKioulORs1",
] as const;

/** Whether `uid` is one of the two accounts allowed to hold role `superadmin`. */
export function mayHoldSuperadmin(uid: string): boolean {
  return (PROTECTED_SUPERADMIN_UIDS as readonly string[]).includes(uid);
}

/**
 * Whether a user document is a protected superadmin, i.e. its CURRENT role is `superadmin`
 * — and therefore immutable through the app except by its own owner editing their own
 * ordinary profile fields (never role, permissions, or suspend/delete status).
 *
 * Checked by the document's role field, not its id: any doc whose role is `superadmin` is
 * protected, even in the (should-never-happen) case that it isn't one of the two allowlisted
 * uids — a stray superadmin is exactly the account this whole feature exists to lock down.
 */
export function isProtectedSuperadmin(userDoc: { role?: unknown } | null | undefined): boolean {
  return !!userDoc && userDoc.role === "superadmin";
}

/**
 * Staging login allowlist — pure logic, no firebase imports, so it unit-tests without an
 * emulator and can be loaded by index.ts before deciding what to export.
 *
 * Staging (vfit-app-staging) runs on Identity Platform, which is what makes Auth blocking
 * functions available there. Production (vfit-funlife) is plain Firebase Auth: a blocking
 * function deployed there would fail the deploy, and nothing about this gate should exist in
 * production anyway. `stagingAllowlistEnabled()` is the single switch index.ts reads.
 *
 * Data: `stagingAllowlist/{emailLowercase}` → `{ email, note?, addedBy, addedByUid?, addedAt }`.
 * See docs/backend/roles-and-permissions.md, "Staging login allowlist".
 */

export const STAGING_PROJECT_ID = "vfit-app-staging";
export const STAGING_ALLOWLIST_COLLECTION = "stagingAllowlist";

/** The message clients match on; blocking functions surface it inside the auth error. */
export const STAGING_ACCESS_DENIED = "staging-access-denied";

export const MAX_NOTE_LENGTH = 200;

/**
 * Whether this functions build should export the staging-only functions.
 *
 * `firebase deploy` runs the source once for discovery with `GCLOUD_PROJECT` set to the target
 * project (firebase-tools `loadFirebaseEnvs`), and Cloud Run sets the same variable at
 * runtime, so the exported set is decided per deploy target.
 *
 * The functions emulator sets `FUNCTIONS_EMULATOR=true` and `GCLOUD_PROJECT` to whatever
 * project it was started with. The e2e journey suite must not have its sign-ups blocked, so
 * in the emulator these functions load only when `STAGING_ALLOWLIST_IN_EMULATOR=true`.
 */
export function stagingAllowlistEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.FUNCTIONS_EMULATOR === "true") {
    return env.STAGING_ALLOWLIST_IN_EMULATOR === "true";
  }
  return env.GCLOUD_PROJECT === STAGING_PROJECT_ID;
}

// Deliberately plain: one "@", no whitespace, a dot in the domain. Also refuses "/" because
// the normalized email is used verbatim as a Firestore document id.
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

/** Lowercased, trimmed email suitable as an allowlist doc id, or null if it isn't one. */
export function normalizeAllowlistEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;
  return EMAIL_RE.test(email) ? email : null;
}

/** Trimmed note, or undefined when absent/blank. Throws on a non-string or over-long note. */
export function normalizeAllowlistNote(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new Error("note must be a string");
  const note = raw.trim();
  if (note.length > MAX_NOTE_LENGTH) throw new Error(`note must be at most ${MAX_NOTE_LENGTH} characters`);
  return note.length > 0 ? note : undefined;
}

export interface StagingAccessLookups {
  /** Whether `stagingAllowlist/{emailLowercase}` exists. */
  hasAllowlistEntry(emailLowercase: string): Promise<boolean>;
  /** `users/{uid}.role`, or undefined when there is no profile yet. */
  getRole(uid: string): Promise<unknown>;
}

/**
 * Whether an account may create a user / sign in on staging: its email (lowercased) is on the
 * allowlist, or its existing profile is a superadmin (so a superadmin can never lock
 * themselves out by deleting their own entry).
 *
 * The allowlist is checked first — it is the common case and needs no uid.
 */
export async function isStagingAccessAllowed(
  user: { uid?: string | null; email?: string | null },
  lookups: StagingAccessLookups,
): Promise<boolean> {
  const email = normalizeAllowlistEmail(user.email);
  if (email && (await lookups.hasAllowlistEntry(email))) return true;
  if (user.uid && (await lookups.getRole(user.uid)) === "superadmin") return true;
  return false;
}

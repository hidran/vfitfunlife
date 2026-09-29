/**
 * Client half of the staging login allowlist — pure decisions only (no Firebase), so the
 * rules are unit-tested and the root-mounted StagingGate stays tiny.
 *
 * The real enforcement is server-side: on vfit-app-staging, Auth blocking functions refuse
 * to create or sign in any account that is not allowlisted (functions/src/staging). This
 * gate is the UX around it: visitors who aren't allowed are sent to production instead of
 * seeing a staging build.
 *
 * Gated by hostname, not by project id, so `next dev` on localhost and the emulator setup
 * — which may well point at the staging project — are never gated.
 */

export const STAGING_PROJECT_ID = 'vfit-app-staging';
export const STAGING_HOST_PREFIX = `${STAGING_PROJECT_ID}.`;
export const PROD_ORIGIN = 'https://vfit-funlife.web.app';
export const STAGING_ALLOWLIST_COLLECTION = 'stagingAllowlist';

/** The html attribute the inline boot script sets to hide the page until the gate decides. */
export const STAGING_GATE_ATTR = 'data-staging-gate';

/** vfit-app-staging.web.app / vfit-app-staging.firebaseapp.com. */
export function isStagingHost(hostname: string): boolean {
  return hostname.startsWith(STAGING_HOST_PREFIX);
}

/** Whether this build talks to the staging Firebase project (sidebar item visibility). */
export function isStagingProject(projectId: string | undefined = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID): boolean {
  return projectId === STAGING_PROJECT_ID;
}

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/** Routes a signed-out visitor may see on staging: sign-in, and the reset for a forgotten password. */
const PUBLIC_PATHS = new Set(['/auth/login', '/auth/forgot-password']);

export function isPublicStagingPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(stripTrailingSlash(pathname));
}

/** Nobody registers on staging: accounts are created for allowlisted emails only. */
export function isRegistrationPath(pathname: string): boolean {
  const p = stripTrailingSlash(pathname);
  return p === '/auth/register' || p.startsWith('/auth/register/');
}

/** The same path + query on production. */
export function prodUrlFor(pathname: string, search = ''): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${PROD_ORIGIN}${path}${search}`;
}

export type StagingGateDecision =
  /** Still waiting on auth or the allowlist lookup — keep the page hidden. */
  | 'pending'
  | 'allow'
  | 'redirect'
  | 'signout-redirect';

export interface StagingGateInput {
  pathname: string;
  /** Auth has settled (store initialized and not loading). */
  authReady: boolean;
  signedIn: boolean;
  /** Allowlisted or superadmin; undefined while the lookup is in flight. */
  allowed: boolean | undefined;
}

export function decideStagingGate({ pathname, authReady, signedIn, allowed }: StagingGateInput): StagingGateDecision {
  // Decidable from the URL alone, before auth even starts.
  if (isRegistrationPath(pathname)) return 'redirect';
  if (!authReady) return isPublicStagingPath(pathname) ? 'allow' : 'pending';
  if (!signedIn) return isPublicStagingPath(pathname) ? 'allow' : 'redirect';
  if (allowed === undefined) return 'pending';
  return allowed ? 'allow' : 'signout-redirect';
}

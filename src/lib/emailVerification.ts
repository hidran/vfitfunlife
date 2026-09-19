/**
 * Email verification rules shared by the auth store and the verification banner.
 * Pure — takes the Firebase Auth user's relevant fields, not the SDK object.
 */

/** Providers that only hand out verified addresses; the server auto-verifies them. */
const SOCIAL_PROVIDERS = new Set(['google.com', 'apple.com']);

export interface AuthUserLike {
  email: string | null;
  emailVerified: boolean;
  providerData: { providerId: string }[];
}

function hasProvider(user: AuthUserLike, match: (providerId: string) => boolean): boolean {
  return user.providerData.some((p) => match(p.providerId));
}

/**
 * The user signed up with email + password and hasn't opened the verification
 * link yet. `docEmailVerified` is users/{uid}.emailVerified (server-owned).
 */
export function isAwaitingEmailVerification(
  user: AuthUserLike,
  docEmailVerified: boolean | undefined,
): boolean {
  if (!user.email || user.emailVerified || docEmailVerified === true) return false;
  return hasProvider(user, (id) => id === 'password') && !hasProvider(user, (id) => SOCIAL_PROVIDERS.has(id));
}

/**
 * The profile doc should be brought in line with Auth: either Auth already says
 * verified, or this is a Google/Apple sign-in the server will auto-verify.
 */
export function needsVerificationSync(
  user: AuthUserLike,
  docEmailVerified: boolean | undefined,
): boolean {
  if (!user.email || docEmailVerified === true) return false;
  return user.emailVerified || hasProvider(user, (id) => SOCIAL_PROVIDERS.has(id));
}

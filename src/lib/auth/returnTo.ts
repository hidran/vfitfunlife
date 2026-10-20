/**
 * Where the login page sends someone back to after signing in (`/auth/login?next=/courses?id=…&lesson=…`).
 * Only same-origin paths are accepted: anything else (another host, `//host`, a backslash trick, the auth pages
 * themselves) is ignored, so the parameter cannot be used as an open redirect.
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return null;
  if (raw === '/auth' || raw.startsWith('/auth/') || raw.startsWith('/auth?')) return null;
  return raw;
}

/** The login page URL that returns to `path` (a same-origin path with its query) after sign-in. */
export const loginHref = (path: string) => `/auth/login?next=${encodeURIComponent(path)}`;

/** `?next=` of the current page, validated; null on the server or when absent. */
export function returnToFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return safeReturnTo(new URLSearchParams(window.location.search).get('next'));
}

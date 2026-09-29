/**
 * Public provider (trainer / therapist / venue host) pages.
 *
 * They live under `/providers/*` with the id in the query string, NOT `/provider/<id>`:
 *  - `output: 'export'` forces `dynamicParams = false`, so a `[id]` segment only serves the
 *    ids known at build time — every provider created afterwards 404s.
 *  - `/provider/*` is the provider DASHBOARD (src/app/(main)/provider/*), guarded by its
 *    layout; a public page there would share its URL space (`/provider/dashboard` vs
 *    `/provider/<id>`) and every future dashboard route would risk shadowing a profile.
 *
 * Legacy `/provider/<id>[/reviews]` links are forwarded by the firebase.json rewrite to
 * public/provider-legacy-redirect.html (see `legacyProviderPathToHref` for the same rule).
 */
export const PROVIDER_PROFILE_PATH = '/providers/detail';
export const PROVIDER_REVIEWS_PATH = '/providers/reviews';

export function providerProfileHref(providerId: string): string {
  return `${PROVIDER_PROFILE_PATH}?id=${encodeURIComponent(providerId)}`;
}

export function providerReviewsHref(providerId: string): string {
  return `${PROVIDER_REVIEWS_PATH}?id=${encodeURIComponent(providerId)}`;
}

/** Top-level segments of the provider dashboard — `/provider/<one of these>` is never a profile id. */
export const PROVIDER_DASHBOARD_SEGMENTS: readonly string[] = [
  'dashboard',
  'schedule',
  'bookings',
  'clients',
  'services',
  'availability',
  'earnings',
  'recipes',
];

/**
 * Maps a legacy `/provider/<id>` or `/provider/<id>/reviews` pathname to the query-string
 * URL, or null when it is not a legacy profile link (dashboard routes included).
 * Mirrors the inline script in public/provider-legacy-redirect.html.
 */
export function legacyProviderPathToHref(pathname: string): string | null {
  const match = /^\/provider\/([^/]+)(\/reviews)?\/?$/.exec(pathname);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!id || PROVIDER_DASHBOARD_SEGMENTS.includes(id)) return null;
  return match[2] ? providerReviewsHref(id) : providerProfileHref(id);
}

/**
 * Reads `?id=` on a query-string detail page. useSearchParams can hydrate empty on the first
 * client render under `output: 'export'`, so fall back to the raw URL (same as
 * BookingDetailClient).
 */
export function readIdParam(searchParams: { get(name: string): string | null } | null): string | null {
  const fromHook = searchParams?.get('id');
  if (fromHook) return fromHook;
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id') || null;
}

/**
 * Chat: `/chat` (inbox) and `/chat/detail` (thread) — query strings, not `/chat/<id>`, for
 * the same `output: 'export'` reason as the provider pages above.
 *
 * `chatHref(otherUid)` opens the thread with that user whether or not a conversation exists
 * yet; the page derives the deterministic `${minUid}_${maxUid}` id from the signed-in uid.
 * The optional hints are written into the conversation on first contact (a customer cannot
 * read a trainer's users doc, nor a trainer a customer's), and `bookingId` records where the
 * chat was opened from.
 */
export const CHAT_INBOX_PATH = '/chat';
export const CHAT_THREAD_PATH = '/chat/detail';

export interface ChatHrefHints {
  name?: string | null;
  photoUrl?: string | null;
  bookingId?: string | null;
}

export function chatHref(otherUid: string, hints: ChatHrefHints = {}): string {
  const params = new URLSearchParams({ with: otherUid });
  if (hints.name) params.set('name', hints.name);
  if (hints.photoUrl) params.set('photo', hints.photoUrl);
  if (hints.bookingId) params.set('booking', hints.bookingId);
  return `${CHAT_THREAD_PATH}?${params.toString()}`;
}

export function conversationHref(conversationId: string): string {
  return `${CHAT_THREAD_PATH}?id=${encodeURIComponent(conversationId)}`;
}

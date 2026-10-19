import type { MessageKey } from '@/i18n/messages';

/**
 * Why decideProviderApplication refused, when the admin can act on the reason.
 *
 * The callable sends a stable code as the HttpsError message. `venue_exists` (approving a
 * company whose `venues/biz_<uid>` already exists: another approval got there first, or an
 * admin created that venue by hand) rolls the whole approval back, so the admin needs to
 * know nothing changed and where to look. Anything else returns null and the caller keeps
 * its generic "action failed" text.
 *
 * `provider_type_locked` is raised by applyAsProvider, not by this callable; the applicant
 * sees it through providerApplicationErrorFor in src/lib/businessDetails.ts.
 */
export function providerDecisionErrorKey(err: unknown): MessageKey | null {
  const message = String((err as { message?: unknown } | null)?.message ?? '');
  return message === 'venue_exists' ? 'admin.providerDecision.error.venueExists' : null;
}

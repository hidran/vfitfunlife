import type { ProviderStatus, UserRole } from '@/types/firebase';
import { canAccessProviderArea } from '@/lib/providerStatus';

export const PROVIDER_HOME = '/provider/dashboard';

/**
 * Where a signed-in user lands after login, registration or app launch. Providers go
 * straight to their dashboard: they come back to the app to work, not to browse it.
 * Pending applicants count — the provider layout already lets them in.
 */
export function postAuthRoute(
  user: { role?: UserRole; providerStatus?: ProviderStatus } | null | undefined
): string {
  if (user?.role === 'admin' || user?.role === 'superadmin') return '/admin';
  if (canAccessProviderArea(user?.providerStatus)) return PROVIDER_HOME;
  return '/home';
}

/**
 * Where someone who is ALREADY registered goes when they open the registration page (or
 * sign up with an account that exists): not the page, but their own space. Providers — and
 * pending applicants, whom the provider layout lets in — to the dashboard; staff to the back
 * office; everyone else to their profile.
 */
export function alreadyRegisteredRoute(
  user: { role?: UserRole; providerStatus?: ProviderStatus } | null | undefined
): string {
  if (canAccessProviderArea(user?.providerStatus)) return PROVIDER_HOME;
  if (user?.role === 'admin' || user?.role === 'superadmin') return '/admin';
  return '/profile';
}

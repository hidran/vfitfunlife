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

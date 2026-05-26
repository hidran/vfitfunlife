import type { ProviderStatus } from '@/types/firebase';

export type ProviderCardVariant = 'cta' | 'pending' | 'verified' | 'rejected';

/** Which variant of the "become a provider" card to show for a given status. */
export function providerCardState(status: ProviderStatus | undefined): ProviderCardVariant {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'verified':
      return 'verified';
    case 'rejected':
      return 'rejected';
    default:
      return 'cta';
  }
}

/** Whether a user may enter the provider dashboard area. */
export function canAccessProviderArea(status: ProviderStatus | undefined): boolean {
  return status === 'pending' || status === 'verified';
}

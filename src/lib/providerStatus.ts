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

/**
 * How a provider application ended, from `applyAsProvider`'s answer: approved on the spot, or
 * queued for review (always the case for a company). Undefined when the answer doesn't say —
 * then the reloaded user document is the only source.
 */
export function applicationOutcomeStatus(
  result: { autoApproved?: boolean } | null | undefined
): Extract<ProviderStatus, 'verified' | 'pending'> | undefined {
  if (result?.autoApproved === true) return 'verified';
  if (result?.autoApproved === false) return 'pending';
  return undefined;
}

/** Whether a user may enter the provider dashboard area. */
export function canAccessProviderArea(status: ProviderStatus | undefined): boolean {
  return status === 'pending' || status === 'verified';
}

'use client';

/**
 * Whether Stripe payments and VIP subscription selling are switched on.
 *
 * Mirrors functions/src/payments/paymentSettings.ts, where the Stripe callables enforce the
 * same switches; this copy only decides what to show. Until the document loads, and whenever
 * it is missing or malformed, both read as off: an entry point that appears a moment late is
 * the right failure, one that offers a purchase the server will refuse is not.
 */

import { useQuery } from '@tanstack/react-query';
import { loadFirestore } from '@/lib/firebase/lazyFirestore';
import { queryKeys } from '@/lib/queryKeys';

export interface PaymentSettings {
  stripePaymentsEnabled: boolean;
  subscriptionsEnabled: boolean;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  stripePaymentsEnabled: false,
  subscriptionsEnabled: false,
};

export function mergePaymentSettings(stored: Record<string, unknown> | undefined): PaymentSettings {
  return {
    stripePaymentsEnabled: stored?.stripePaymentsEnabled === true,
    subscriptionsEnabled: stored?.subscriptionsEnabled === true,
  };
}

export async function fetchPaymentSettings(): Promise<PaymentSettings> {
  const { db, doc, getDoc } = await loadFirestore();
  const snap = await getDoc(doc(db, 'systemSettings', 'payments'));
  return mergePaymentSettings(snap.exists() ? snap.data() : undefined);
}

export function usePaymentSettings() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.paymentSettings(),
    queryFn: fetchPaymentSettings,
    staleTime: 5 * 60_000,
  });
  const settings = data ?? DEFAULT_PAYMENT_SETTINGS;
  return {
    settings,
    isLoading,
    stripePaymentsEnabled: settings.stripePaymentsEnabled,
    // A subscription is a Stripe charge, so it needs both switches.
    subscriptionsEnabled: settings.stripePaymentsEnabled && settings.subscriptionsEnabled,
  };
}

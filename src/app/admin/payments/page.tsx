'use client';
import { useSearchParams } from 'next/navigation';
import { PaymentsListView, PaymentDetailView } from '@/components/admin/payments';

export default function PaymentsPage() {
  const id = useSearchParams().get('id');
  // Payments are an immutable ledger — created by Cloud Functions (Stripe
  // webhook + booking flow), never by admins. Treat `?id=new` as list.
  if (!id || id === 'new') return <PaymentsListView />;
  return <PaymentDetailView paymentId={id} />;
}

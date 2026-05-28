'use client';
import { useSearchParams } from 'next/navigation';
import { BookingsListView, BookingDetailView } from '@/components/admin/bookings';

export default function BookingsPage() {
  const id = useSearchParams().get('id');
  // Bookings are created by customers via the consumer flow, not by admins —
  // treat `?id=new` as the list.
  if (!id || id === 'new') return <BookingsListView />;
  return <BookingDetailView bookingId={id} />;
}

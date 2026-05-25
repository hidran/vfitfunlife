import BookingRescheduleClient from './BookingRescheduleClient';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function BookingReschedulePage({ params }: { params: Promise<{ id: string }> }) {
  await params;
  return <BookingRescheduleClient />;
}

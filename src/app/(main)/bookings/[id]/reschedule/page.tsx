import BookingRescheduleClient from './BookingRescheduleClient';

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function BookingReschedulePage() {
  return <BookingRescheduleClient />;
}

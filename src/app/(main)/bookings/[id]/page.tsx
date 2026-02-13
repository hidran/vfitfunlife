import BookingDetailClient from './BookingDetailClient';

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function BookingDetailPage() {
  return <BookingDetailClient />;
}

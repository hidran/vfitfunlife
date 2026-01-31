import BookingDetailClient from './BookingDetailClient';

// Generate static params for static export
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function BookingDetailPage() {
  return <BookingDetailClient />;
}

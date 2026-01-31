import BookingClient from './BookingClient';

// Generate static params for static export
export function generateStaticParams() {
  return [{ providerId: 'placeholder' }];
}

export default function BookingPage() {
  return <BookingClient />;
}

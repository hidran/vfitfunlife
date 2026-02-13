import BookingReviewClient from './BookingReviewClient';

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function BookingReviewPage() {
  return <BookingReviewClient />;
}

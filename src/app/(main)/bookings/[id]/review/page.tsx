import BookingReviewClient from './BookingReviewClient';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function BookingReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await params;
  return <BookingReviewClient />;
}

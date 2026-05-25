import BookingDetailClient from './BookingDetailClient';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await params;
  return <BookingDetailClient />;
}

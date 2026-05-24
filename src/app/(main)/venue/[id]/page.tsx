import VenueDetailClient from './VenueDetailClient';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  return <VenueDetailClient />;
}

import { venues } from './data';
import VenueDetailClient from './VenueDetailClient';

export async function generateStaticParams() {
  return venues.map((venue) => ({
    id: venue.id,
  }));
}

export default function VenueDetailPage({ params }: { params: { id: string } }) {
  return <VenueDetailClient id={params.id} />;
}

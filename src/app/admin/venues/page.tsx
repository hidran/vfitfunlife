'use client';
import { useSearchParams } from 'next/navigation';
import {
  VenuesListView,
  VenueDetailView,
  VenueCreateView,
} from '@/components/admin/venues';

export default function VenuesPage() {
  const id = useSearchParams().get('id');
  if (!id) return <VenuesListView />;
  if (id === 'new') return <VenueCreateView />;
  return <VenueDetailView venueId={id} />;
}

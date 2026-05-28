'use client';
import { useSearchParams } from 'next/navigation';
import { ProvidersListView, ProviderDetailView, ProviderCreateView } from '@/components/admin/providers';

export default function ProvidersPage() {
  const id = useSearchParams().get('id');
  if (!id) return <ProvidersListView />;
  if (id === 'new') return <ProviderCreateView />;
  return <ProviderDetailView providerId={id} />;
}

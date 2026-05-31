'use client';
import { useSearchParams } from 'next/navigation';
import {
  ServiceCategoriesListView,
  ServiceCategoryDetailView,
  ServiceCategoryCreateView,
} from '@/components/admin/service-categories';

export default function ServicesPage() {
  const id = useSearchParams().get('id');
  if (!id) return <ServiceCategoriesListView />;
  if (id === 'new') return <ServiceCategoryCreateView />;
  return <ServiceCategoryDetailView serviceCategoryId={id} />;
}

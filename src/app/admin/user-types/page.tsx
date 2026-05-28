'use client';
import { useSearchParams } from 'next/navigation';
import {
  UserTypesListView,
  UserTypeDetailView,
  UserTypeCreateView,
} from '@/components/admin/user-types';

export default function UserTypesPage() {
  const id = useSearchParams().get('id');
  if (!id) return <UserTypesListView />;
  if (id === 'new') return <UserTypeCreateView />;
  return <UserTypeDetailView userTypeId={id} />;
}

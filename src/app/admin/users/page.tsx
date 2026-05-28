'use client';
import { useSearchParams } from 'next/navigation';
import { UsersListView, UserDetailView, UserCreateView } from '@/components/admin/users';

export default function UsersPage() {
  const id = useSearchParams().get('id');
  if (!id) return <UsersListView />;
  if (id === 'new') return <UserCreateView />;
  return <UserDetailView userId={id} />;
}

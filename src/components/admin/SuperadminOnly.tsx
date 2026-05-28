'use client';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function SuperadminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'superadmin') return <>{fallback}</>;
  return <>{children}</>;
}

'use client';

import type { UserRole } from '@/types/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';

interface Props {
  value?: UserRole;
  onChange: (role: UserRole) => void;
  className?: string;
}

export function UserRoleSelect({ value, onChange, className }: Props) {
  const { t } = useI18n();
  const myRole = useAuthStore((s) => s.user?.role);
  // Only superadmin can grant admin/superadmin
  const showElevated = myRole === 'superadmin';
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value as UserRole)}
      onClick={(e) => e.stopPropagation()}
      className={
        className ??
        'rounded-lg border border-white/20 bg-surface-2 px-3 py-1.5 text-sm text-content'
      }
    >
      <option value="" disabled>
        {t('admin.users.changeRole')}
      </option>
      <option value="customer">{t('admin.userDetail.field.roleCustomer')}</option>
      <option value="provider">{t('admin.userDetail.field.roleProvider')}</option>
      {showElevated && (
        <option value="admin">{t('admin.userDetail.field.roleAdmin')}</option>
      )}
      {showElevated && (
        <option value="superadmin">
          {t('admin.userDetail.field.roleSuperadmin')}
        </option>
      )}
    </select>
  );
}

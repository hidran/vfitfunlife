'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import {
  MoreHorizontal,
  CheckCircle,
  Ban,
  Shield,
  Edit,
  Trash2,
} from 'lucide-react';
import { functions } from '@/lib/firebase/config';
import {
  SuperadminOnly,
  ConfirmDeleteDialog,
  useEntityMutation,
} from '@/components/admin';
import { UserRoleSelect } from './UserRoleSelect';
import { useAdminStore } from '@/stores/adminStore';
import { useI18n } from '@/hooks/useI18n';
import type { AdminUser } from '@/types/admin';
import type { UserRole } from '@/types/firebase';

interface Props {
  user: AdminUser;
  onDone?: () => void;
}

export function UserRowQuickActions({ user, onDone }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const {
    suspendUserAction,
    activateUserAction,
    updateUserRoleAction,
  } = useAdminStore();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isSuspended = user.isSuspended === true;

  const toggleMut = useEntityMutation<{ reason?: string }, void>({
    mutate: async ({ reason }) => {
      if (isSuspended) {
        await activateUserAction(user.id);
      } else {
        await suspendUserAction(user.id, reason ?? 'admin quick action');
      }
    },
    audit: ({ reason }) => ({
      action: isSuspended ? 'activate' : 'suspend',
      entityType: 'user',
      entityId: user.id,
      before: { isSuspended },
      after: { isSuspended: !isSuspended },
      reason,
    }),
    invalidateKeys: [['users']],
    onSuccess: () => {
      setOpen(false);
      onDone?.();
    },
  });

  const roleMut = useEntityMutation<{ role: UserRole }, void>({
    mutate: async ({ role }) => {
      await updateUserRoleAction(user.id, role);
    },
    audit: ({ role }) => ({
      action: 'role_change',
      entityType: 'user',
      entityId: user.id,
      before: { role: user.role },
      after: { role },
    }),
    invalidateKeys: [['users']],
    onSuccess: () => {
      setOpen(false);
      onDone?.();
    },
  });

  const deleteMut = useEntityMutation<{ reason: string }, void>({
    mutate: async ({ reason }) => {
      const fn = httpsCallable(functions, 'adminDeleteUser');
      await fn({ uid: user.id, reason });
    },
    audit: ({ reason }) => ({
      action: 'delete',
      entityType: 'user',
      entityId: user.id,
      before: user as unknown as Record<string, unknown>,
      reason,
    }),
    invalidateKeys: [['users']],
    onSuccess: () => {
      setOpen(false);
      setConfirmDelete(false);
      onDone?.();
    },
  });

  return (
    <div
      ref={ref}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('admin.users.quickActions')}
        className="rounded-lg p-1.5 text-content-muted hover:bg-surface-2 hover:text-content"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-56 rounded-xl border border-hairline bg-surface p-1.5 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              const reason = isSuspended
                ? undefined
                : window.prompt(t('admin.userDetail.suspensionReasonPrompt')) ??
                  'admin action';
              toggleMut.mutate({ reason });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-surface-2"
          >
            {isSuspended ? (
              <CheckCircle className="h-4 w-4 text-[#10B981]" />
            ) : (
              <Ban className="h-4 w-4 text-[#F59E0B]" />
            )}
            {isSuspended
              ? t('admin.users.quick.activate')
              : t('admin.users.quick.suspend')}
          </button>

          <SuperadminOnly>
            <div className="px-3 py-1.5">
              <div className="mb-1 flex items-center gap-2 text-xs text-content-muted">
                <Shield className="h-3.5 w-3.5" />
                {t('admin.users.changeRole')}
              </div>
              <UserRoleSelect
                value={user.role}
                onChange={(role) => roleMut.mutate({ role })}
                className="w-full rounded-lg border border-white/20 bg-surface-2 px-2 py-1.5 text-sm text-content"
              />
            </div>
          </SuperadminOnly>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(`/admin/users/?id=${user.id}`);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-surface-2"
          >
            <Edit className="h-4 w-4" />
            {t('admin.detail.edit')}
          </button>

          <SuperadminOnly>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              {t('admin.detail.delete')}
            </button>
          </SuperadminOnly>
        </div>
      )}

      <ConfirmDeleteDialog
        open={confirmDelete}
        entityLabel={t('admin.users.entityLabel')}
        entityName={user.fullName}
        onClose={() => setConfirmDelete(false)}
        onConfirm={(reason) => deleteMut.mutateAsync({ reason })}
      />
    </div>
  );
}

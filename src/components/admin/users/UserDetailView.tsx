'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase/config';
import {
  EntityDetailLayout,
  ConfirmDeleteDialog,
  useEntityMutation,
  UserRoleBadge,
  StatusBadge,
} from '@/components/admin';
import { Button } from '@/components/ui/button';
import { useAdminStore } from '@/stores/adminStore';
import { useI18n } from '@/hooks/useI18n';
import { formatDate, toDate } from '@/lib/utils';
import { usersListHref } from '@/lib/admin/usersListQuery';
import type { User, UserRole } from '@/types/firebase';
import { type UserFormData } from './UserFormView';
import { UserTabBar, UserTabContent, type UserTab } from './UserTabsContent';
import { Mail, Phone, Calendar, Clock, Lock, Ban, CheckCircle } from 'lucide-react';

interface Props {
  userId: string;
}

export function UserDetailView({ userId }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const { updateUserRoleAction, suspendUserAction, activateUserAction } = useAdminStore();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<UserTab>('overview');
  // Back to the list as it was filtered, not the bare list. This view only renders client-side
  // (it hangs off ?id=), so reading sessionStorage in the initializer is safe.
  const [listHref] = useState(usersListHref);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, 'users', userId));
      if (cancelled) return;
      setUser(snap.exists() ? ({ id: snap.id, ...snap.data() } as User) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updateMut = useEntityMutation<UserFormData, void>({
    mutate: async (patch) => {
      await updateDoc(doc(db, 'users', userId), {
        fullName: patch.fullName,
        email: patch.email || null,
        phone: patch.phone || null,
        bio: patch.bio || null,
        updatedAt: serverTimestamp(),
      });
    },
    audit: (patch) => ({
      action: 'update',
      entityType: 'user',
      entityId: userId,
      before: (user ?? undefined) as Record<string, unknown> | undefined,
      after: { ...(user ?? {}), ...patch } as Record<string, unknown>,
    }),
    invalidateKeys: [['users']],
    onSuccess: (_r, patch) => {
      setUser((prev) =>
        prev
          ? ({
              ...prev,
              fullName: patch.fullName,
              email: patch.email || null,
              phone: patch.phone || null,
              bio: patch.bio || null,
            } as User)
          : prev,
      );
      setEditing(false);
    },
  });

  const deleteMut = useEntityMutation<{ reason: string }, void>({
    mutate: async ({ reason }) => {
      // Matches the server's own timeoutSeconds: 300 — the default 70s client timeout would
      // otherwise abort (and report failure for) a delete that's still running server-side.
      const fn = httpsCallable(functions, 'adminDeleteUser', { timeout: 300_000 });
      await fn({ uid: userId, reason });
    },
    invalidateKeys: [['users']],
    onSuccess: () => router.push(usersListHref()),
  });

  const handleRoleChange = async (newRole: UserRole) => {
    if (!user) return;
    try {
      await updateUserRoleAction(user.id, newRole);
      setUser({ ...user, role: newRole });
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };

  const handleSuspend = async () => {
    if (!user) return;
    const reason = prompt('Enter suspension reason:');
    if (!reason) return;
    try {
      await suspendUserAction(user.id, reason);
      setUser({ ...user, isSuspended: true } as User);
    } catch (error) {
      console.error('Failed to suspend user:', error);
    }
  };

  const handleActivate = async () => {
    if (!user) return;
    try {
      await activateUserAction(user.id);
      setUser({ ...user, isSuspended: false } as User);
    } catch (error) {
      console.error('Failed to activate user:', error);
    }
  };

  const handleResetPassword = async () => {
    if (!user) return;
    const confirmed = confirm(
      t('admin.userDetail.confirmResetPassword', { email: user.email || '' }),
    );
    if (!confirmed) return;
    alert(t('admin.userDetail.resetPasswordSuccess'));
  };

  if (loading) {
    return <div className="p-8 text-content-muted">{t('common.loading')}</div>;
  }
  if (!user) {
    return <div className="p-8 text-content-muted">{t('admin.userDetail.notFound')}</div>;
  }

  const isSuspended = (user as User & { isSuspended?: boolean }).isSuspended;

  return (
    <>
      <EntityDetailLayout
        title={user.fullName}
        subtitle={user.email ?? user.phone ?? ''}
        backHref={listHref}
        isEditing={editing}
        isSaving={updateMut.isPending}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() =>
          (document.getElementById('user-form') as HTMLFormElement | null)?.requestSubmit()
        }
        onDelete={() => setConfirmOpen(true)}
      >
        {/* Status badges + secondary actions */}
        <div className="flex flex-wrap items-center gap-2">
          <UserRoleBadge role={user.role} />
          <StatusBadge status={isSuspended ? 'suspended' : 'active'} />
          <div className="flex-1" />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetPassword}
            className="flex items-center gap-2"
          >
            <Lock className="w-4 h-4" />
            {t('admin.userDetail.resetPassword')}
          </Button>
          {isSuspended ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleActivate}
              className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669]"
            >
              <CheckCircle className="w-4 h-4" />
              {t('admin.userDetail.activate')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSuspend}
              className="flex items-center gap-2 text-[#F59E0B] hover:text-[#F59E0B]"
            >
              <Ban className="w-4 h-4" />
              {t('admin.userDetail.suspend')}
            </Button>
          )}
        </div>

        {/* Contact summary */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ContactRow
              icon={<Mail className="w-5 h-5 text-content-muted" />}
              label={t('admin.userDetail.field.email')}
              value={user.email || t('admin.userDetail.field.naValue')}
            />
            <ContactRow
              icon={<Phone className="w-5 h-5 text-content-muted" />}
              label={t('admin.userDetail.field.phone')}
              value={user.phone || t('admin.userDetail.field.naValue')}
            />
            <ContactRow
              icon={<Calendar className="w-5 h-5 text-content-muted" />}
              label={t('admin.users.col.joined')}
              value={formatDate(toDate(user.createdAt) || new Date())}
            />
            <ContactRow
              icon={<Clock className="w-5 h-5 text-content-muted" />}
              label={t('admin.users.col.lastLogin')}
              value={
                user.lastLoginAt
                  ? formatDate(toDate(user.lastLoginAt) || new Date(), {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : t('admin.userDetail.field.neverLogin')
              }
            />
          </div>
        </div>

        <UserTabBar active={activeTab} onChange={setActiveTab} />

        <div className="space-y-6">
          <UserTabContent
            user={user}
            activeTab={activeTab}
            editing={editing}
            onSubmitForm={(data) => updateMut.mutate(data)}
            onRoleChange={handleRoleChange}
          />
        </div>
      </EntityDetailLayout>

      <ConfirmDeleteDialog
        open={confirmOpen}
        entityLabel={t('admin.users.entityLabel')}
        entityName={user.fullName}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(reason) => deleteMut.mutateAsync({ reason })}
      />
    </>
  );
}

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-content-faint">{label}</p>
        <p className="text-sm text-content truncate">{value}</p>
      </div>
    </div>
  );
}

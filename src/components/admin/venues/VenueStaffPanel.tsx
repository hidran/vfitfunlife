'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEntityMutation } from '@/components/admin/useEntityMutation';
import { PersonTypeahead, type PersonOption } from '@/components/admin/PersonTypeahead';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { getUsers } from '@/lib/firebase/admin';
import {
  fetchVenueStaff,
  fetchVenueStaffLink,
  removeVenueStaff,
  setVenueStaff,
  type VenueStaffMember,
} from '@/lib/firebase/venues';

export const venueStaffQueryKey = (venueId: string) => ['admin', 'venueStaff', venueId];

/**
 * The staff of a venue (`venueStaff/{uid}` = { venueId, isActive }): who, besides the owner,
 * may manage its spaces and courses. Admins add an account from a users typeahead, switch its
 * active flag and remove it; every change is written straight to Firestore (the rules allow
 * admin writes) and recorded in audit_logs against the venue. One venue per account: an
 * account already staffing another venue is refused until it is removed there.
 */
export function VenueStaffPanel({ venueId }: { venueId: string }) {
  const { t } = useI18n();
  const queryKey = venueStaffQueryKey(venueId);
  const staff = useQuery({ queryKey, queryFn: () => fetchVenueStaff(venueId) });
  const [error, setError] = useState('');

  const searchUsers = async (query: string): Promise<PersonOption[]> => {
    const { users } = await getUsers({ search: query, status: 'active', limit: 8 });
    return users.map((u) => ({ id: u.id, name: u.fullName || u.email || u.id, subtitle: u.email ?? '', avatarUrl: u.avatarUrl }));
  };

  const addMut = useEntityMutation<PersonOption, void>({
    mutate: async (person) => {
      const existing = await fetchVenueStaffLink(person.id);
      if (existing && existing.venueId !== venueId) {
        throw new Error(t('admin.venues.staff.alreadyElsewhere', { venueId: existing.venueId }));
      }
      await setVenueStaff(person.id, venueId, true);
    },
    audit: (person) => ({
      action: 'update',
      entityType: 'venue',
      entityId: venueId,
      after: { venueStaff: { uid: person.id, venueId, isActive: true } },
      reason: 'venue_staff_added',
    }),
    invalidateKeys: [queryKey],
  });

  const toggleMut = useEntityMutation<VenueStaffMember, void>({
    mutate: (member) => setVenueStaff(member.uid, venueId, !member.isActive),
    audit: (member) => ({
      action: member.isActive ? 'suspend' : 'activate',
      entityType: 'venue',
      entityId: venueId,
      before: { venueStaff: { uid: member.uid, venueId, isActive: member.isActive } },
      after: { venueStaff: { uid: member.uid, venueId, isActive: !member.isActive } },
    }),
    invalidateKeys: [queryKey],
  });

  const removeMut = useEntityMutation<VenueStaffMember, void>({
    mutate: (member) => removeVenueStaff(member.uid),
    audit: (member) => ({
      action: 'update',
      entityType: 'venue',
      entityId: venueId,
      before: { venueStaff: { uid: member.uid, venueId, isActive: member.isActive } },
      reason: 'venue_staff_removed',
    }),
    invalidateKeys: [queryKey],
  });

  const busy = addMut.isPending || toggleMut.isPending || removeMut.isPending;
  const run = (p: Promise<unknown>) => {
    setError('');
    p.catch((err: unknown) => setError(err instanceof Error && err.message ? err.message : t('admin.venues.staff.error')));
  };

  return (
    <section className="m-4 space-y-4 rounded-xl border border-hairline bg-surface p-5">
      <div>
        <h2 className="text-xl font-semibold">{t('admin.venues.staff.title')}</h2>
        <p className="text-sm text-content-muted">{t('admin.venues.staff.hint')}</p>
      </div>

      <PersonTypeahead
        label={t('admin.venues.staff.search')}
        placeholder={t('admin.venues.staff.searchPlaceholder')}
        emptyText={t('admin.venues.staff.noUsersFound')}
        search={searchUsers}
        excludeIds={staff.data?.map((m) => m.uid)}
        queryKey="users"
        onSelect={(person) => run(addMut.mutateAsync(person))}
      />
      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {staff.data && staff.data.length === 0 && (
        <p className="text-sm text-content-muted">{t('admin.venues.staff.empty')}</p>
      )}
      <ul className="divide-y divide-hairline text-sm">
        {staff.data?.map((member) => (
          <li key={member.uid} className="flex flex-wrap items-center gap-3 py-2">
            <Avatar src={member.avatarUrl} name={member.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-content">{member.name}</span>
              <span className="block truncate text-xs text-content-muted">
                {member.email || member.uid} · {t(member.isActive ? 'gym.active' : 'gym.inactive')}
              </span>
            </span>
            <span className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="min-h-[44px]" disabled={busy}
                aria-label={`${t(member.isActive ? 'gym.deactivate' : 'gym.activate')}: ${member.name}`}
                onClick={() => run(toggleMut.mutateAsync(member))}>
                {t(member.isActive ? 'gym.deactivate' : 'gym.activate')}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" disabled={busy}
                aria-label={`${t('common.remove')}: ${member.name}`}
                onClick={() => run(removeMut.mutateAsync(member))}>
                {t('common.remove')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

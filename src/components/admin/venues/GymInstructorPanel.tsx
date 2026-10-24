'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchVenueInstructorLinks, venueCall } from '@/lib/firebase/venueSpaces';
import { getProviders } from '@/lib/firebase/admin';
import { courseErrorMessage } from '@/lib/courseErrors';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/Avatar';
import { PersonTypeahead, type PersonOption } from '@/components/admin/PersonTypeahead';
import type { VenueInstructorLink } from '@/types/venueSpaces';

type PartnerStatus = 'pending' | 'active' | 'suspended';

/**
 * Admin panel linking verified providers to a venue that hosts courses (configureGymInstructor):
 * a typeahead over the verified providers (name search, avatar/name/kind), then the partnership
 * status and active flag; below, the venue's linked instructors with their partnerStatus and an
 * active toggle. Callable errors are translated by courseErrorMessage (gym_not_found,
 * verified_instructor_required, admin_required, ...), never a bare "operation failed".
 */
export function GymInstructorPanel({ venueId }: { venueId: string }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const linksKey = ['gym', 'instructors', venueId];
  const links = useQuery({ queryKey: linksKey, queryFn: () => fetchVenueInstructorLinks(venueId) });
  const [selected, setSelected] = useState<PersonOption | null>(null);
  const [partnerStatus, setPartnerStatus] = useState<PartnerStatus>('pending');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const searchVerified = async (query: string): Promise<PersonOption[]> => {
    const { providers } = await getProviders({ search: query, verificationStatus: 'verified', status: 'active', limit: 8 });
    return providers.map((p) => ({
      id: p.id,
      name: p.fullName || p.email || p.id,
      avatarUrl: p.avatarUrl,
      subtitle: t(p.providerType === 'business' ? 'gym.kind.business' : 'gym.kind.individual'),
    }));
  };

  async function configure(instructorId: string, status: PartnerStatus, active: boolean): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await venueCall('configureGymInstructor', { venueId, instructorId, partnerStatus: status, isActive: active });
      await qc.invalidateQueries({ queryKey: linksKey });
      return true;
    } catch (err) {
      setError(courseErrorMessage(err, t, locale));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (await configure(selected.id, partnerStatus, isActive)) setSelected(null);
  }

  const toggle = (link: VenueInstructorLink) => configure(link.id, link.partnerStatus ?? 'pending', !link.isActive);

  return (
    <section className="m-4 space-y-4 rounded-xl border border-hairline bg-surface p-5">
      <h2 className="text-xl font-semibold">{t('gym.linkInstructor')}</h2>
      <form className="space-y-3" onSubmit={submit}>
        {selected ? (
          <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 p-3 text-sm">
            <Avatar src={selected.avatarUrl} name={selected.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-content-muted">{t('gym.selectedInstructor')}</span>
              <span className="block truncate text-content">{selected.name}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" onClick={() => setSelected(null)}>
              {t('gym.changeInstructor')}
            </Button>
          </div>
        ) : (
          <PersonTypeahead
            label={t('gym.searchInstructor')}
            placeholder={t('gym.searchInstructorPlaceholder')}
            emptyText={t('gym.noInstructorsFound')}
            search={searchVerified}
            excludeIds={links.data?.map((l) => l.id)}
            queryKey="verified-providers"
            onSelect={setSelected}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="block text-xs text-content-muted">{t('gym.partnerStatus')}</span>
            <select className="admin-input min-h-[44px]" value={partnerStatus}
              onChange={(event) => setPartnerStatus(event.target.value as PartnerStatus)}>
              <option value="pending">{t('gym.pending')}</option>
              <option value="active">{t('gym.active')}</option>
              <option value="suspended">{t('gym.suspended')}</option>
            </select>
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm sm:self-end">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            {t('gym.active')}
          </label>
          <Button type="submit" disabled={busy || !selected} isLoading={busy} className="min-h-[44px] sm:self-end">
            {t('gym.linkInstructor')}
          </Button>
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <h3 className="text-sm font-semibold text-content-muted">{t('gym.linkedInstructors')}</h3>
      {links.data && links.data.length === 0 && <p className="text-sm text-content-muted">{t('gym.noLinkedInstructors')}</p>}
      <ul className="divide-y divide-hairline text-sm">
        {links.data?.map((link) => (
          <li key={link.id} className="flex items-center gap-3 py-2">
            <Avatar src={link.photoUrl} name={link.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-content">{link.name || link.id}</span>
              <span className="block text-xs text-content-muted">
                {t('gym.partnerStatus')}: {link.partnerStatus ? t(`gym.${link.partnerStatus}`) : '—'}
                {' · '}
                {t(link.isActive ? 'gym.active' : 'gym.inactive')}
              </span>
            </span>
            <Button type="button" variant="outline" size="sm" className="min-h-[44px]" disabled={busy}
              aria-label={`${t(link.isActive ? 'gym.deactivate' : 'gym.activate')}: ${link.name || link.id}`}
              onClick={() => void toggle(link)}>
              {t(link.isActive ? 'gym.deactivate' : 'gym.activate')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

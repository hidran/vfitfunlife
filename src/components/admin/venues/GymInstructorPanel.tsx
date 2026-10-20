'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchVenueInstructorLinks, venueCall } from '@/lib/firebase/venueSpaces';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';

export function GymInstructorPanel({ venueId }: { venueId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const instructors = useQuery({ queryKey: ['gym', 'instructors', venueId],
    queryFn: () => fetchVenueInstructorLinks(venueId) });
  const [instructorId, setInstructorId] = useState('');
  const [partnerStatus, setPartnerStatus] = useState<'pending' | 'active' | 'suspended'>('pending');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await venueCall('configureGymInstructor', { venueId, instructorId, partnerStatus, isActive });
      setInstructorId(''); await qc.invalidateQueries({ queryKey: ['gym', 'instructors', venueId] }); }
    catch { setError(t('gym.error')); } finally { setBusy(false); }
  }
  return <section className="m-4 space-y-3 rounded-xl border border-hairline bg-surface p-5">
    <h2 className="text-xl font-semibold">{t('gym.linkInstructor')}</h2>
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={submit}>
      <label className="text-sm">{t('gym.instructorId')}<input className="admin-input" required value={instructorId}
        onChange={event => setInstructorId(event.target.value)} /></label>
      <label className="text-sm">{t('gym.partnerStatus')}<select className="admin-input" value={partnerStatus}
        onChange={event => setPartnerStatus(event.target.value as typeof partnerStatus)}>
        <option value="pending">{t('gym.pending')}</option><option value="active">{t('gym.active')}</option>
        <option value="suspended">{t('gym.suspended')}</option></select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive}
        onChange={event => setIsActive(event.target.checked)} />{t('gym.active')}</label>
      <Button type="submit" disabled={busy}>{t('gym.linkInstructor')}</Button>
    </form>
    <ul className="space-y-1 text-sm">{instructors.data?.map(instructor => <li key={instructor.id}>
      {instructor.name} · {instructor.id} · {t(instructor.isActive ? 'gym.active' : 'gym.suspended')}
    </li>)}</ul>
    {error && <p role="alert" className="text-red-500">{error}</p>}
  </section>;
}

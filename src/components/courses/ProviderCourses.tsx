'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useCourses, useManagedVenueCourses, useCourseEnrollments, useVenueEnrollments,
  useCourseRefunds, useVenueRefunds, useRefreshCourses,
} from '@/hooks/useCourses';
import { useManagedVenues } from '@/hooks/useManagedVenues';
import { courseCall } from '@/lib/firebase/courses';
import { courseErrorMessage } from '@/lib/courseErrors';
import { isProviderAreaUser } from '@/lib/providerStatus';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { VenueSpacesPanel } from '@/components/venues/VenueSpacesPanel';
import { courseMoney } from '@/lib/courseFormat';

/** Where a course's participants open: a routed page, not the panel this list used to expand. */
export const rosterHref = (courseId: string, venueId?: string, sessionId?: string) =>
  `/provider/courses/detail?id=${encodeURIComponent(courseId)}${venueId ? `&venue=${encodeURIComponent(venueId)}` : ''}` +
  `${sessionId ? `&lesson=${encodeURIComponent(sessionId)}` : ''}`;

export function ProviderCourses() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const requestedVenue = params.get('venue') || undefined;
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const user = useAuthStore(s => s.user);
  const { venues, isLoading: venuesLoading } = useManagedVenues();
  const providerUser = isProviderAreaUser(user);
  const staff = user?.role === 'admin' || user?.role === 'superadmin';
  // `?venue=` must be one the user owns or staffs (admins may open any). Anything else shows a message and reads nothing.
  const venueUnavailable = !!requestedVenue && !venuesLoading && !staff && !venues.some(v => v.id === requestedVenue);
  const venueId = venueUnavailable || venuesLoading && !staff ? undefined : requestedVenue;
  // Venue scope reads by venueId (owner and staff are allowed by the rules); otherwise the provider's own courses.
  const own = useCourses(requestedVenue ? undefined : uid, !requestedVenue && !!uid);
  const atVenue = useManagedVenueCourses(venueId);
  const ownRefunds = useCourseRefunds(requestedVenue ? undefined : uid);
  const venueRefunds = useVenueRefunds(venueId);
  const refresh = useRefreshCourses();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const query = venueId ? atVenue : own;
  const courses = venueId ? [...(atVenue.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, locale)) :
    own.data?.pages.flatMap(p => p.courses) ?? [];
  const refunds = venueId ? venueRefunds : ownRefunds;
  const pendingRefunds = (refunds.data ?? []).filter(r => r.status !== 'completed');
  // The whole (newest 500) list names the customers of refunds that are still due, and is not read when there are none.
  const ownRefundBookings = useCourseEnrollments(!venueId && pendingRefunds.length ? uid : undefined, true);
  const venueRefundBookings = useVenueEnrollments(pendingRefunds.length ? venueId : undefined);
  const refundBookings = venueId ? venueRefundBookings : ownRefundBookings;
  const venue = venues.find(v => v.id === venueId);
  const field = 'rounded-xl border border-hairline bg-surface text-content p-3 w-full min-h-11';
  const createHref = `/provider/courses/create${venueId ? `?venue=${encodeURIComponent(venueId)}` : ''}`;

  // Someone who only manages a venue has no courses of their own: land on the venue.
  useEffect(() => {
    if (!requestedVenue && user && !providerUser && !venuesLoading && venues.length > 0) router.replace(`/provider/courses?venue=${encodeURIComponent(venues[0].id)}`);
  }, [requestedVenue, user, providerUser, venuesLoading, venues, router]);

  async function run(name: string, data: Record<string, unknown>) {
    setBusy(true); setError(''); setStatus('');
    try { await courseCall(name, data); await refresh(); setStatus(t('common.save')); return true; }
    catch (err) { setError(courseErrorMessage(err, t, locale)); return false; }
    finally { setBusy(false); }
  }
  if (requestedVenue && venuesLoading && !staff) return <p>{t('common.loading')}</p>;
  if (venueUnavailable) return <div className="space-y-3 text-content">
    <p role="alert" className="text-error">{t('courses.venueUnavailable')}</p>
    <Link href="/provider/courses" className="inline-flex min-h-11 items-center underline">{t('courses.manage')}</Link></div>;
  const switchable = venues.length > 1 || (providerUser && venues.length > 0);
  return <div className="space-y-6 text-content">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-2">
        <h1 className="text-2xl font-bold break-words">{venueId ? t('courses.venueScope', { name: venue?.name ?? venueId }) : t('courses.manage')}</h1>
        {switchable && <label className="block text-sm">{t('courses.venue')}
          <select className={`${field} mt-1`} value={venueId ?? ''} onChange={e => router.push(`/provider/courses${e.target.value ? `?venue=${encodeURIComponent(e.target.value)}` : ''}`)}>
            {providerUser && <option value="">{t('courses.manage')}</option>}
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
      </div>
      <Link href={createHref} className="inline-flex min-h-11 items-center rounded-xl bg-section-primary px-4 py-3 text-white font-semibold">{t('courses.create')}</Link></header>
    {error && <p role="alert" className="text-error">{error}</p>}{status && <p role="status">{status}</p>}
    {query.isError && <p role="alert">{t('courses.loadError')}</p>}{query.isLoading && <p>{t('common.loading')}</p>}
    {!query.isLoading && !courses.length && <p>{t('courses.emptyProvider')}</p>}
    <div className="grid md:grid-cols-2 gap-4">{courses.map(c => <article key={c.id} className="rounded-2xl bg-surface border border-hairline p-5 space-y-3">
      <div className="flex justify-between flex-wrap gap-2"><h2 className="text-lg font-semibold">{c.name}</h2><span className="text-sm">{t(`courses.${c.state}`)}</span></div>
      <p className="text-sm text-content-muted">{c.location} · {t('courses.sessions')}: {c.sessionIds.length} · {t('courses.capacity')}: {c.capacity}</p>
      <div className="flex flex-wrap gap-2"><Link href={`/provider/courses/edit?id=${encodeURIComponent(c.id)}${venueId ? `&venue=${encodeURIComponent(venueId)}` : ''}`} className="inline-flex min-h-11 items-center rounded-xl border border-hairline px-3 py-2 text-sm">{t('courses.edit')}</Link>
        <Link href={rosterHref(c.id, venueId)} className="inline-flex min-h-11 items-center rounded-xl bg-section-primary px-3 py-2 text-sm font-semibold text-white">{t('courses.roster')}</Link></div>
    </article>)}</div>
    {!venueId && own.hasNextPage && <Button onClick={() => own.fetchNextPage()}>{t('courses.more')}</Button>}
    {pendingRefunds.length > 0 && <section className="space-y-3"><h2 className="font-semibold text-xl">{t('courses.refunds')}</h2>
      {pendingRefunds.map(r => <div key={r.id} className="rounded-xl border border-hairline p-4 flex flex-wrap gap-3 justify-between">
        <span>{t('courses.refundDue')} · {courseMoney(r.amountCents, locale)} · {(refundBookings.data ?? []).find(e => e.id === r.enrollmentId)?.customerName}</span>
        {r.paymentMode === 'direct' && <Button size="sm" className="min-h-11" disabled={busy} onClick={() => run('confirmCourseRefund', { refundId: r.id })}>{t('courses.confirmRefund')}</Button>}</div>)}
    </section>}
    {venueId && <VenueSpacesPanel venueId={venueId} />}
  </div>;
}

'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/hooks/useI18n';
import { useServiceCategoryLeaves } from '@/hooks/useServiceCategories';
import { useManagedVenues } from '@/hooks/useManagedVenues';
import { useCourseSessions } from '@/hooks/useCourses';
import { useAuthStore } from '@/stores/authStore';
import { saveCourse, previewCourse } from '@/lib/firebase/courses';
import { fetchVenue } from '@/lib/firebase/venues';
import { fetchVenueLocations, fetchVenueRooms } from '@/lib/firebase/venueSpaces';
import { courseErrorMessage } from '@/lib/courseErrors';
import { Button } from '@/components/ui/button';
import { CourseCategoryCombobox } from './CourseCategoryCombobox';
import { InstructorPicker } from './InstructorPicker';
import { hostsCourses } from '@/types/venue';
import type { Course, CourseDraft, CoursePreview } from '@/types/course';
import type { MessageKey } from '@/i18n/messages';
function emptyDraft(): CourseDraft {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return { name: '', description: '', categoryId: '', location: '', city: '', instructor: '', venueId: null,
    locationId: null, roomId: null, instructorId: null, waitlistEnabled: true,
    capacity: 10, durationMinutes: 60, startDate: tomorrow, startTime: '18:00', timezone: 'Europe/Rome',
    recurrence: 'none', interval: 1, weekdays: [1], endDate: tomorrow,
    lessonPriceCents: 1500, seriesPriceCents: null, bookingNoticeHours: 2, cancellationHours: 24,
    level: '', equipment: '', state: 'draft', enrollmentClosed: false };
}
const DEFAULT_TIMEZONE = 'Europe/Rome';
export function CourseEditor({ course, onSaved, onClose, storageKey, initialVenueId }: {
  course?: Course; onSaved: () => void; onClose: () => void; storageKey?: string; initialVenueId?: string;
}) {
  const { t, locale } = useI18n();
  const categories = useServiceCategoryLeaves();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const { venues } = useManagedVenues();
  const form = useRef<HTMLFormElement>(null);
  const zoneId = useId();
  const [draft, setDraft] = useState<CourseDraft>(() => {
    const initial = course ?? emptyDraft();
    let merged = initial;
    try {
      const stored = storageKey && typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null;
      merged = stored ? { ...initial, ...JSON.parse(stored) } : initial;
    } catch { /* Storage may be unavailable. */ }
    return !course && initialVenueId && !merged.venueId ? { ...merged, venueId: initialVenueId } : merged;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<CoursePreview | null>(null);
  const [previewSignature, setPreviewSignature] = useState('');
  const inputClass = 'w-full min-h-11 rounded-xl border border-hairline bg-surface p-3 text-content disabled:opacity-60 read-only:opacity-70';
  const patch = (changes: Partial<CourseDraft>) => setDraft(prev => {
    const next = { ...prev, ...changes };
    try { if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
    return next;
  });
  const set = <K extends keyof CourseDraft>(key: K, value: CourseDraft[K]) => patch({ [key]: value } as Partial<CourseDraft>);
  const signature = JSON.stringify(draft);

  // Venue, location, room: venue-linked courses take place and time zone from the chosen space.
  const sessions = useCourseSessions(course?.id);
  const frozen = !!course && !!sessions.data?.some(s => s.occupied + s.held > 0);
  const courseVenues = venues.filter(v => hostsCourses(v.type));
  const managed = courseVenues.find(v => v.id === draft.venueId);
  // An admin editing someone else's course: the venue is not one of their own.
  const foreign = useQuery({ queryKey: ['venue', draft.venueId], enabled: !!draft.venueId && !managed,
    queryFn: () => fetchVenue(draft.venueId!) });
  const venueOptions = managed || !foreign.data ? courseVenues : [...courseVenues, foreign.data];
  const venueId = draft.venueId;
  const locations = useQuery({ queryKey: ['venueSpaces', venueId, 'locations'], enabled: !!venueId,
    queryFn: () => fetchVenueLocations(venueId!) });
  const rooms = useQuery({ queryKey: ['venueSpaces', venueId, 'rooms', draft.locationId], enabled: !!venueId && !!draft.locationId,
    queryFn: () => fetchVenueRooms(venueId!, draft.locationId!) });
  // The current choice stays listed even if it was switched off since, so an edit does not blank the select.
  const locationOptions = (locations.data ?? []).filter(l => l.isActive || l.id === draft.locationId);
  const roomOptions = (rooms.data ?? []).filter(r => r.isActive || r.id === draft.roomId);
  const activeLocations = (locations.data ?? []).filter(l => l.isActive);
  const activeRooms = (rooms.data ?? []).filter(r => r.isActive);
  const chosenLocation = locations.data?.find(l => l.id === draft.locationId);

  const chooseLocation = (id: string) => {
    const location = locations.data?.find(l => l.id === id);
    patch({ locationId: id || null, roomId: null, timezone: location?.timezone || DEFAULT_TIMEZONE,
      location: location?.name ?? '', city: location?.city ?? '' });
  };
  const chooseRoom = (id: string) => {
    const room = rooms.data?.find(r => r.id === id);
    patch({ roomId: id || null, ...(room && chosenLocation ? { location: `${room.name} · ${chosenLocation.name}` } : {}) });
  };
  useEffect(() => {
    if (frozen || !venueId || draft.locationId || !locations.isSuccess || activeLocations.length !== 1) return;
    chooseLocation(activeLocations[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen, venueId, draft.locationId, locations.isSuccess, activeLocations.length]);
  useEffect(() => {
    if (frozen || !venueId || !draft.locationId || draft.roomId || !rooms.isSuccess || activeRooms.length !== 1) return;
    chooseRoom(activeRooms[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen, venueId, draft.locationId, draft.roomId, rooms.isSuccess, activeRooms.length]);
  function chooseVenue(id: string) {
    if (id === draft.venueId) return;
    patch({ venueId: id || null, locationId: null, roomId: null, instructorId: null, location: '', city: '',
      ...(id ? {} : { timezone: DEFAULT_TIMEZONE, instructor: draft.instructorId ? '' : draft.instructor }) });
  }
  const noSpaces = !!venueId && (locations.isSuccess && !activeLocations.length ||
    !!draft.locationId && rooms.isSuccess && !activeRooms.length);

  async function action(save: boolean) {
    if (!form.current?.reportValidity()) return;
    setBusy(true); setError('');
    try {
      if (save) {
        // Staff and admins author on behalf of the venue's owner; the server ignores this on edit.
        const owner = !course && managed?.ownerId && managed.ownerId !== uid ? managed.ownerId : undefined;
        await saveCourse(draft, course?.id, owner);
        try { if (storageKey) sessionStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
        onSaved();
      }
      else { setPreview(await previewCourse(draft, course?.id)); setPreviewSignature(signature); }
    } catch (err) {
      const mapped = courseErrorMessage(err, t, locale);
      const fields = (err as { details?: { fields?: string[] } })?.details?.fields;
      const labels: Record<string, MessageKey> = { name: 'courses.name', instructor: 'courses.instructor', location: 'courses.location',
        description: 'courses.description', city: 'courses.city', level: 'courses.level', equipment: 'courses.equipment',
        venueId: 'courses.venue', locationId: 'courses.locationSelect', roomId: 'courses.room', instructorId: 'courses.instructorSelect',
        waitlistEnabled: 'courses.waitlist', bookingNoticeHours: 'courses.notice', cancellationHours: 'courses.cancellation',
        state: 'courses.state', enrollmentClosed: 'courses.closed',
        categoryId: 'courses.category', capacity: 'courses.capacity', durationMinutes: 'courses.duration', startDate: 'courses.startDate',
        startTime: 'courses.startTime', timezone: 'courses.timezone', endDate: 'courses.endDate', weekdays: 'courses.weekdays',
        lessonPriceCents: 'courses.lessonPrice', seriesPriceCents: 'courses.seriesPrice', interval: 'courses.interval', recurrence: 'courses.recurrence' };
      const invalidLabels = fields ? [...new Set(fields)].map(f => labels[f] ? t(labels[f]) : '').filter(Boolean) : [];
      // A known code has its own wording; only validation failures fall back to naming the fields.
      setError(mapped !== t('courses.error') ? mapped : invalidLabels.length ? t('courses.invalidFields', { fields: invalidLabels.join(', ') }) : mapped);
    } finally { setBusy(false); }
  }
  const text = (key: 'name' | 'description' | 'location' | 'city' | 'level' | 'equipment' | 'timezone', required = false) =>
    <label key={key} className="space-y-1 text-sm">{t(`courses.${key}`)}<input className={inputClass} required={required} minLength={required ? 2 : undefined} value={draft[key]} onChange={e => set(key, e.target.value)} /></label>;
  const number = (key: 'capacity' | 'durationMinutes' | 'interval' | 'bookingNoticeHours' | 'cancellationHours', label: MessageKey, min: number, max: number) =>
    <label key={key} className="space-y-1 text-sm">{t(label)}<input type="number" className={inputClass} min={min} max={max} required value={draft[key]} onChange={e => set(key, Number(e.target.value))} /></label>;
  const conflicts = preview && previewSignature === signature ? preview.conflicts ?? [] : [];
  const when = (startsAt: string, endsAt: string) => {
    const zone = { timeZone: draft.timezone };
    const start = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', ...zone }).format(new Date(startsAt));
    return `${start} – ${new Intl.DateTimeFormat(locale, { timeStyle: 'short', ...zone }).format(new Date(endsAt))}`;
  };
  return <form ref={form} className="p-5 space-y-5 text-content" onSubmit={e => { e.preventDefault(); action(true); }}>
    <div className="flex justify-between gap-2"><h2 className="text-2xl font-bold">{t(course ? 'courses.edit' : 'courses.create')}</h2><Button variant="ghost" type="button" onClick={onClose}>{t('common.close')}</Button></div>
    {course && <p className="text-sm text-content-muted">{t('courses.locked')}</p>}
    <div className="grid sm:grid-cols-2 gap-4">
      {text('name', true)}
      {(venueOptions.length > 0 || !!venueId) && <fieldset className="sm:col-span-2 grid sm:grid-cols-3 gap-4" disabled={frozen}>
        <label className="space-y-1 text-sm">{t('courses.venue')}<select className={inputClass} value={venueId ?? ''} onChange={e => chooseVenue(e.target.value)}>
          <option value="">{t('courses.noVenue')}</option>
          {venueOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          {venueId && !venueOptions.some(v => v.id === venueId) && <option value={venueId}>{venueId}</option>}</select></label>
        {venueId && <>
          <label className="space-y-1 text-sm">{t('courses.locationSelect')}<select className={inputClass} required value={draft.locationId ?? ''} onChange={e => chooseLocation(e.target.value)}>
            <option value="">{t('common.select')}</option>
            {locationOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="space-y-1 text-sm">{t('courses.room')}<select className={inputClass} required value={draft.roomId ?? ''} disabled={!draft.locationId} onChange={e => chooseRoom(e.target.value)}>
            <option value="">{t('common.select')}</option>
            {roomOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          {noSpaces && <p className="sm:col-span-3 text-sm"><Link className="font-semibold text-section-ink underline-offset-4 hover:underline"
            href={`/provider/courses?venue=${encodeURIComponent(venueId)}#spaces`}>{t('courses.addSpaces')}</Link></p>}
        </>}
      </fieldset>}
      <div className="sm:col-span-2"><InstructorPicker venueId={venueId} disabled={frozen}
        value={{ instructorId: draft.instructorId, name: draft.instructor }}
        onChange={({ instructorId, name }) => patch({ instructorId, instructor: name })} /></div>
      {text('description')}
      {!venueId && <>{text('location', true)}{text('city')}</>}
      <CourseCategoryCombobox categories={categories} locale={locale} label={t('courses.category')} placeholder={t('common.select')}
        value={draft.categoryId} onChange={id => set('categoryId', id)} />
      {number('capacity', 'courses.capacity', 1, 500)}{number('durationMinutes', 'courses.duration', 10, 480)}
      <label className="space-y-1 text-sm">{t('courses.startDate')}<input required type="date" className={inputClass} value={draft.startDate} onChange={e => set('startDate', e.target.value)} /></label>
      <label className="space-y-1 text-sm">{t('courses.startTime')}<input required type="time" className={inputClass} value={draft.startTime} onChange={e => set('startTime', e.target.value)} /></label>
      {venueId ? <div className="space-y-1 text-sm"><label htmlFor={zoneId}>{t('courses.timezone')}</label>
        <input id={zoneId} className={inputClass} readOnly aria-describedby={`${zoneId}-hint`} value={draft.timezone} />
        <span id={`${zoneId}-hint`} className="block text-content-muted text-xs">{t('courses.timezoneFromLocation')}</span></div> : text('timezone', true)}
      <label className="space-y-1 text-sm">{t('courses.recurrence')}<select className={inputClass} value={draft.recurrence} onChange={e => set('recurrence', e.target.value as CourseDraft['recurrence'])}>
        {(['none', 'daily', 'weekly'] as const).map(v => <option key={v} value={v}>{t(`courses.${v}`)}</option>)}</select></label>
      {draft.recurrence !== 'none' && <>{number('interval', 'courses.interval', 1, 12)}
        <label className="space-y-1 text-sm">{t('courses.endDate')}<input required type="date" className={inputClass} min={draft.startDate} value={draft.endDate} onChange={e => set('endDate', e.target.value)} /></label></>}
      {draft.recurrence === 'weekly' && <fieldset className="sm:col-span-2 flex flex-wrap gap-3"><legend className="text-sm mb-2">{t('courses.weekdays')}</legend>
        {[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day} className="flex gap-2 items-center min-h-11"><input type="checkbox" className="h-5 w-5" checked={draft.weekdays.includes(day)}
          onChange={e => set('weekdays', e.target.checked ? [...draft.weekdays, day] : draft.weekdays.filter(d => d !== day))} />
          {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 4 + day)))}</label>)}</fieldset>}
      {(['lessonPriceCents', 'seriesPriceCents'] as const).map(key => <label key={key} className="space-y-1 text-sm">{t(key === 'lessonPriceCents' ? 'courses.lessonPrice' : 'courses.seriesPrice')}
        <input type="number" min="0" max="100000" step="0.01" className={inputClass} value={draft[key] === null ? '' : draft[key]! / 100}
          onChange={e => set(key, e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))} />
        <span className="block text-content-muted text-xs">{draft[key] === 0 ? t('courses.free') : t('courses.priceHint')}</span></label>)}
      {number('bookingNoticeHours', 'courses.notice', 0, 720)}{number('cancellationHours', 'courses.cancellation', 0, 720)}
      {text('level')}{text('equipment')}
      <label className="space-y-1 text-sm">{t('courses.state')}<select className={inputClass} value={draft.state} onChange={e => set('state', e.target.value as CourseDraft['state'])}>
        {(['draft', 'published', 'archived'] as const).map(v => <option key={v} value={v}>{t(`courses.${v}`)}</option>)}</select></label>
      <label className="flex gap-2 items-center min-h-11"><input type="checkbox" className="h-5 w-5" checked={draft.enrollmentClosed} onChange={e => set('enrollmentClosed', e.target.checked)} />{t('courses.closed')}</label>
      <label className="flex gap-2 items-center min-h-11"><input type="checkbox" className="h-5 w-5" checked={draft.waitlistEnabled} onChange={e => set('waitlistEnabled', e.target.checked)} />{t('courses.waitlist')}</label>
    </div>
    <p className="text-sm text-content-muted">{t('courses.previewHint')}</p>
    <Button type="button" variant="outline" disabled={busy} onClick={() => action(false)}>{t('courses.preview')}</Button>
    {preview && preview.sessions.length > 0 && previewSignature === signature && <ol className="text-sm space-y-1 max-h-48 overflow-auto">{preview.sessions.map((s, i) => <li key={s.id ?? i}>
      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: draft.timezone }).format(new Date(s.startsAt))}
      {conflicts.filter(c => c.sessionId === s.id).map(c => <p key={`${c.kind}-${c.startsAt}`} role="alert" className="text-error">
        {t(c.kind === 'room' ? 'courses.room' : 'courses.instructor')}: {t('courses.conflict', { name: c.courseName, time: when(c.startsAt, c.endsAt) })}</p>)}</li>)}</ol>}
    {error && <p className="text-error" role="alert">{error}</p>}
    <div><Button type="submit" disabled={busy || (draft.state === 'published' && previewSignature !== signature)}>{busy ? t('common.loading') : t('courses.save')}</Button></div>
  </form>;
}

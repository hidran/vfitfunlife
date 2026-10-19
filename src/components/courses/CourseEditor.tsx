'use client';
import { useRef, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useServiceCategoryLeaves } from '@/hooks/useServiceCategories';
import { saveCourse, courseCall } from '@/lib/firebase/courses';
import { Button } from '@/components/ui/button';
import { CourseCategoryCombobox } from './CourseCategoryCombobox';
import type { Course, CourseDraft } from '@/types/course';
import type { MessageKey } from '@/i18n/messages';
function emptyDraft(): CourseDraft {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return { name: '', description: '', categoryId: '', location: '', city: '', instructor: '', venueId: null,
    capacity: 10, durationMinutes: 60, startDate: tomorrow, startTime: '18:00', timezone: 'Europe/Rome',
    recurrence: 'none', interval: 1, weekdays: [1], endDate: tomorrow,
    lessonPriceCents: 1500, seriesPriceCents: null, bookingNoticeHours: 2, cancellationHours: 24,
    level: '', equipment: '', state: 'draft', enrollmentClosed: false };
}
export function CourseEditor({ course, onSaved, onClose, storageKey }: { course?: Course; onSaved: () => void; onClose: () => void; storageKey?: string }) {
  const { t, locale } = useI18n();
  const categories = useServiceCategoryLeaves();
  const form = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<CourseDraft>(() => {
    const initial = course ?? emptyDraft();
    try {
      const stored = storageKey && typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null;
      return stored ? { ...initial, ...JSON.parse(stored) } : initial;
    } catch { return initial; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ startsAt: string }[]>([]);
  const [previewSignature, setPreviewSignature] = useState('');
  const inputClass = 'w-full rounded-xl border border-hairline bg-surface p-3 text-content';
  const set = <K extends keyof CourseDraft>(key: K, value: CourseDraft[K]) => setDraft(prev => {
    const next = { ...prev, [key]: value };
    try { if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
    return next;
  });
  const signature = JSON.stringify(draft);
  async function action(save: boolean) {
    if (!form.current?.reportValidity()) return;
    setBusy(true); setError('');
    try {
      if (save) {
        await saveCourse(draft, course?.id);
        try { if (storageKey) sessionStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
        onSaved();
      }
      else { const result = await courseCall<{ sessions: { startsAt: string }[] }>('previewCourse', { course: draft }); setPreview(result.sessions); setPreviewSignature(signature); }
    } catch (err) {
      const fields = (err as { details?: { fields?: string[] } })?.details?.fields;
      const labels: Record<string, MessageKey> = { name: 'courses.name', instructor: 'courses.instructor', location: 'courses.location',
        description: 'courses.description', city: 'courses.city', level: 'courses.level', equipment: 'courses.equipment',
        venueId: 'courses.location', bookingNoticeHours: 'courses.notice', cancellationHours: 'courses.cancellation',
        state: 'courses.state', enrollmentClosed: 'courses.closed',
        categoryId: 'courses.category', capacity: 'courses.capacity', durationMinutes: 'courses.duration', startDate: 'courses.startDate',
        startTime: 'courses.startTime', timezone: 'courses.timezone', endDate: 'courses.endDate', weekdays: 'courses.weekdays',
        lessonPriceCents: 'courses.lessonPrice', seriesPriceCents: 'courses.seriesPrice', interval: 'courses.interval', recurrence: 'courses.recurrence' };
      const invalidLabels = fields ? [...new Set(fields)].map(f => labels[f] ? t(labels[f]) : '').filter(Boolean) : [];
      setError(invalidLabels.length ? t('courses.invalidFields', { fields: invalidLabels.join(', ') }) : t('courses.error'));
    } finally { setBusy(false); }
  }
  const text = (key: 'name' | 'description' | 'location' | 'city' | 'instructor' | 'level' | 'equipment' | 'timezone', required = false) =>
    <label key={key} className="space-y-1 text-sm">{t(`courses.${key}`)}<input className={inputClass} required={required} minLength={required ? 2 : undefined} value={draft[key]} onChange={e => set(key, e.target.value)} /></label>;
  const number = (key: 'capacity' | 'durationMinutes' | 'interval' | 'bookingNoticeHours' | 'cancellationHours', label: MessageKey, min: number, max: number) =>
    <label key={key} className="space-y-1 text-sm">{t(label)}<input type="number" className={inputClass} min={min} max={max} required value={draft[key]} onChange={e => set(key, Number(e.target.value))} /></label>;
  return <form ref={form} className="p-5 space-y-5 text-content" onSubmit={e => { e.preventDefault(); action(true); }}>
    <div className="flex justify-between gap-2"><h2 className="text-2xl font-bold">{t(course ? 'courses.edit' : 'courses.create')}</h2><Button variant="ghost" type="button" onClick={onClose}>{t('common.close')}</Button></div>
    {course && <p className="text-sm text-content-muted">{t('courses.locked')}</p>}
    <div className="grid sm:grid-cols-2 gap-4">
      {text('name', true)}{text('instructor', true)}{text('description')}{text('location', true)}{text('city')}
      <CourseCategoryCombobox categories={categories} locale={locale} label={t('courses.category')} placeholder={t('common.select')}
        value={draft.categoryId} onChange={id => set('categoryId', id)} />
      {number('capacity', 'courses.capacity', 1, 500)}{number('durationMinutes', 'courses.duration', 10, 480)}
      <label className="space-y-1 text-sm">{t('courses.startDate')}<input required type="date" className={inputClass} value={draft.startDate} onChange={e => set('startDate', e.target.value)} /></label>
      <label className="space-y-1 text-sm">{t('courses.startTime')}<input required type="time" className={inputClass} value={draft.startTime} onChange={e => set('startTime', e.target.value)} /></label>
      {text('timezone', true)}
      <label className="space-y-1 text-sm">{t('courses.recurrence')}<select className={inputClass} value={draft.recurrence} onChange={e => set('recurrence', e.target.value as CourseDraft['recurrence'])}>
        {(['none', 'daily', 'weekly'] as const).map(v => <option key={v} value={v}>{t(`courses.${v}`)}</option>)}</select></label>
      {draft.recurrence !== 'none' && <>{number('interval', 'courses.interval', 1, 12)}
        <label className="space-y-1 text-sm">{t('courses.endDate')}<input required type="date" className={inputClass} min={draft.startDate} value={draft.endDate} onChange={e => set('endDate', e.target.value)} /></label></>}
      {draft.recurrence === 'weekly' && <fieldset className="sm:col-span-2 flex flex-wrap gap-3"><legend className="text-sm mb-2">{t('courses.weekdays')}</legend>
        {[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day} className="flex gap-2 items-center"><input type="checkbox" checked={draft.weekdays.includes(day)}
          onChange={e => set('weekdays', e.target.checked ? [...draft.weekdays, day] : draft.weekdays.filter(d => d !== day))} />
          {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 4 + day)))}</label>)}</fieldset>}
      {(['lessonPriceCents', 'seriesPriceCents'] as const).map(key => <label key={key} className="space-y-1 text-sm">{t(key === 'lessonPriceCents' ? 'courses.lessonPrice' : 'courses.seriesPrice')}
        <input type="number" min="1" max="100000" step="0.01" className={inputClass} value={draft[key] === null ? '' : draft[key]! / 100}
          onChange={e => set(key, e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))} /><span className="text-content-muted text-xs">{t('courses.priceHint')}</span></label>)}
      {number('bookingNoticeHours', 'courses.notice', 0, 720)}{number('cancellationHours', 'courses.cancellation', 0, 720)}
      {text('level')}{text('equipment')}
      <label className="space-y-1 text-sm">{t('courses.state')}<select className={inputClass} value={draft.state} onChange={e => set('state', e.target.value as CourseDraft['state'])}>
        {(['draft', 'published', 'archived'] as const).map(v => <option key={v} value={v}>{t(`courses.${v}`)}</option>)}</select></label>
      <label className="flex gap-2 items-center"><input type="checkbox" checked={draft.enrollmentClosed} onChange={e => set('enrollmentClosed', e.target.checked)} />{t('courses.closed')}</label>
    </div>
    <p className="text-sm text-content-muted">{t('courses.previewHint')}</p>
    <Button type="button" variant="outline" disabled={busy} onClick={() => action(false)}>{t('courses.preview')}</Button>
    {preview.length > 0 && previewSignature === signature && <ol className="text-sm space-y-1 max-h-48 overflow-auto">{preview.map((s, i) => <li key={i}>
      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: draft.timezone }).format(new Date(s.startsAt))}</li>)}</ol>}
    {error && <p className="text-red-500" role="alert">{error}</p>}
    <div><Button type="submit" disabled={busy || (draft.state === 'published' && previewSignature !== signature)}>{busy ? t('common.loading') : t('courses.save')}</Button></div>
  </form>;
}

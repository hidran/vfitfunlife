'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { getProviderClients } from '@/lib/firebase/provider';
import { createClientAccount } from '@/lib/firebase/functions';
import { courseCall } from '@/lib/firebase/courses';
import { Button } from '@/components/ui/button';
import { CourseCategoryCombobox } from './CourseCategoryCombobox';
import { ParticipantInvitation } from './ParticipantInvitation';
import type { Course, CourseSession } from '@/types/course';

export function AddCourseParticipant({ course, session, onAdded }: { course: Course; session: CourseSession; onAdded: () => void }) {
  const { t, locale } = useI18n();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const cache = useQueryClient();
  const clients = useQuery({ queryKey: ['provider-clients', uid], queryFn: getProviderClients, enabled: !!uid });
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState('');
  const [fullName, setFullName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [scope, setScope] = useState(course.lessonPriceCents === null ? 'series' : 'lesson');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');
  const requestId = useRef<string | null>(null);
  const field = 'w-full rounded-xl border border-hairline bg-surface p-3 text-content';
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setAdded('');
    try {
      let userId = selected;
      if (creating && !userId) {
        const created = await createClientAccount({ fullName: [fullName.trim(), lastName.trim()].filter(Boolean).join(' '),
          email: email.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), notifyByEmail: false });
        userId = created.client.userId; setSelected(userId);
        await cache.invalidateQueries({ queryKey: ['provider-clients'] });
      }
      if (!userId) return;
      requestId.current ??= crypto.randomUUID();
      await courseCall('enrollCourseParticipant', { courseId: course.id, userId, scope,
        ...(scope === 'lesson' ? { sessionId: session.id } : {}), requestId: requestId.current });
      setAdded(userId); setSelected(''); setCreating(false); requestId.current = null;
      setFullName(''); setLastName(''); setEmail(''); setPhone(''); onAdded();
    } catch (err) {
      const message = (err as { message?: string })?.message;
      const errors: Record<string, Parameters<typeof t>[0]> = { lesson_full: 'courses.full', already_enrolled: 'courses.alreadyParticipant',
        invalid_name: 'provider.addClient.error.invalidName', invalid_phone: 'provider.addClient.error.invalidPhone',
        invalid_email: 'provider.addClient.error.invalidEmail', rate_limited: 'provider.addClient.error.rateLimited' };
      setError(t(errors[message ?? ''] ?? 'courses.error'));
    } finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-hairline p-4 space-y-4">
    <h3 className="font-semibold">{t('courses.addParticipant')}</h3>
    <p className="text-sm text-content-muted">{t('courses.linkedClientsHint')}</p>
    <form onSubmit={submit}><fieldset disabled={busy} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={creating ? 'outline' : 'primary'} disabled={busy}
          onClick={() => { setCreating(false); setSelected(''); requestId.current = null; }}>{t('courses.existingParticipant')}</Button>
        <Button type="button" size="sm" variant={creating ? 'primary' : 'outline'} disabled={busy}
          onClick={() => { setCreating(true); setSelected(''); requestId.current = null; }}>{t('courses.newParticipant')}</Button>
      </div>
      {!creating ? <>
        {clients.isLoading && <p>{t('common.loading')}</p>}
        {clients.isError && <p role="alert">{t('courses.loadError')}</p>}
        <CourseCategoryCombobox categories={(clients.data ?? []).map(c => ({ id: c.userId, name: `${c.name} · ${c.email}` }))}
          locale={locale} value={selected} onChange={value => { setSelected(value); requestId.current = null; }}
          label={t('courses.participant')} placeholder={t('common.select')} />
      </> : <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">{t('courses.participantName')}<input className={field} required minLength={2} maxLength={80} value={fullName} onChange={e => { setFullName(e.target.value); setSelected(''); requestId.current = null; }} /></label>
        <label className="space-y-1 text-sm">{t('courses.participantLastName')}<input className={field} maxLength={80} value={lastName} onChange={e => { setLastName(e.target.value); setSelected(''); requestId.current = null; }} /></label>
        <label className="space-y-1 text-sm">{t('courses.participantEmail')}<input type="email" required className={field} value={email} onChange={e => { setEmail(e.target.value); setSelected(''); requestId.current = null; }} /></label>
        <label className="space-y-1 text-sm">{t('courses.participantPhone')}<input type="tel" className={field} placeholder="+39…" value={phone} onChange={e => { setPhone(e.target.value); setSelected(''); requestId.current = null; }} /></label>
      </div>}
      <label className="block space-y-1 text-sm">{t('courses.reservationType')}<select className={field} value={scope} disabled={busy}
        onChange={e => { setScope(e.target.value); requestId.current = null; }}>
        {course.lessonPriceCents !== null && <option value="lesson">{t('courses.lesson')}</option>}
        {course.seriesPriceCents !== null && <option value="series">{t('courses.series')}</option>}
      </select></label>
      <p className="text-sm">{t('courses.direct')}</p>
      <Button type="submit" disabled={busy || (!creating && !selected)}>{t('courses.addParticipant')}</Button>
    </fieldset></form>
    {error && <p role="alert">{error}</p>}
    {added && <div className="space-y-3"><p role="status">{t('courses.participantAdded')}</p><ParticipantInvitation userId={added} /></div>}
  </section>;
}

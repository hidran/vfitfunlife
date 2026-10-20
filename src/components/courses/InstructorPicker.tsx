'use client';
import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchVenueInstructorLinks } from '@/lib/firebase/venueSpaces';
import { searchProviders } from '@/lib/firebookings';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';

export type InstructorValue = { instructorId: string | null; name: string };

const OTHER = '__other';
const SEARCH_DELAY_MS = 300;
const inputClass = 'w-full min-h-11 rounded-xl border border-hairline bg-surface p-3 text-content disabled:opacity-60';

/**
 * Who teaches. A venue-linked course (or a substituted lesson) picks from the venue's active instructor links, plus
 * "other" with a typed name when authoring a course. An unlinked course is the provider's own: a typed name, optionally
 * linked to the provider's own profile; only an admin may link anyone (the server rejects other ids with
 * `course_instructor_not_allowed`). `mode="substitute"` always needs a registered instructor, so it never offers free text.
 */
export function InstructorPicker({ venueId, value, onChange, mode = 'course', disabled = false, currentInstructorId }: {
  venueId: string | null; value: InstructorValue; onChange: (value: InstructorValue) => void;
  mode?: 'course' | 'substitute'; disabled?: boolean; currentInstructorId?: string | null;
}) {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const selectId = useId();
  const nameId = useId();
  const searchId = useId();
  const [other, setOther] = useState(!value.instructorId && !!value.name);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const links = useQuery({ queryKey: ['venueSpaces', venueId, 'instructors'], enabled: !!venueId,
    queryFn: () => fetchVenueInstructorLinks(venueId!) });
  const found = useQuery({ queryKey: ['instructorSearch', debounced], enabled: !venueId && isAdmin && debounced.length >= 2,
    queryFn: () => searchProviders({ query: debounced }) });

  const nameField = (readOnly: boolean) => (
    <label htmlFor={nameId} className="block space-y-1 text-sm">{t('courses.instructor')}
      <input id={nameId} className={inputClass} required minLength={2} readOnly={readOnly} disabled={disabled}
        value={value.name} onChange={(e) => onChange({ instructorId: null, name: e.target.value })} /></label>
  );

  if (venueId) {
    const active = (links.data ?? []).filter((l) => l.isActive && l.id !== currentInstructorId);
    // A course keeps an instructor whose link was switched off since: show them instead of an empty select.
    const orphan = value.instructorId && !active.some((l) => l.id === value.instructorId) ?
      { id: value.instructorId, name: value.name } : null;
    const selected = value.instructorId ?? (other && mode === 'course' ? OTHER : '');
    return <div className="space-y-3">
      <label htmlFor={selectId} className="block space-y-1 text-sm">{t('courses.instructorSelect')}
        <select id={selectId} className={inputClass} required disabled={disabled} value={selected} onChange={(e) => {
          const next = e.target.value;
          if (next === OTHER) { setOther(true); onChange({ instructorId: null, name: value.instructorId ? '' : value.name }); return; }
          setOther(false);
          const link = active.find((l) => l.id === next);
          onChange(link ? { instructorId: link.id, name: link.name } : { instructorId: null, name: '' });
        }}>
          <option value="">{t('common.select')}</option>
          {orphan && <option value={orphan.id}>{orphan.name}</option>}
          {active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          {mode === 'course' && <option value={OTHER}>{t('courses.instructorOther')}</option>}
        </select></label>
      {mode === 'course' && other && !value.instructorId && nameField(disabled)}
    </div>;
  }

  if (mode === 'substitute') {
    if (!isAdmin) {
      return <label htmlFor={selectId} className="block space-y-1 text-sm">{t('courses.instructorSelect')}
        <select id={selectId} className={inputClass} required disabled={disabled} value={value.instructorId ?? ''}
          onChange={(e) => onChange(e.target.value && user ? { instructorId: user.uid, name: user.fullName } : { instructorId: null, name: '' })}>
          <option value="">{t('common.select')}</option>
          {user && user.uid !== currentInstructorId && <option value={user.uid}>{user.fullName}</option>}
        </select></label>;
    }
  }

  const linked = !!value.instructorId;
  return <div className="space-y-3">
    {mode === 'course' && nameField(linked || disabled)}
    {isAdmin ? <div className="space-y-2">
      {linked ? <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 break-words font-medium">{value.name}</span>
        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={disabled}
          onClick={() => onChange({ instructorId: null, name: mode === 'course' ? value.name : '' })}>{t('common.remove')}</Button>
      </div> : <>
        <label htmlFor={searchId} className="block space-y-1 text-sm">{t('courses.linkInstructor')}
          <input id={searchId} className={inputClass} autoComplete="off" disabled={disabled} value={term}
            onChange={(e) => setTerm(e.target.value)} /></label>
        {!!found.data?.length && <ul className="space-y-1">{found.data.map((p) => <li key={p.id}>
          <button type="button" className="min-h-11 w-full rounded-xl border border-hairline px-3 text-left hover:bg-surface-2"
            onClick={() => { onChange({ instructorId: p.id, name: p.fullName }); setTerm(''); }}>{p.fullName}</button>
        </li>)}</ul>}
      </>}
    </div> : mode === 'course' && user && <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" className="h-5 w-5" disabled={disabled} checked={value.instructorId === user.uid}
        onChange={(e) => onChange(e.target.checked ? { instructorId: user.uid, name: value.name || user.fullName } :
          { instructorId: null, name: value.name })} />
      {t('courses.linkMyself')}</label>}
  </div>;
}

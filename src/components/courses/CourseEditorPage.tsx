'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchCourse } from '@/lib/firebase/courses';
import { useAuthStore } from '@/stores/authStore';
import { useRefreshCourses } from '@/hooks/useCourses';
import { useI18n } from '@/hooks/useI18n';
import { useManagedVenues } from '@/hooks/useManagedVenues';
import { CourseEditor } from './CourseEditor';
export function CourseEditorPage({ editing = false }: { editing?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const { t } = useI18n();
  const refresh = useRefreshCourses();
  const { venues, isLoading: venuesLoading } = useManagedVenues();
  // `?venue=` pre-selects a venue the user manages; the editor reads it once at mount, so wait for the lookup.
  const wanted = params.get('venue') ?? '';
  const initialVenueId = venues.some(v => v.id === wanted) ? wanted : undefined;
  const id = editing ? params.get('id') ?? '' : '';
  const course = useQuery({ queryKey: ['courses', 'editor', id], queryFn: () => fetchCourse(id), enabled: editing && !!id && !!uid });
  const coursesHref = wanted ? `/provider/courses?venue=${wanted}` : '/provider/courses';
  if (!uid || venuesLoading || (editing && course.isLoading)) return <p>{t('common.loading')}</p>;
  if (editing && (!id || course.isError || !course.data)) return <p role="alert">{t('courses.loadError')}</p>;
  return <div className="mx-auto max-w-3xl rounded-2xl border border-hairline bg-surface">
    <CourseEditor key={`${uid}-${id}`} course={editing ? course.data ?? undefined : undefined}
      storageKey={`vfit.course-draft.${uid}.${id || 'new'}`} initialVenueId={initialVenueId}
      onClose={() => router.push(coursesHref)}
      onSaved={() => { void refresh(); router.push(coursesHref); }} />
  </div>;
}

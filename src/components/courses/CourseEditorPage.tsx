'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchCourse } from '@/lib/firebase/courses';
import { useAuthStore } from '@/stores/authStore';
import { useRefreshCourses } from '@/hooks/useCourses';
import { useI18n } from '@/hooks/useI18n';
import { CourseEditor } from './CourseEditor';
export function CourseEditorPage({ editing = false }: { editing?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const { t } = useI18n();
  const refresh = useRefreshCourses();
  const id = editing ? params.get('id') ?? '' : '';
  const course = useQuery({ queryKey: ['courses', 'editor', id], queryFn: () => fetchCourse(id), enabled: editing && !!id && !!uid });
  if (!uid || (editing && course.isLoading)) return <p>{t('common.loading')}</p>;
  if (editing && (!id || course.isError || !course.data)) return <p role="alert">{t('courses.loadError')}</p>;
  return <div className="mx-auto max-w-3xl rounded-2xl border border-hairline bg-surface">
    <CourseEditor key={`${uid}-${id}`} course={editing ? course.data ?? undefined : undefined}
      storageKey={`vfit.course-draft.${uid}.${id || 'new'}`} onClose={() => router.push('/provider/courses')}
      onSaved={() => { void refresh(); router.push('/provider/courses'); }} />
  </div>;
}

'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchCourse } from '@/lib/firebase/courses';
import { useCourseSessions } from '@/hooks/useCourses';
import { usePaymentSettings } from '@/hooks/usePaymentSettings';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { CourseBooking } from './CourseBooking';

/**
 * One course and its booking, addressed as
 * `/courses/detail?id=<courseId>&lesson=<sessionId>`. A dedicated page instead of the sheet the list used to open:
 * the address can be shared, reloaded and opened from a notification, and the browser's back button closes it.
 */
export function CourseDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const lesson = params.get('lesson') ?? '';
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const payments = usePaymentSettings();
  const course = useQuery({ queryKey: ['courses', 'detail', id], queryFn: () => fetchCourse(id), enabled: !!id });
  const sessions = useCourseSessions(id || undefined);
  if (!id || course.isError) return <p role="alert">{t('courses.loadError')}</p>;
  if (course.isLoading) return <p>{t('common.loading')}</p>;
  if (!course.data) return <div className="mx-auto max-w-2xl space-y-3 p-4 md:p-8">
    <p role="alert">{t('courses.loadError')}</p>
    <Link href="/courses" className="inline-flex min-h-11 items-center underline">{t('courses.back')}</Link></div>;
  const selected = course.data;
  return <div className="mx-auto max-w-2xl space-y-5 p-4 md:p-8 pb-24 text-content">
    <Link href="/courses" className="inline-flex min-h-11 items-center underline">{t('courses.back')}</Link>
    <header className="space-y-2">
      <h1 className="text-2xl sm:text-3xl font-display font-bold break-words">{selected.name}</h1>
      <p className="text-sm text-content-muted">{selected.providerName} · {selected.level}</p>
      <p className="text-sm">{selected.location}</p>
    </header>
    {selected.description && <p className="whitespace-pre-line">{selected.description}</p>}
    {selected.equipment && <p className="text-sm text-content-muted">{selected.equipment}</p>}
    {sessions.isLoading ? <p>{t('common.loading')}</p> : sessions.isError ? <p role="alert">{t('courses.loadError')}</p> :
      <CourseBooking course={selected} sessions={sessions.data ?? []}
        checkoutEnabled={payments.courseCheckoutEnabled && !payments.isLoading} uid={uid}
        initialSessionId={lesson || undefined}
        onBooked={() => router.push('/courses?tab=bookings&booked=1')} />}
  </div>;
}

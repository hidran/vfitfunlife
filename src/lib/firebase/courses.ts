import { collection, getDocs, query, where, orderBy, limit, doc, getDoc, startAfter, type QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db } from './config';
import { getFunctionsInstance } from './app';
import type { Course, CourseDraft, CourseSession, CourseEnrollment, CourseParticipant, CourseRefund, CourseQuote } from '@/types/course';
export async function courseCall<T = { success: boolean }>(name: string, data: Record<string, unknown>): Promise<T> {
  const result = await httpsCallable<Record<string, unknown>, T>(await getFunctionsInstance(), name)(data);
  return result.data;
}
export async function fetchCourses(providerId?: string, after?: QueryDocumentSnapshot) {
  const constraints = providerId ? [where('providerId', '==', providerId)] :
    [where('state', '==', 'published'), where('providerEligible', '==', true), where('nextStartsAt', '>', Timestamp.now()), orderBy('nextStartsAt', 'asc')];
  const snap = await getDocs(query(collection(db, 'courses'), ...constraints, ...(after ? [startAfter(after)] : []), limit(50)));
  return { courses: snap.docs.map(d => ({ id: d.id, ...d.data() }) as Course),
    cursor: snap.docs.length === 50 ? snap.docs[snap.docs.length - 1] : undefined };
}
export async function fetchCourse(id: string): Promise<Course | null> {
  const snap = await getDoc(doc(db, 'courses', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Course : null;
}
export async function fetchCourseSessions(courseId: string): Promise<CourseSession[]> {
  const snap = await getDocs(query(collection(db, 'courses', courseId, 'sessions'), orderBy('startsAt')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseSession);
}
export async function fetchCourseEnrollments(uid: string, provider = false): Promise<CourseEnrollment[]> {
  const snap = await getDocs(query(collection(db, 'courseEnrollments'), where(provider ? 'providerId' : 'userId', '==', uid), limit(500)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseEnrollment)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}
export async function fetchCourseParticipants(courseId: string, sessionId: string): Promise<CourseParticipant[]> {
  const snap = await getDocs(collection(db, 'courses', courseId, 'sessions', sessionId, 'participants'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseParticipant);
}
export async function fetchCourseRefunds(uid: string): Promise<CourseRefund[]> {
  const snap = await getDocs(query(collection(db, 'courseRefunds'), where('providerId', '==', uid), limit(500)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseRefund);
}
export const saveCourse = (course: CourseDraft, courseId?: string) =>
  courseCall<{ courseId: string }>('saveCourse', { course, ...(courseId ? { courseId } : {}) });
export const quoteCourse = (courseId: string, sessionIds?: string[]) =>
  courseCall<CourseQuote>('quoteCourse', { courseId, ...(sessionIds ? { sessionIds } : {}) });

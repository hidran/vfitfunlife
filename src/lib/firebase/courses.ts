import { collection, collectionGroup, getDocs, query, where, orderBy, limit, doc, getDoc, startAfter, type QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db } from './config';
import { getFunctionsInstance } from './app';
import type { Course, CourseDraft, CourseSession, CourseEnrollment, CourseParticipant, CourseRefund, CourseQuote, CourseWaitlistEntry, CourseCustomerCounters, CoursePreview } from '@/types/course';
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
/** Courses of one venue. Readable by the venue's owner, active staff and admins (rule: managesVenue on the queried venueId). */
export async function fetchVenueCourses(venueId: string): Promise<Course[]> {
  const snap = await getDocs(query(collection(db, 'courses'), where('venueId', '==', venueId), limit(200)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Course);
}
/** Published courses of a venue that customers may read (rule: state == published && providerEligible == true). */
export async function fetchPublishedVenueCourses(venueId: string): Promise<Course[]> {
  const snap = await getDocs(query(collection(db, 'courses'), where('venueId', '==', venueId),
    where('state', '==', 'published'), where('providerEligible', '==', true), limit(100)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Course);
}
export async function fetchVenueEnrollments(venueId: string): Promise<CourseEnrollment[]> {
  const snap = await getDocs(query(collection(db, 'courseEnrollments'), where('venueId', '==', venueId), limit(500)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseEnrollment)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}
export async function fetchVenueRefunds(venueId: string): Promise<CourseRefund[]> {
  const snap = await getDocs(query(collection(db, 'courseRefunds'), where('venueId', '==', venueId), limit(500)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseRefund);
}
/** A lesson's waitlist in position order (managers only; the customer reads their own entry through fetchMyWaitlist). */
export async function fetchWaitlist(courseId: string, sessionId: string): Promise<CourseWaitlistEntry[]> {
  const snap = await getDocs(query(collection(db, 'courses', courseId, 'sessions', sessionId, 'waitlist'), orderBy('position')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseWaitlistEntry);
}
export async function fetchMyWaitlist(uid: string): Promise<CourseWaitlistEntry[]> {
  const snap = await getDocs(query(collectionGroup(db, 'waitlist'), where('userId', '==', uid), orderBy('createdAt')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseWaitlistEntry);
}
const DAY_MS = 86400000;
/**
 * Listed lessons of a venue around a week. `weekStart` is the Monday as `YYYY-MM-DD`; the UTC padding (one day before,
 * eight after) includes every local day even for time zones at the ends of the IANA range, so callers filter the exact
 * week in the venue's own zone.
 */
export async function fetchVenueWeek(venueId: string, weekStart: string): Promise<CourseSession[]> {
  const start = new Date(`${weekStart}T00:00:00Z`).getTime();
  const snap = await getDocs(query(collectionGroup(db, 'sessions'), where('venueId', '==', venueId),
    where('listed', '==', true), where('state', '==', 'scheduled'),
    where('startsAt', '>=', Timestamp.fromMillis(start - DAY_MS)), where('startsAt', '<', Timestamp.fromMillis(start + 8 * DAY_MS)),
    orderBy('startsAt')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseSession);
}
export async function fetchVenueNextLessons(venueId: string, count: number): Promise<CourseSession[]> {
  const snap = await getDocs(query(collectionGroup(db, 'sessions'), where('venueId', '==', venueId),
    where('listed', '==', true), where('state', '==', 'scheduled'), where('startsAt', '>=', Timestamp.now()),
    orderBy('startsAt'), limit(count)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseSession);
}
export async function fetchCustomerCounters(courseId: string): Promise<CourseCustomerCounters[]> {
  const snap = await getDocs(collection(db, 'courses', courseId, 'customers'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseCustomerCounters);
}
/** `providerId` is the course owner when venue staff create a course on the owner's behalf; omitted otherwise. */
export const saveCourse = (course: CourseDraft, courseId?: string, providerId?: string) =>
  courseCall<{ courseId: string }>('saveCourse', { course, ...(courseId ? { courseId } : {}), ...(providerId ? { providerId } : {}) });
export const previewCourse = (course: CourseDraft, courseId?: string) =>
  courseCall<CoursePreview>('previewCourse', { course, ...(courseId ? { courseId } : {}) });
/** Server quote. Omit `sessionIds` for the first lessons; `includeSeries: false` skips the whole-course price (lesson-only callers). */
export const quoteCourse = (courseId: string, sessionIds?: string[], includeSeries = true) =>
  courseCall<CourseQuote>('quoteCourse', { courseId, ...(sessionIds ? { sessionIds } : {}), ...(includeSeries ? {} : { includeSeries: false }) });
export const joinCourseWaitlist = (courseId: string, sessionId: string, paymentMode: 'direct' | 'stripe', requestId: string) =>
  courseCall<{ success: boolean; position: number; replay: boolean }>('joinCourseWaitlist', { courseId, sessionId, paymentMode, requestId });
export const leaveCourseWaitlist = (courseId: string, sessionId: string) =>
  courseCall('leaveCourseWaitlist', { courseId, sessionId });

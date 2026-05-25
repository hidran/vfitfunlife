import { collection, getDocs, query, limit as limitQuery, type QueryConstraint } from 'firebase/firestore';
import { db } from './config';
import type { Testimonial, Review } from '@/types/community';

export async function fetchTestimonials(opts: { limit?: number } = {}): Promise<Testimonial[]> {
  try {
    const constraints: QueryConstraint[] = [];
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q = constraints.length
      ? query(collection(db, 'testimonials'), ...constraints)
      : collection(db, 'testimonials');
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Testimonial, 'id'>) }));
  } catch (error) {
    console.error('[fetchTestimonials]', opts, error);
    return [];
  }
}

export async function fetchInstructorReviews(instructorId: string, opts: { limit?: number } = {}): Promise<Review[]> {
  try {
    const constraints: QueryConstraint[] = [];
    if (opts.limit) constraints.push(limitQuery(opts.limit));
    const q = constraints.length
      ? query(collection(db, 'instructors', instructorId, 'reviews'), ...constraints)
      : collection(db, 'instructors', instructorId, 'reviews');
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Review, 'id'>) }));
  } catch (error) {
    console.error('[fetchInstructorReviews]', instructorId, opts, error);
    return [];
  }
}

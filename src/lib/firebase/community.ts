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
    return snap.docs
      .map((d) => reviewFromDoc(d.id, d.data()))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  } catch (error) {
    console.error('[fetchInstructorReviews]', instructorId, opts, error);
    return [];
  }
}

/**
 * An instructor review document as the screens read it. Reviews written before submitReview
 * wrote the canonical shape carry `comment` / `userAvatarUrl` instead of `text` / `avatarUrl`.
 */
export function reviewFromDoc(id: string, data: Record<string, unknown>): Review {
  const raw = data as Partial<Review> & { comment?: string; userAvatarUrl?: string | null };
  return {
    ...(data as object),
    id,
    userName: raw.userName || '',
    avatarUrl: raw.avatarUrl ?? raw.userAvatarUrl ?? null,
    rating: typeof raw.rating === 'number' ? raw.rating : 0,
    text: raw.text ?? raw.comment ?? '',
  } as Review;
}

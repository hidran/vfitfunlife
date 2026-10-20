import type { Timestamp } from 'firebase/firestore';
export interface CourseDraft {
  name: string; description: string; categoryId: string; location: string; city: string; instructor: string;
  venueId: string | null; locationId: string | null; roomId: string | null; instructorId: string | null;
  waitlistEnabled: boolean; capacity: number; durationMinutes: number;
  startDate: string; startTime: string; timezone: string; recurrence: 'none' | 'daily' | 'weekly';
  interval: number; weekdays: number[]; endDate: string;
  lessonPriceCents: number | null; seriesPriceCents: number | null;
  bookingNoticeHours: number; cancellationHours: number; level: string; equipment: string;
  state: 'draft' | 'published' | 'archived'; enrollmentClosed: boolean;
}
export interface Course extends CourseDraft {
  providerEligible: boolean; id: string; providerId: string; providerName: string; serviceId: string;
  nextSessionId: string; nextAvailableSeats: number;
  sessionIds: string[]; firstStartsAt: Timestamp; nextStartsAt: Timestamp; categoryIds: string[];
}
export interface CourseSession {
  id: string; startsAt: Timestamp; endsAt: Timestamp; capacity: number; occupied: number; held: number;
  state: 'scheduled' | 'cancelled' | 'completed'; location: string; instructor: string;
  // Absent on lessons written before venue-linked courses.
  revision?: number; instructorId?: string | null; instructorName?: string; roomId?: string | null;
  locationId?: string | null; venueId?: string | null; courseId?: string; listed?: boolean; waitlisted?: number;
}
export interface CourseEnrollment {
  id: string; courseId: string; courseName: string; providerId: string; userId: string; customerName: string;
  sessionIds: string[]; activeSessionIds: string[]; scope: 'lesson' | 'series';
  paymentMode: 'direct' | 'stripe'; paymentStatus: 'pending' | 'paid';
  state: 'held' | 'confirmed' | 'cancelled' | 'expired'; totalCents: number;
  allocations: Record<string, number>; refundCents: number; cancellationHours: number;
  timezone: string; createdAt: Timestamp; holdExpiresAt: Timestamp;
  // Quote snapshot and roster signals; absent on bookings made before venue-linked courses.
  venueId?: string | null; regularCents?: number; discountCents?: number; discountPercent?: number;
  gymPercent?: number; instructorPercent?: number; sessionRevisions?: Record<string, number>;
  promotedFromWaitlist?: boolean; lateCancelledSessionIds?: string[]; cancelledSessionIds?: string[];
}
export interface CourseParticipant {
  id: string; userId: string; customerName: string; enrollmentId: string; state: 'held' | 'confirmed';
  attendance: 'unmarked' | 'present' | 'absent'; noShow?: boolean;
}
export interface CourseRefund {
  id: string; amountCents: number; userId: string; enrollmentId: string;
  paymentMode: 'direct' | 'stripe'; status: 'pending' | 'processing' | 'completed';
  providerId?: string; courseId?: string; venueId?: string | null;
}
/** courses/{c}/sessions/{s}/waitlist/{uid}: written by the callables only; positions are contiguous from 1. */
export interface CourseWaitlistEntry {
  id: string; userId: string; customerName: string; scope: 'lesson'; requestId: string;
  paymentMode: 'direct' | 'stripe'; position: number; createdAt: Timestamp; courseId: string; sessionId: string;
  courseName: string; providerId: string; venueId: string | null;
}
/** courses/{c}/customers/{uid}: per-customer reliability counters shown in the roster. */
export interface CourseCustomerCounters { id: string; userId: string; noShows?: number; lateCancels?: number }
/** A lesson of a generated schedule that collides with a room or instructor day lock (previewCourse). */
export interface CourseConflict {
  sessionId: string; kind: 'room' | 'instructor'; courseName: string; startsAt: string; endsAt: string;
}
export interface CoursePreview { sessions: { id: string; startsAt: string; endsAt: string }[]; conflicts: CourseConflict[] }
/** Server quote (functions/src/courses/quote.ts); amounts are integer cents, `finalCents` is what the customer pays. */
export interface SessionQuote {
  sessionId: string; revision: number; regularCents: number; discountPercent: number; gymPercent: number;
  instructorPercent: number; discountCents: number; finalCents: number; availableSeats: number; waitlisted: number;
  stripeEligible: boolean;
}
export interface CourseQuote {
  sessions: SessionQuote[];
  series: null | {
    regularCents: number; discountPercent: number; gymPercent: number; instructorPercent: number;
    discountCents: number; finalCents: number; stripeEligible: boolean; allocations: Record<string, number>;
    revisions: Record<string, number>;
  };
}

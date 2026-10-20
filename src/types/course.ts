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
}
export interface CourseEnrollment {
  id: string; courseId: string; courseName: string; providerId: string; userId: string; customerName: string;
  sessionIds: string[]; activeSessionIds: string[]; scope: 'lesson' | 'series';
  paymentMode: 'direct' | 'stripe'; paymentStatus: 'pending' | 'paid';
  state: 'held' | 'confirmed' | 'cancelled' | 'expired'; totalCents: number;
  allocations: Record<string, number>; refundCents: number; cancellationHours: number;
  timezone: string; createdAt: Timestamp; holdExpiresAt: Timestamp;
}
export interface CourseParticipant {
  id: string; userId: string; customerName: string; enrollmentId: string; state: 'held' | 'confirmed';
  attendance: 'unmarked' | 'present' | 'absent';
}
export interface CourseRefund {
  id: string; amountCents: number; userId: string; enrollmentId: string;
  paymentMode: 'direct' | 'stripe'; status: 'pending' | 'processing' | 'completed';
}
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

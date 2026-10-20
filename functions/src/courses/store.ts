import { getFirestore, Timestamp, FieldValue, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { ZodError } from "zod";
import type { CourseInput } from "./core";
export const db = getFirestore();
export interface Course extends CourseInput {
  providerEligible: boolean; providerId: string; providerName: string; serviceId: string; sessionIds: string[];
  nextSessionId: string; nextAvailableSeats: number;
  firstStartsAt: Timestamp; nextStartsAt: Timestamp; categoryIds: string[];
}
export interface Session {
  startsAt: Timestamp; endsAt: Timestamp; capacity: number; occupied: number; held: number;
  state: "scheduled" | "cancelled" | "completed"; location: string; instructor: string;
  // Absent on sessions written before venue-linked courses.
  revision?: number; instructorId?: string | null; instructorName?: string; roomId?: string | null;
  locationId?: string | null; venueId?: string | null; courseId?: string; listed?: boolean; waitlisted?: number;
}
export interface WaitlistEntry {
  userId: string; customerName: string; scope: "lesson"; requestId: string; paymentMode: "direct" | "stripe";
  position: number; createdAt: Timestamp; courseId: string; sessionId: string; courseName: string;
  providerId: string; venueId: string | null;
}
export interface Participant {
  enrollmentId: string; userId: string; customerName: string; providerId: string;
  state: "held" | "confirmed"; attendance: "present" | "absent" | "unmarked";
  markedAt?: Timestamp; markedBy?: string; noShow?: boolean;
}
// courses/{id}/customers/{uid}: per-customer reliability counters (R20: a removed participant's doc is deleted, so late
// removals are counted here and on the enrollment instead of on the participant).
export interface CourseCustomer { userId: string; createdAt?: Timestamp; noShows?: number; lateCancels?: number }
export interface Enrollment {
  userId: string; providerId: string; courseId: string; courseName: string; customerName: string;
  sessionIds: string[]; activeSessionIds: string[]; cancelledSessionIds: string[];
  timezone: string;
  scope: "lesson" | "series"; totalCents: number; allocations: Record<string, number>;
  cancellationHours: number; paymentMode: "direct" | "stripe";
  state: "held" | "confirmed" | "cancelled" | "expired";
  paymentStatus: "pending" | "paid"; holdExpiresAt: Timestamp;
  providerAmountOwedCents?: number; checkoutExpiresAt?: Timestamp;
  checkoutSettled?: boolean;
  checkoutSessionId?: string; checkoutUrl?: string; stripePaymentIntentId?: string;
  refundCents: number; createdAt: Timestamp;
  // Quote snapshot; absent on enrollments made before venue-linked courses.
  venueId?: string | null; regularCents?: number; discountCents?: number; discountPercent?: number;
  gymPercent?: number; instructorPercent?: number; sessionRevisions?: Record<string, number>;
  promotedFromWaitlist?: boolean; lateCancelledSessionIds?: string[];
}
export const nowStamp = () => FieldValue.serverTimestamp();
export function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError("invalid-argument", "invalid_id");
  }
  return value;
}
export function uidOf(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required");
  return auth.uid;
}
export function providerUsable(provider: Record<string, unknown> | undefined): boolean {
  return !!provider && provider.isActive !== false &&
    (provider.providerProfile as { isVerified?: boolean } | undefined)?.isVerified === true &&
    !["pending", "rejected", "suspended"].includes(provider.applicationStatus as string);
}
export async function eligibleProvider(providerId: string, tx: Transaction): Promise<Record<string, unknown>> {
  const provider = (await tx.get(db.doc(`instructors/${providerId}`))).data();
  if (!provider || !providerUsable(provider)) throw new HttpsError("failed-precondition", "provider_unavailable");
  return provider;
}
export function domainError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof ZodError) {
    throw new HttpsError("invalid-argument", "course_validation_failed", {
      fields: [...new Set(error.issues.map((issue) => String(issue.path[0])))],
    });
  }
  const message = error instanceof Error ? error.message : "course_operation_failed";
  const fields: Record<string, string[]> = {
    pricing_required: ["lessonPriceCents", "seriesPriceCents"],
    end_date_required: ["startDate", "endDate"], weekdays_required: ["weekdays"],
    invalid_timezone: ["timezone"], invalid_date: ["startDate", "endDate"],
    invalid_local_time: ["startDate", "startTime", "timezone"],
    ambiguous_local_time: ["startDate", "startTime", "timezone"],
    schedule_too_long: ["startDate", "endDate"],
    empty_schedule: ["startDate", "endDate", "weekdays"],
  };
  throw new HttpsError("failed-precondition", message, fields[message] ? { fields: fields[message] } : undefined);
}

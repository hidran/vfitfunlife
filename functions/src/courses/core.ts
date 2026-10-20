import { z } from "zod";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().int().min(0).max(10000000).nullable();
export const courseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000).default(""),
  categoryId: z.string().min(1).max(100),
  location: z.string().trim().min(2).max(300),
  city: z.string().trim().max(120).default(""),
  instructor: z.string().trim().min(2).max(120),
  venueId: z.string().max(120).nullable().default(null),
  locationId: z.string().max(120).nullable().default(null),
  roomId: z.string().max(120).nullable().default(null),
  instructorId: z.string().max(120).nullable().default(null),
  capacity: z.number().int().min(1).max(500),
  durationMinutes: z.number().int().min(10).max(480),
  startDate: date,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().default("Europe/Rome"),
  recurrence: z.enum(["none", "daily", "weekly"]),
  interval: z.number().int().min(1).max(12).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  endDate: z.string().default(""),
  lessonPriceCents: money,
  seriesPriceCents: money,
  bookingNoticeHours: z.number().min(0).max(720).default(2),
  cancellationHours: z.number().min(0).max(720).default(24),
  level: z.string().trim().max(120).default(""),
  equipment: z.string().trim().max(500).default(""),
  state: z.enum(["draft", "published", "archived"]),
  enrollmentClosed: z.boolean().default(false),
  waitlistEnabled: z.boolean().default(true),
});
export type CourseInput = z.infer<typeof courseSchema>;
export function validateCourse(raw: unknown): CourseInput {
  const data = courseSchema.parse(raw);
  try {
    new Intl.DateTimeFormat("en", { timeZone: data.timezone });
  } catch {
    throw new Error("invalid_timezone");
  }
  if (data.lessonPriceCents === null && data.seriesPriceCents === null) throw new Error("pricing_required");
  if (data.recurrence !== "none") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.endDate) || data.endDate < data.startDate) {
      throw new Error("end_date_required");
    }
    if (data.recurrence === "weekly" && !data.weekdays.length) throw new Error("weekdays_required");
  }
  return data;
}
function calendarDate(value: string): Date {
  const parsed = new Date(value + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("invalid_date");
  }
  return parsed;
}
export function localInstant(day: string, hhmm: string, timezone: string): Date {
  const local = day + "T" + hhmm;
  const instant = fromZonedTime(local, timezone);
  const render = (d: Date) => formatInTimeZone(d, timezone, "yyyy-MM-dd'T'HH:mm");
  if (!Number.isFinite(instant.getTime()) || render(instant) !== local) throw new Error("invalid_local_time");
  // Reject duplicated wall times at the autumn timezone transition.
  for (const delta of [-7200000, -3600000, -1800000, 1800000, 3600000, 7200000]) {
    if (render(new Date(instant.getTime() + delta)) === local) throw new Error("ambiguous_local_time");
  }
  return instant;
}
export function generateSessions(input: CourseInput): { id: string; startsAt: Date; endsAt: Date }[] {
  const start = calendarDate(input.startDate);
  const end = calendarDate(input.recurrence === "none" ? input.startDate : input.endDate);
  const span = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (span > 1095) throw new Error("schedule_too_long");
  const result = [];
  const startWeek = new Date(start);
  startWeek.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  for (let offset = 0; offset <= span; offset++) {
    const current = new Date(start.getTime() + offset * 86400000);
    const weeks = Math.floor((current.getTime() - startWeek.getTime()) / (7 * 86400000));
    if (input.recurrence === "daily" && offset % input.interval !== 0) continue;
    if (input.recurrence === "weekly" &&
      (!input.weekdays.includes(current.getUTCDay()) || weeks % input.interval !== 0)) continue;
    const instant = localInstant(current.toISOString().slice(0, 10), input.startTime, input.timezone);
    result.push({ id: current.toISOString().slice(0, 10), startsAt: instant,
      endsAt: new Date(instant.getTime() + input.durationMinutes * 60000) });
  }
  if (!result.length) throw new Error("empty_schedule");
  return result;
}
type Reviewed = Pick<CourseInput,
  "lessonPriceCents" | "seriesPriceCents" | "capacity" | "cancellationHours" | "bookingNoticeHours">;
/**
 * What a customer reviews in a quote: price, seat count and the cancellation / booking-notice terms.
 * Editing text fields never invalidates a quote.
 */
export function courseRevisionBumped(prev: Reviewed, next: Reviewed): boolean {
  return prev.lessonPriceCents !== next.lessonPriceCents || prev.seriesPriceCents !== next.seriesPriceCents ||
    prev.capacity !== next.capacity || prev.cancellationHours !== next.cancellationHours ||
    prev.bookingNoticeHours !== next.bookingNoticeHours;
}
export interface SessionPlace { startsAt: number; endsAt: number; roomId: string | null; instructorId: string | null }
export function sessionRevisionBumped(prev: SessionPlace, next: SessionPlace): boolean {
  return prev.startsAt !== next.startsAt || prev.endsAt !== next.endsAt || prev.roomId !== next.roomId ||
    prev.instructorId !== next.instructorId;
}
export interface ReservableSession {
  startsAt: Date; capacity?: number; occupied: number; held: number; state: string;
}
export function assertReservable(
  course: Pick<CourseInput, "state" | "enrollmentClosed" | "capacity" | "bookingNoticeHours">,
  sessions: ReservableSession[], memberships: boolean[], now: Date
): void {
  if (course.state !== "published" || course.enrollmentClosed) throw new Error("enrollment_closed");
  if (!sessions.length) throw new Error("empty_schedule");
  if (memberships.some(Boolean)) throw new Error("already_enrolled");
  for (const session of sessions) {
    if (session.state !== "scheduled") throw new Error("session_unavailable");
    // Fullness is reported first: enrollInTx decides from it whether the lesson can still be waitlisted.
    if (session.occupied + session.held >= (session.capacity ?? course.capacity)) throw new Error("lesson_full");
    if (session.startsAt.getTime() <= now.getTime() + course.bookingNoticeHours * 3600000) {
      throw new Error("booking_deadline");
    }
  }
}
export function allocatePrice(total: number, count: number): number[] {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(count) || count < 1) throw new Error("invalid_price");
  return Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0));
}
export function checkoutActive(
  settings: { stripePaymentsEnabled?: boolean; courseCheckoutEnabled?: boolean }
): boolean {
  return settings.stripePaymentsEnabled === true && settings.courseCheckoutEnabled === true;
}
export function paymentDecision(
  enrollment: { state: string; totalCents: number; holdExpiresAt: Date; userId: string; checkoutSessionId?: string },
  session: { id: string; amount_total: number | null; currency: string | null; payment_status: string;
    metadata: { userId?: string } | null }, now: Date
): "confirm" | "refund" | "ignore" {
  if (session.amount_total !== enrollment.totalCents || session.currency !== "eur" ||
    session.metadata?.userId !== enrollment.userId ||
    (enrollment.checkoutSessionId && session.id !== enrollment.checkoutSessionId)) throw new Error("payment_mismatch");
  if (session.payment_status !== "paid" || enrollment.state === "confirmed") return "ignore";
  return enrollment.state === "held" && enrollment.holdExpiresAt > now ? "confirm" : "refund";
}

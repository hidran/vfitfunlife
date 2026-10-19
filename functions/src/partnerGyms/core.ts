import { createHash } from "crypto";
import { z } from "zod";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const scheduleSchema = z.object({
  venueId: id, locationId: id, roomId: id, instructorId: id,
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  startDate: date, startTime: time, endTime: time,
  recurrence: z.enum(["none", "weekly"]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  endDate: date.optional(),
  capacity: z.number().int().min(1).max(100),
  regularPriceCents: z.number().int().min(0).max(10000000),
  cancellationHours: z.number().min(0).max(720).default(24),
  status: z.enum(["draft", "published"]).default("draft"),
  requestId: id,
});
export type GymScheduleInput = z.infer<typeof scheduleSchema>;

export function localInstant(day: string, hour: string, timezone: string): Date {
  const local = `${day}T${hour}`;
  const instant = fromZonedTime(local, timezone);
  const render = (value: Date) => formatInTimeZone(value, timezone, "yyyy-MM-dd'T'HH:mm");
  if (!Number.isFinite(instant.getTime()) || render(instant) !== local) throw new Error("invalid_local_time");
  for (const minutes of [-120, -60, -30, 30, 60, 120]) {
    if (render(new Date(instant.getTime() + minutes * 60000)) === local) throw new Error("ambiguous_local_time");
  }
  return instant;
}

export function occurrenceDates(input: GymScheduleInput): string[] {
  if (input.recurrence === "weekly" && !input.endDate) throw new Error("invalid_weekly_pattern");
  const first = new Date(`${input.startDate}T12:00:00Z`);
  const last = new Date(`${input.recurrence === "weekly" ? input.endDate : input.startDate}T12:00:00Z`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) ||
    first.toISOString().slice(0, 10) !== input.startDate ||
    last.toISOString().slice(0, 10) !== (input.recurrence === "weekly" ? input.endDate : input.startDate) ||
    last < first) throw new Error("invalid_date_range");
  const span = Math.round((last.getTime() - first.getTime()) / 86400000);
  if (input.recurrence === "weekly" && (!input.endDate || !input.weekdays.length || span > 55)) {
    throw new Error("invalid_weekly_pattern");
  }
  if (input.endTime <= input.startTime) throw new Error("invalid_time_range");
  const dates: string[] = [];
  for (let offset = 0; offset <= span; offset++) {
    const day = new Date(first.getTime() + offset * 86400000);
    if (input.recurrence === "none" || input.weekdays.includes(day.getUTCDay())) {
      dates.push(day.toISOString().slice(0, 10));
    }
  }
  if (!dates.length) throw new Error("empty_schedule");
  return dates;
}

export function occurrences(input: GymScheduleInput, timezone: string) {
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  return occurrenceDates(input).map((day) => {
    const startsAt = localInstant(day, input.startTime, timezone);
    const endsAt = localInstant(day, input.endTime, timezone);
    if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 8 * 3600000) {
      throw new Error("invalid_time_range");
    }
    return { day, startsAt, endsAt };
  });
}

export function seriesId(uid: string, requestId: string) {
  return createHash("sha256").update(`${uid}:${requestId}`).digest("hex").slice(0, 24);
}

export function quote(regularPriceCents: number, gymPercent: number, instructorPercent: number) {
  for (const value of [gymPercent, instructorPercent]) {
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("invalid_partner_benefit");
  }
  const discountPercent = Math.min(100, gymPercent + instructorPercent);
  const discountCents = Math.floor(regularPriceCents * discountPercent / 100);
  return { regularPriceCents, discountCents, finalPriceCents: regularPriceCents - discountCents,
    gymPercent, instructorPercent, currency: "EUR" as const };
}

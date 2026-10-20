import type { CourseSession } from '@/types/course';

export const courseMoney = (cents: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const courseDate = (s: CourseSession, locale: string, timezone: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(s.startsAt.toDate());
/** A price in cents, or the `free` label for 0 (a free lesson is "Free", never "€0.00"). */
export const coursePrice = (cents: number, locale: string, free: string) => cents === 0 ? free : courseMoney(cents, locale);

'use client';
import Link from 'next/link';
import { Clock, DoorOpen, UserRound } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { sessionTime } from '@/lib/gymTime';
import { instructorLabel, roomTone, seatState, type TimetableLesson } from '@/lib/venueTimetable';
import { cn } from '@/lib/utils';
import type { SessionQuote } from '@/types/course';

// Literal class names so Tailwind generates them; every room also prints its name (colour is never the only cue).
const TONES = [
  'border-l-section-primary bg-section-primary/10', 'border-l-section-accent bg-section-accent/10',
  'border-l-success bg-success/10', 'border-l-warning bg-warning/10',
  'border-l-content-muted bg-content/5', 'border-l-section-secondary bg-section-secondary/10',
] as const;

const money = (cents: number, locale: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);

/**
 * One lesson of the weekly timetable. Signed-in users pass the server `quote` and see their price (regular struck
 * through when discounted); visitors see the regular price. The whole card opens the lesson in the booking sheet.
 */
export function TimetableCard({ lesson, roomName, quote, now }: {
  lesson: TimetableLesson; roomName: string; quote?: SessionQuote; now: number;
}) {
  const { t, locale } = useI18n();
  const { session, course } = lesson;
  const seats = seatState(lesson, now);
  const regular = course.lessonPriceCents;
  const final = quote?.finalCents ?? regular;
  const discounted = !!quote && quote.discountCents > 0;
  const past = session.startsAt.toMillis() <= now;
  const price = (cents: number) => cents === 0 ? t('courses.free') : money(cents, locale);
  return <Link href={`/courses?id=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(session.id)}`}
    data-testid="timetable-card"
    className={cn('block min-h-11 space-y-1 rounded-xl border border-hairline border-l-4 p-3 text-sm text-content focus-ring',
      TONES[roomTone(session.roomId)], past && 'opacity-60')}>
    <p className="font-semibold leading-snug">{course.name}</p>
    <p className="flex items-center gap-1.5 text-content-muted"><Clock size={14} aria-hidden="true" />
      <span>{sessionTime(session.startsAt.toDate(), locale, course.timezone)}–{sessionTime(session.endsAt.toDate(), locale, course.timezone)}</span></p>
    <p className="flex items-center gap-1.5 text-content-muted"><DoorOpen size={14} aria-hidden="true" /><span>{roomName}</span></p>
    {instructorLabel(session) && <p className="flex items-center gap-1.5 text-content-muted"><UserRound size={14} aria-hidden="true" />
      <span>{instructorLabel(session)}</span></p>}
    <p className="font-medium">{seats.kind === 'seats' ? t('timetable.seatsLeft', { count: seats.left }) :
      seats.kind === 'waitlist' ? t('timetable.waitlistOpen') : t('timetable.full')}</p>
    {final !== null && <p className="flex flex-wrap items-baseline gap-x-2">
      {discounted && regular !== null && <s className="text-content-muted" data-testid="regular-price">{price(regular)}</s>}
      <strong data-testid="final-price">{price(final)}</strong>
      {discounted && <span className="text-xs font-semibold text-success">−{quote!.discountPercent}%</span>}
    </p>}
  </Link>;
}

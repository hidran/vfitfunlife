'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { courseDate, courseMoney, coursePrice } from '@/lib/courseFormat';
import type { Course, CourseSession, SessionQuote } from '@/types/course';

/** The priced part of a lesson or series quote: what the review shows and what `expectedFinalCents` confirms. */
export type ReviewQuote = Pick<SessionQuote, 'regularCents' | 'discountPercent' | 'gymPercent' | 'instructorPercent' | 'discountCents' | 'finalCents' | 'stripeEligible'>;

export interface QuoteReviewProps {
  course: Course;
  scope: 'lesson' | 'series';
  lessons: CourseSession[];
  quote: ReviewQuote;
  /** The mode that will be sent: always `direct` for a free booking or one too small for Stripe. */
  payment: 'direct' | 'stripe';
  /** Set after `price_changed`: the numbers above are the new ones and need a fresh confirm. */
  notice?: 'price' | 'availability';
  error?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra actions under the error, e.g. "Join waitlist" after `lesson_full`. */
  extra?: ReactNode;
}

/** Body of the booking review: regular price, benefit lines, discount, final price, cancellation terms. */
export function CourseQuoteReview({ course, scope, lessons, quote, payment, notice, error, busy, onConfirm, onCancel, extra }: QuoteReviewProps) {
  const { t, locale } = useI18n();
  const free = quote.finalCents === 0;
  const ref = useRef<HTMLElement>(null);
  // The review sits under a long lesson list: bring it (and any new notice) into view.
  useEffect(() => { ref.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }, [notice, error, quote.finalCents]);
  return <section ref={ref} className="space-y-3 border-t border-hairline pt-4" aria-label={t('courses.review')}>
    <h3 className="font-semibold">{t('courses.review')}</h3>
    {notice && <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
      {t(notice === 'price' ? 'courses.priceChanged' : 'courses.availabilityChanged')}</p>}
    <p className="font-medium">{t(`courses.${scope}`)}</p>
    <ul className="text-sm">{lessons.map(s => <li key={s.id}>{courseDate(s, locale, course.timezone)}</li>)}</ul>
    {quote.discountCents > 0 && (quote.gymPercent > 0 || quote.instructorPercent > 0) && <ul className="space-y-1 text-sm text-success">
      {quote.gymPercent > 0 && <li>{t('courses.partnerBenefit', { percent: quote.gymPercent })}</li>}
      {quote.instructorPercent > 0 && <li>{t('courses.instructorBenefit', { percent: quote.instructorPercent })}</li>}
    </ul>}
    <dl className="space-y-2 border-y border-hairline py-3 text-sm">
      <div className="flex justify-between gap-3"><dt>{t('courses.regularPrice')}</dt><dd data-testid="review-regular">{coursePrice(quote.regularCents, locale, t('courses.free'))}</dd></div>
      {quote.discountCents > 0 && <div className="flex justify-between gap-3"><dt>{t('courses.discount')}</dt><dd data-testid="review-discount">−{courseMoney(quote.discountCents, locale)}</dd></div>}
      <div className="flex justify-between gap-3 text-base font-bold"><dt>{t('courses.finalPrice')}</dt>
        <dd data-testid="review-final">{free ? t('courses.free') : courseMoney(quote.finalCents, locale)}</dd></div>
    </dl>
    <p className="text-sm text-content-muted">{t('courses.terms', { hours: course.cancellationHours })}</p>
    {!free && <p className="text-sm">{t(payment === 'stripe' ? 'courses.online' : 'courses.direct')}</p>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    {extra}
    <div className="flex flex-wrap gap-2">
      <Button className="min-h-11" onClick={onConfirm} disabled={busy}>{t('courses.confirm')}</Button>
      <Button className="min-h-11" variant="ghost" disabled={busy} onClick={onCancel}>{t('common.cancel')}</Button>
    </div>
  </section>;
}

'use client';
import { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useCourseEnrollments, useCourseQuote, useMyWaitlist, useRefreshCourses } from '@/hooks/useCourses';
import { courseCall, joinCourseWaitlist, leaveCourseWaitlist, quoteCourse } from '@/lib/firebase/courses';
import { courseErrorMessage } from '@/lib/courseErrors';
import { courseDate, courseMoney } from '@/lib/courseFormat';
import { loginHref } from '@/lib/auth/returnTo';
import { Button } from '@/components/ui/button';
import { CourseQuoteReview, type ReviewQuote } from './CourseQuoteReview';
import type { Course, CourseQuote, CourseSession } from '@/types/course';

/** Server cap of a waitlist (functions/src/courses/waitlist.ts WAITLIST_MAX). */
const WAITLIST_MAX = 100;

type Review = {
  scope: 'lesson' | 'series'; sessionId?: string; quote: ReviewQuote; revisions: Record<string, number>; requestId: string;
  notice?: 'price' | 'availability'; error?: string; waitlistOffer?: string;
};

/** The reviewed option of a fresh quote, with the revisions the server will compare on confirm. */
function reviewOf(quote: CourseQuote, scope: 'lesson' | 'series', sessionId?: string): Pick<Review, 'quote' | 'revisions'> {
  if (scope === 'series') {
    if (!quote.series) throw new Error('pricing_option_unavailable');
    return { quote: quote.series, revisions: quote.series.revisions };
  }
  const lesson = quote.sessions.find(s => s.sessionId === sessionId);
  if (!lesson) throw new Error('pricing_option_unavailable');
  return { quote: lesson, revisions: { [lesson.sessionId]: lesson.revision } };
}

export function CourseBooking({ course, sessions, checkoutEnabled, uid, initialSessionId, onBooked, onBusyChange }: {
  course: Course; sessions: CourseSession[]; checkoutEnabled: boolean; uid?: string;
  /** `?lesson=` of the timetable: open the review of that lesson once (a full lesson opens with the waitlist offer). */
  initialSessionId?: string;
  onBooked: () => void;
  /** True while a request is in flight, so the host can keep the sheet open until it settles. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const [payment, setPayment] = useState<'direct' | 'stripe'>('direct');
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const quote = useCourseQuote(course.id, undefined, true, !!uid);
  const mine = useMyWaitlist(uid);
  const enrollments = useCourseEnrollments(uid);
  const refresh = useRefreshCourses();
  const lessonQuotes = new Map((quote.data?.sessions ?? []).map(s => [s.sessionId, s]));
  const seriesQuote = quote.data?.series ?? null;

  const enrollmentOf = (sessionId: string) => (enrollments.data ?? []).find(e => e.courseId === course.id &&
    (e.state === 'held' || e.state === 'confirmed') && e.activeSessionIds.includes(sessionId));
  const enrolledIn = (sessionId: string) => !!enrollmentOf(sessionId);
  const entryOf = (sessionId: string) => (mine.data ?? []).find(e => e.courseId === course.id && e.sessionId === sessionId);
  const bookable = course.state === 'published' && !course.enrollmentClosed;
  const outsideNotice = (s: CourseSession) => s.startsAt.toMillis() > now + course.bookingNoticeHours * 3600000;
  const full = (s: CourseSession) => s.state === 'scheduled' && s.capacity <= s.occupied + s.held;
  const available = (s: CourseSession) => s.state === 'scheduled' && !full(s) && outsideNotice(s) && bookable;
  const canWaitlist = (s: CourseSession) => full(s) && outsideNotice(s) && bookable && course.waitlistEnabled !== false;
  const seriesAvailable = course.firstStartsAt.toMillis() > now &&
    sessions.length === course.sessionIds.length && sessions.every(available);
  // Stripe only for a priced option that reaches its minimum charge; otherwise the booking is direct.
  const modeFor = (q: Pick<ReviewQuote, 'finalCents' | 'stripeEligible'>) =>
    checkoutEnabled && q.finalCents > 0 && q.stripeEligible ? payment : 'direct';
  const lessonPaymentMode = (sessionId: string): 'direct' | 'stripe' => {
    const q = lessonQuotes.get(sessionId);
    return q ? modeFor(q) : checkoutEnabled && (course.lessonPriceCents ?? 0) > 0 ? payment : 'direct';
  };

  /** A visitor signs in first and comes back to this lesson (or the course) through `?next=`. */
  function goToLogin(sessionId?: string) {
    const lesson = sessionId ? `&lesson=${encodeURIComponent(sessionId)}` : '';
    window.location.assign(loginHref(`/courses?id=${encodeURIComponent(course.id)}${lesson}`));
  }

  /** `full`: the lesson has no seat left, so the review opens with the waitlist offer instead of a confirm. */
  async function openReview(scope: 'lesson' | 'series', sessionId?: string, full = false) {
    if (!uid) { goToLogin(scope === 'lesson' ? sessionId : undefined); return; }
    setBusy(true); setError('');
    try {
      // A fresh quote of exactly what is reviewed: its numbers and revisions are what the confirm compares.
      const fresh = await quoteCourse(course.id, scope === 'lesson' ? [sessionId!] : [], scope === 'series');
      setReview({ scope, sessionId, ...reviewOf(fresh, scope, sessionId), requestId: crypto.randomUUID(),
        ...(full ? { error: courseErrorMessage(new Error('lesson_full'), t, locale), waitlistOffer: sessionId } : {}) });
    } catch (err) { setError(courseErrorMessage(err, t, locale)); }
    finally { setBusy(false); }
  }

  // The lesson of a `?lesson=` link: reviewed when bookable, offered the waitlist when full, left alone when the
  // customer already has a seat or a place in the queue (their own list shows it).
  const opened = useRef(false);
  const linked = initialSessionId ? sessions.find(s => s.id === initialSessionId) : undefined;
  const linkedMode: 'book' | 'waitlist' | null = !linked || !uid || enrollments.isLoading || mine.isLoading ||
    enrolledIn(linked.id) || entryOf(linked.id) ? null : available(linked) ? 'book' :
      canWaitlist(linked) && (linked.waitlisted ?? 0) < WAITLIST_MAX ? 'waitlist' : null;
  useEffect(() => {
    if (opened.current || !linkedMode) return;
    opened.current = true;
    void openReview('lesson', initialSessionId, linkedMode === 'waitlist');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedMode, initialSessionId]);

  async function confirm() {
    if (!review) return;
    const mode = modeFor(review.quote);
    setBusy(true); setReview({ ...review, error: undefined, waitlistOffer: undefined, notice: undefined });
    try {
      const result = await courseCall<{ enrollmentId: string }>('enrollInCourse', {
        courseId: course.id, scope: review.scope, ...(review.sessionId ? { sessionId: review.sessionId } : {}),
        paymentMode: mode, requestId: review.requestId, expectedFinalCents: review.quote.finalCents, expectedRevisions: review.revisions,
      });
      if (mode === 'stripe') {
        const checkout = await courseCall<{ url: string }>('createCourseCheckout', { enrollmentId: result.enrollmentId });
        window.location.assign(checkout.url);
        return;
      }
      setReview(null); await refresh(); onBooked();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const details = (err as { details?: { reason?: string; waitlistAvailable?: boolean } }).details;
      if (message === 'price_changed') {
        // Never silently reprice: show the new numbers and ask for a fresh confirm.
        try {
          const fresh = await quoteCourse(course.id, review.scope === 'lesson' ? [review.sessionId!] : [], review.scope === 'series');
          setReview({ ...review, ...reviewOf(fresh, review.scope, review.sessionId),
            notice: details?.reason === 'availability' ? 'availability' : 'price', error: undefined, waitlistOffer: undefined });
        } catch (refetchError) { setReview({ ...review, error: courseErrorMessage(refetchError, t, locale) }); }
      } else {
        setReview({ ...review, notice: undefined, error: courseErrorMessage(err, t, locale),
          waitlistOffer: message === 'lesson_full' && details?.waitlistAvailable ? review.sessionId : undefined });
        if (message === 'lesson_full') void refresh();
      }
    } finally { setBusy(false); }
  }

  async function join(sessionId: string, fromReview = false) {
    if (!uid) { goToLogin(sessionId); return; }
    setBusy(true); setError('');
    try {
      // Fresh request id per join: a leave followed by a join is a new request, not a replay.
      await joinCourseWaitlist(course.id, sessionId, lessonPaymentMode(sessionId), crypto.randomUUID());
      if (fromReview) setReview(null);
      await refresh();
    } catch (err) {
      const message = courseErrorMessage(err, t, locale);
      if (fromReview) setReview(r => r && { ...r, error: message }); else setError(message);
      // The queue or the seat count changed under us (already_waitlisted, waitlist_full, ...): show the truth.
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function leave(sessionId: string) {
    setBusy(true); setError('');
    try { await leaveCourseWaitlist(course.id, sessionId); await refresh(); }
    catch (err) { setError(courseErrorMessage(err, t, locale)); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  }

  const lessonPrice = (s: CourseSession) => {
    const q = lessonQuotes.get(s.id);
    const finalCents = q?.finalCents ?? course.lessonPriceCents ?? undefined;
    if (finalCents === undefined) return null;
    return <>{q && q.discountCents > 0 && <><span className="sr-only">{t('courses.regularPrice')} </span>
        <s className="mr-1 text-content-muted" data-testid="regular-price">{courseMoney(q.regularCents, locale)}</s>
        <span className="sr-only">{t('courses.finalPrice')} </span></>}
      <span data-testid="lesson-price">{finalCents === 0 ? t('courses.free') : courseMoney(finalCents, locale)}</span></>;
  };
  const reviewLessons = review ? sessions.filter(s => review.scope === 'series' || s.id === review.sessionId) : [];
  const seriesFinal = seriesQuote?.finalCents ?? course.seriesPriceCents ?? undefined;
  const anyPriced = (course.lessonPriceCents ?? 0) > 0 || (course.seriesPriceCents ?? 0) > 0;
  return <div className="space-y-4">
    <p className="text-sm text-content-muted">{t('courses.terms', { hours: course.cancellationHours })}</p>
    {checkoutEnabled && anyPriced ? <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">{t('courses.pay')}</legend>
      <label className="flex min-h-11 items-center gap-2"><input type="radio" name="course-payment" disabled={busy || !!review} checked={payment === 'direct'} onChange={() => setPayment('direct')} />{t('courses.direct')}</label>
      <label className="flex min-h-11 items-center gap-2"><input type="radio" name="course-payment" disabled={busy || !!review} checked={payment === 'stripe'} onChange={() => setPayment('stripe')} />{t('courses.online')}</label>
    </fieldset> : anyPriced && <p className="text-sm">{t('courses.direct')}</p>}
    {seriesFinal !== undefined && <div className="rounded-xl border border-hairline p-4 space-y-2">
      <Button className="min-h-11 w-full" disabled={busy || !!review || !seriesAvailable} onClick={() => openReview('series')}>
        <span>{t('courses.series')} · {seriesQuote && seriesQuote.discountCents > 0 && <><span className="sr-only">{t('courses.regularPrice')} </span>
            <s className="mr-1 opacity-70" data-testid="regular-series">{courseMoney(seriesQuote.regularCents, locale)}</s>
            <span className="sr-only">{t('courses.finalPrice')} </span></>}
          <span data-testid="series-price">{seriesFinal === 0 ? t('courses.free') : courseMoney(seriesFinal, locale)}</span></span>
      </Button><p className="text-sm text-content-muted">{t('courses.seriesHint')}</p>
    </div>}
    <h3 className="font-semibold">{t('courses.sessions')}</h3>
    <ul className="divide-y divide-hairline">{sessions.map(s => {
      const entry = entryOf(s.id);
      return <li key={s.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-medium">{courseDate(s, locale, course.timezone)}</p>
          <p className="text-sm text-content-muted">{s.location} · {s.instructorName || s.instructor}</p>
          <p className="text-sm">{s.state === 'cancelled' ? t('courses.cancelled') :
            `${t('courses.spots')}: ${Math.max(0, s.capacity - s.occupied - s.held)} / ${s.capacity}`}</p>
          {enrollmentOf(s.id) && <p className="text-sm font-medium text-success" data-testid="enrolled">{t(`courses.${enrollmentOf(s.id)!.state as 'held' | 'confirmed'}`)}</p>}
          {entry && <p className="text-sm font-medium text-section-ink" data-testid="on-waitlist">{t('courses.onWaitlist', { position: entry.position })}</p>}</div>
        <div className="flex flex-wrap items-center gap-2">
          {entry ? <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => leave(s.id)}>{t('courses.leaveWaitlist')}</Button> :
            full(s) && canWaitlist(s) ? ((s.waitlisted ?? 0) >= WAITLIST_MAX ?
              <Button size="sm" variant="outline" className="min-h-11" disabled>{t('courses.waitlistFull')}</Button> :
              <Button size="sm" variant="outline" className="min-h-11" disabled={busy || enrolledIn(s.id)} onClick={() => join(s.id)}>{t('courses.joinWaitlist')}</Button>) :
            course.lessonPriceCents !== null && <Button size="sm" variant="outline" className="min-h-11" disabled={busy || !!review || !available(s) || enrolledIn(s.id)}
              onClick={() => openReview('lesson', s.id)}><span>{t('courses.bookLesson')} · {lessonPrice(s)}</span></Button>}
        </div>
      </li>;
    })}</ul>
    {review && <CourseQuoteReview course={course} scope={review.scope} lessons={reviewLessons} quote={review.quote}
      payment={modeFor(review.quote)} notice={review.notice} error={review.error} busy={busy} canConfirm={!review.waitlistOffer}
      onConfirm={confirm} onCancel={() => setReview(null)}
      extra={review.waitlistOffer ? <Button className="min-h-11" variant="outline" disabled={busy}
        onClick={() => join(review.waitlistOffer!, true)}>{t('courses.joinWaitlist')}</Button> : null} />}
    {error && <p role="alert" className="text-error">{error}</p>}
  </div>;
}

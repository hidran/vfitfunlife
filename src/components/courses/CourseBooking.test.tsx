import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course, CourseSession } from '@/types/course';

const mocks = vi.hoisted(() => ({
  call: vi.fn(), quote: vi.fn(), join: vi.fn(), leave: vi.fn(), refresh: vi.fn(), refetch: vi.fn(),
  listQuote: undefined as unknown, mine: [] as unknown[], enrollments: [] as unknown[],
}));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string, values?: Record<string, unknown>) => values ? `${k}:${JSON.stringify(values)}` : k, locale: 'en' }),
}));
vi.mock('@/hooks/useCourses', () => ({
  useCourseQuote: (_id: string, _ids: unknown, _series: boolean, enabled: boolean) => ({ data: enabled ? mocks.listQuote : undefined, refetch: mocks.refetch }),
  useMyWaitlist: (uid?: string) => ({ data: uid ? mocks.mine : undefined }),
  useCourseEnrollments: (uid?: string) => ({ data: uid ? mocks.enrollments : undefined }),
  useRefreshCourses: () => mocks.refresh,
}));
vi.mock('@/lib/firebase/courses', () => ({
  courseCall: (...args: unknown[]) => mocks.call(...args), quoteCourse: (...args: unknown[]) => mocks.quote(...args),
  joinCourseWaitlist: (...args: unknown[]) => mocks.join(...args), leaveCourseWaitlist: (...args: unknown[]) => mocks.leave(...args),
}));

import { CourseBooking } from './CourseBooking';

const stamp = (date: string) => ({ toDate: () => new Date(date), toMillis: () => new Date(date).getTime() }) as unknown as CourseSession['startsAt'];
const course = (over: Partial<Course> = {}) => ({ id: 'c', name: 'Karate', providerName: 'Anna', providerId: 'p', capacity: 2, state: 'published',
  lessonPriceCents: 1000, seriesPriceCents: 2500, bookingNoticeHours: 2, cancellationHours: 24, waitlistEnabled: true, enrollmentClosed: false,
  firstStartsAt: stamp('2099-10-12T18:00Z'), timezone: 'Europe/Rome', location: 'Torino', sessionIds: ['s1', 's2'], ...over }) as unknown as Course;
const lessons = (over: Partial<CourseSession> = {}, over2: Partial<CourseSession> = {}) => [
  { id: 's1', startsAt: stamp('2099-10-12T18:00Z'), state: 'scheduled', capacity: 2, occupied: 0, held: 0, location: 'Sala', instructor: 'Anna', ...over },
  { id: 's2', startsAt: stamp('2099-10-13T18:00Z'), state: 'scheduled', capacity: 2, occupied: 0, held: 0, location: 'Sala', instructor: 'Anna', ...over2 },
] as CourseSession[];

const lessonQuote = (sessionId: string, over: Record<string, unknown> = {}) => ({ sessionId, revision: 3, regularCents: 1000, discountPercent: 20,
  gymPercent: 20, instructorPercent: 0, discountCents: 200, finalCents: 800, availableSeats: 2, waitlisted: 0, stripeEligible: true, ...over });
const quoteOf = (sessions: unknown[], series: unknown = null) => ({ sessions, series });
const seriesQuote = (over: Record<string, unknown> = {}) => ({ regularCents: 2500, discountPercent: 20, gymPercent: 20, instructorPercent: 0,
  discountCents: 500, finalCents: 2000, stripeEligible: true, allocations: { s1: 1000, s2: 1000 }, revisions: { s1: 3, s2: 4 }, ...over });

const renderBooking = (props: Partial<Parameters<typeof CourseBooking>[0]> = {}) => {
  const onBooked = vi.fn();
  render(<CourseBooking course={course()} sessions={lessons()} checkoutEnabled={false} uid="u1" onBooked={onBooked} {...props} />);
  return { onBooked };
};
const reviewOf = () => screen.getByRole('region', { name: 'courses.review' });
const rejection = (message: string, details?: unknown) => Object.assign(new Error(message), { details });

beforeEach(() => {
  Object.values(mocks).forEach(m => typeof m === 'function' && 'mockReset' in m && (m as ReturnType<typeof vi.fn>).mockReset());
  mocks.listQuote = quoteOf([lessonQuote('s1'), lessonQuote('s2')], seriesQuote());
  mocks.mine = []; mocks.enrollments = [];
  mocks.refresh.mockResolvedValue(undefined);
  mocks.call.mockResolvedValue({ enrollmentId: 'e1' });
  mocks.quote.mockResolvedValue(quoteOf([lessonQuote('s2')]));
});

describe('CourseBooking', () => {
  it('shows the rate-limit message when the review quote is refused and keeps the list usable', async () => {
    mocks.quote.mockRejectedValue(rejection('rate_limited'));
    renderBooking();
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.err.rate_limited');
    expect(screen.queryByRole('region', { name: 'courses.review' })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /courses.bookLesson/ })) expect(button).toBeEnabled();
    expect(screen.getByTestId('series-price')).toHaveTextContent('€20.00');
  });

  it('shows the regular price struck through and the discounted price in the list', () => {
    renderBooking();
    const row = screen.getAllByRole('button', { name: /courses.bookLesson/ })[0];
    expect(within(row).getByTestId('regular-price')).toHaveTextContent('€10.00');
    expect(within(row).getByTestId('lesson-price')).toHaveTextContent('€8.00');
    expect(screen.getByTestId('series-price')).toHaveTextContent('€20.00');
    expect(screen.getByTestId('regular-series')).toHaveTextContent('€25.00');
  });

  it('reviews a fresh quote with the discount lines and confirms with the expected price and revisions', async () => {
    mocks.quote.mockResolvedValue(quoteOf([lessonQuote('s2')]));
    const { onBooked } = renderBooking();
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    const review = await screen.findByRole('region', { name: 'courses.review' });
    expect(mocks.quote).toHaveBeenCalledWith('c', ['s2'], false);
    expect(within(review).getByTestId('review-regular')).toHaveTextContent('€10.00');
    expect(within(review).getByText('courses.partnerBenefit:{"percent":20}')).toBeInTheDocument();
    expect(within(review).getByTestId('review-discount')).toHaveTextContent('−€2.00');
    expect(within(review).getByTestId('review-final')).toHaveTextContent('€8.00');
    fireEvent.click(within(review).getByRole('button', { name: 'courses.confirm' }));
    await waitFor(() => expect(onBooked).toHaveBeenCalled());
    expect(mocks.call).toHaveBeenCalledWith('enrollInCourse', expect.objectContaining({
      courseId: 'c', scope: 'lesson', sessionId: 's2', paymentMode: 'direct', expectedFinalCents: 800, expectedRevisions: { s2: 3 },
      requestId: expect.any(String) }));
  });

  it('sends every revision of the series quote for a whole-course booking', async () => {
    mocks.quote.mockResolvedValue(quoteOf([], seriesQuote()));
    renderBooking();
    fireEvent.click(screen.getByRole('button', { name: /courses.series/ }));
    const review = await screen.findByRole('region', { name: 'courses.review' });
    expect(mocks.quote).toHaveBeenCalledWith('c', [], true);
    fireEvent.click(within(review).getByRole('button', { name: 'courses.confirm' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalled());
    expect(mocks.call).toHaveBeenCalledWith('enrollInCourse', expect.objectContaining({
      scope: 'series', expectedFinalCents: 2000, expectedRevisions: { s1: 3, s2: 4 } }));
    expect(mocks.call.mock.calls[0][1]).not.toHaveProperty('sessionId');
  });

  it('re-reviews on the new numbers after price_changed (price) and confirms again with them', async () => {
    mocks.call.mockRejectedValueOnce(rejection('price_changed', { reason: 'price' })).mockResolvedValueOnce({ enrollmentId: 'e1' });
    mocks.quote.mockResolvedValueOnce(quoteOf([lessonQuote('s2')]))
      .mockResolvedValueOnce(quoteOf([lessonQuote('s2', { regularCents: 1200, discountCents: 240, finalCents: 960, revision: 4 })]));
    const { onBooked } = renderBooking();
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    fireEvent.click(within(await screen.findByRole('region', { name: 'courses.review' })).getByRole('button', { name: 'courses.confirm' }));
    expect(await screen.findByText('courses.priceChanged')).toBeInTheDocument();
    expect(within(reviewOf()).getByTestId('review-final')).toHaveTextContent('€9.60');
    expect(onBooked).not.toHaveBeenCalled();
    fireEvent.click(within(reviewOf()).getByRole('button', { name: 'courses.confirm' }));
    await waitFor(() => expect(onBooked).toHaveBeenCalled());
    expect(mocks.call).toHaveBeenLastCalledWith('enrollInCourse', expect.objectContaining({ expectedFinalCents: 960, expectedRevisions: { s2: 4 } }));
    expect(screen.queryByText('courses.priceChanged')).not.toBeInTheDocument();
  });

  it('uses its own message when only the availability changed', async () => {
    mocks.call.mockRejectedValueOnce(rejection('price_changed', { reason: 'availability' }));
    renderBooking();
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    fireEvent.click(within(await screen.findByRole('region', { name: 'courses.review' })).getByRole('button', { name: 'courses.confirm' }));
    expect(await screen.findByText('courses.availabilityChanged')).toBeInTheDocument();
    expect(screen.queryByText('courses.priceChanged')).not.toBeInTheDocument();
  });

  it('shows a free lesson as Free, with no payment line, and books it direct even with online payments on', async () => {
    mocks.listQuote = quoteOf([lessonQuote('s1', { finalCents: 0, regularCents: 0, discountCents: 0, discountPercent: 0, gymPercent: 0, stripeEligible: false }),
      lessonQuote('s2', { finalCents: 0, regularCents: 0, discountCents: 0, discountPercent: 0, gymPercent: 0, stripeEligible: false })]);
    mocks.quote.mockResolvedValue(quoteOf([lessonQuote('s2', { finalCents: 0, regularCents: 0, discountCents: 0, discountPercent: 0, gymPercent: 0, stripeEligible: false })]));
    renderBooking({ course: course({ lessonPriceCents: 0, seriesPriceCents: null }), checkoutEnabled: true });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    const review = await screen.findByRole('region', { name: 'courses.review' });
    expect(within(review).getByTestId('review-final')).toHaveTextContent('courses.free');
    expect(within(review).queryByText('courses.direct')).not.toBeInTheDocument();
    expect(within(review).queryByText('courses.online')).not.toBeInTheDocument();
    fireEvent.click(within(review).getByRole('button', { name: 'courses.confirm' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('enrollInCourse', expect.objectContaining({ paymentMode: 'direct', expectedFinalCents: 0 })));
  });

  it('offers online payment only when enabled, and sends direct when the price is below the Stripe minimum', async () => {
    const { unmount } = render(<CourseBooking course={course()} sessions={lessons()} checkoutEnabled={false} uid="u1" onBooked={vi.fn()} />);
    expect(screen.queryByText('courses.online')).not.toBeInTheDocument();
    unmount();
    mocks.quote.mockResolvedValue(quoteOf([lessonQuote('s2', { finalCents: 30, stripeEligible: false })]));
    renderBooking({ checkoutEnabled: true });
    expect(screen.getByText('courses.online')).toBeInTheDocument();
    expect(screen.queryByText(/escrow/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('courses.online'));
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    fireEvent.click(within(await screen.findByRole('region', { name: 'courses.review' })).getByRole('button', { name: 'courses.confirm' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('enrollInCourse', expect.objectContaining({ paymentMode: 'direct' })));
  });

  it('starts Stripe checkout after a stripe booking', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    mocks.call.mockResolvedValueOnce({ enrollmentId: 'e9' }).mockResolvedValueOnce({ url: 'https://pay.test/x' });
    renderBooking({ checkoutEnabled: true });
    fireEvent.click(screen.getByLabelText('courses.online'));
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    fireEvent.click(within(await screen.findByRole('region', { name: 'courses.review' })).getByRole('button', { name: 'courses.confirm' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.test/x'));
    expect(mocks.call).toHaveBeenNthCalledWith(1, 'enrollInCourse', expect.objectContaining({ paymentMode: 'stripe' }));
    expect(mocks.call).toHaveBeenNthCalledWith(2, 'createCourseCheckout', { enrollmentId: 'e9' });
    vi.unstubAllGlobals();
  });

  describe('waitlist', () => {
    const full = () => lessons({ occupied: 1, held: 1 });
    it('offers Join waitlist on a full lesson and joins with a fresh request id', async () => {
      mocks.join.mockResolvedValue({ success: true, position: 1, replay: false });
      renderBooking({ sessions: full() });
      fireEvent.click(screen.getByRole('button', { name: 'courses.joinWaitlist' }));
      await waitFor(() => expect(mocks.join).toHaveBeenCalledWith('c', 's1', 'direct', expect.any(String)));
      fireEvent.click(screen.getByRole('button', { name: 'courses.joinWaitlist' }));
      await waitFor(() => expect(mocks.join).toHaveBeenCalledTimes(2));
      expect(mocks.join.mock.calls[0][3]).not.toBe(mocks.join.mock.calls[1][3]);
    });

    it('hides it when the course has no waitlist or the lesson is inside the notice window, and disables it when already enrolled', () => {
      const { unmount } = render(<CourseBooking course={course({ waitlistEnabled: false })} sessions={full()} checkoutEnabled={false} uid="u1" onBooked={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'courses.joinWaitlist' })).not.toBeInTheDocument();
      unmount();
      const soon = lessons({ occupied: 1, held: 1, startsAt: stamp(new Date(Date.now() + 3600000).toISOString()) });
      const second = render(<CourseBooking course={course()} sessions={soon} checkoutEnabled={false} uid="u1" onBooked={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'courses.joinWaitlist' })).not.toBeInTheDocument();
      second.unmount();
      mocks.enrollments = [{ courseId: 'c', state: 'confirmed', activeSessionIds: ['s1'] }];
      renderBooking({ sessions: full() });
      expect(screen.getAllByRole('button', { name: 'courses.joinWaitlist' })[0]).toBeDisabled();
    });

    it('shows the position and Leave for an existing entry', async () => {
      mocks.mine = [{ courseId: 'c', sessionId: 's1', position: 3 }];
      mocks.leave.mockResolvedValue({ success: true });
      renderBooking({ sessions: full() });
      expect(screen.getByTestId('on-waitlist')).toHaveTextContent('"position":3');
      expect(screen.queryByRole('button', { name: 'courses.joinWaitlist' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'courses.leaveWaitlist' }));
      await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith('c', 's1'));
    });

    it('offers the waitlist when the confirm answers lesson_full with waitlistAvailable', async () => {
      mocks.call.mockRejectedValueOnce(rejection('lesson_full', { waitlistAvailable: true }));
      mocks.join.mockResolvedValue({ success: true, position: 1, replay: false });
      renderBooking();
      fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
      fireEvent.click(within(await screen.findByRole('region', { name: 'courses.review' })).getByRole('button', { name: 'courses.confirm' }));
      const join = await screen.findByRole('button', { name: 'courses.joinWaitlist' });
      expect(screen.getByText('courses.err.lesson_full')).toBeInTheDocument();
      fireEvent.click(join);
      await waitFor(() => expect(mocks.join).toHaveBeenCalledWith('c', 's2', 'direct', expect.any(String)));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'courses.review' })).not.toBeInTheDocument());
    });

    it('does not offer it when lesson_full says the waitlist is unavailable', async () => {
      mocks.call.mockRejectedValueOnce(rejection('lesson_full', { waitlistAvailable: false }));
      renderBooking();
      fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
      fireEvent.click(within(await screen.findByRole('region', { name: 'courses.review' })).getByRole('button', { name: 'courses.confirm' }));
      expect(await screen.findByText('courses.err.lesson_full')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'courses.joinWaitlist' })).not.toBeInTheDocument();
    });
  });

  it('opens the review of ?lesson= once the lessons are there', async () => {
    renderBooking({ initialSessionId: 's2' });
    await screen.findByRole('region', { name: 'courses.review' });
    expect(mocks.quote).toHaveBeenCalledTimes(1);
    expect(mocks.quote).toHaveBeenCalledWith('c', ['s2'], false);
  });

  it('opens a full ?lesson= with the waitlist offer instead of a confirm', async () => {
    mocks.quote.mockResolvedValue(quoteOf([lessonQuote('s1')]));
    mocks.join.mockResolvedValue({ success: true, position: 1, replay: false });
    renderBooking({ initialSessionId: 's1', sessions: lessons({ occupied: 2 }) });
    const review = await screen.findByRole('region', { name: 'courses.review' });
    expect(mocks.quote).toHaveBeenCalledWith('c', ['s1'], false);
    expect(within(review).getByRole('alert')).toHaveTextContent('courses.err.lesson_full');
    expect(within(review).getByRole('button', { name: 'courses.confirm' })).toBeDisabled();
    fireEvent.click(within(review).getByRole('button', { name: 'courses.joinWaitlist' }));
    await waitFor(() => expect(mocks.join).toHaveBeenCalledWith('c', 's1', 'direct', expect.any(String)));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'courses.review' })).not.toBeInTheDocument());
  });

  it('leaves a full ?lesson= alone when the course has no waitlist, or the user is already queued or booked', () => {
    renderBooking({ initialSessionId: 's1', sessions: lessons({ occupied: 2 }), course: course({ waitlistEnabled: false }) });
    expect(mocks.quote).not.toHaveBeenCalled();
    cleanup();
    mocks.mine = [{ courseId: 'c', sessionId: 's1', position: 1 }];
    renderBooking({ initialSessionId: 's1', sessions: lessons({ occupied: 2 }) });
    expect(mocks.quote).not.toHaveBeenCalled();
    cleanup();
    mocks.mine = []; mocks.enrollments = [{ courseId: 'c', state: 'confirmed', activeSessionIds: ['s2'] }];
    renderBooking({ initialSessionId: 's2' });
    expect(mocks.quote).not.toHaveBeenCalled();
  });

  it('marks a lesson the user already booked and does not offer it again', () => {
    mocks.enrollments = [{ courseId: 'c', state: 'confirmed', activeSessionIds: ['s1'] }];
    renderBooking();
    expect(screen.getByTestId('enrolled')).toHaveTextContent('courses.confirmed');
    expect(screen.getAllByRole('button', { name: /courses.bookLesson/ })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]).toBeEnabled();
  });

  it('sends a visitor to sign in instead of quoting', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderBooking({ uid: undefined });
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[0]);
    expect(assign).toHaveBeenCalledWith(`/auth/login?next=${encodeURIComponent('/courses/detail?id=c&lesson=s1')}`);
    expect(mocks.quote).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('keeps the lesson through sign-in for a visitor joining a waitlist', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderBooking({ uid: undefined, sessions: lessons({ occupied: 1, held: 1 }, { occupied: 1, held: 1 }) });
    fireEvent.click(screen.getAllByRole('button', { name: 'courses.joinWaitlist' })[1]);
    expect(assign).toHaveBeenLastCalledWith(`/auth/login?next=${encodeURIComponent('/courses/detail?id=c&lesson=s2')}`);
    vi.unstubAllGlobals();
  });

  it('reports a busy request to the host while the booking is in flight', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.call.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const onBusyChange = vi.fn();
    renderBooking({ onBusyChange });
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    fireEvent.click(within(await screen.findByRole('region', { name: 'courses.review' })).getByRole('button', { name: 'courses.confirm' }));
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
    finish({ enrollmentId: 'e1' });
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  });

  it('locks the payment choice while a review is open, so the request id stays tied to its mode', async () => {
    renderBooking({ checkoutEnabled: true });
    expect(screen.getByRole('radio', { name: 'courses.online' })).toBeEnabled();
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    await screen.findByRole('region', { name: 'courses.review' });
    expect(screen.getByRole('radio', { name: 'courses.online' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'courses.direct' })).toBeDisabled();
    fireEvent.click(within(reviewOf()).getByRole('button', { name: 'common.cancel' }));
    expect(screen.getByRole('radio', { name: 'courses.online' })).toBeEnabled();
  });

  it('moves focus to the review heading when it opens', async () => {
    renderBooking();
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    const review = await screen.findByRole('region', { name: 'courses.review' });
    expect(within(review).getByRole('heading', { name: 'courses.review' })).toHaveFocus();
  });

  it('gives a screen reader the words around a struck-through price', () => {
    renderBooking();
    const row = screen.getAllByRole('button', { name: /courses.bookLesson/ })[0];
    expect(within(row).getByText('courses.regularPrice', { exact: false })).toHaveClass('sr-only');
    expect(within(row).getByText('courses.finalPrice', { exact: false })).toHaveClass('sr-only');
  });

  it('refreshes the lists when joining or leaving a waitlist fails, so the screen shows the truth', async () => {
    mocks.join.mockRejectedValue(rejection('already_waitlisted'));
    renderBooking({ sessions: lessons({ occupied: 1, held: 1 }) });
    fireEvent.click(screen.getAllByRole('button', { name: 'courses.joinWaitlist' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.err.already_waitlisted');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    cleanup();
    mocks.refresh.mockClear();
    mocks.mine = [{ courseId: 'c', sessionId: 's1', position: 2 }];
    mocks.leave.mockRejectedValue(rejection('waitlist_not_open'));
    renderBooking({ sessions: lessons({ occupied: 1, held: 1 }) });
    fireEvent.click(screen.getByRole('button', { name: 'courses.leaveWaitlist' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.err.waitlist_not_open');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes the lesson list behind the sheet after price_changed, so it shows the new price too', async () => {
    mocks.call.mockRejectedValueOnce(rejection('price_changed', { reason: 'price' }));
    mocks.quote.mockResolvedValue(quoteOf([lessonQuote('s2')]));
    renderBooking();
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    fireEvent.click(within(await screen.findByRole('region', { name: 'courses.review' })).getByRole('button', { name: 'courses.confirm' }));
    await screen.findByText('courses.priceChanged');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('disables the series when any lesson is full', () => {
    renderBooking({ sessions: lessons({ occupied: 1, held: 1 }) });
    expect(screen.getByRole('button', { name: /courses.series/ })).toBeDisabled();
  });
});

describe('long courses', () => {
  const scheduled = (id: string, iso: string) => ({ id, startsAt: stamp(iso), state: 'scheduled', capacity: 2, occupied: 0, held: 0,
    location: 'Sala', instructor: 'Anna' }) as CourseSession;

  it('opens on the first lesson still ahead and filters the rest by month', () => {
    renderBooking({ sessions: [
      scheduled('old', '2020-09-10T17:00Z'), scheduled('oct', '2099-10-12T18:00Z'),
      scheduled('nov1', '2099-11-02T18:00Z'), scheduled('nov2', '2099-11-09T18:00Z')] });
    const month = screen.getByLabelText('courses.month') as HTMLSelectElement;
    expect(month.value).toBe('2099-10');
    expect(screen.getAllByRole('button', { name: /courses.bookLesson/ })).toHaveLength(1);
    const november = [...month.options].find(option => /November 2099/.test(option.textContent ?? ''))!;
    fireEvent.change(month, { target: { value: november.value } });
    expect(screen.getAllByRole('button', { name: /courses.bookLesson/ })).toHaveLength(2);
    fireEvent.change(month, { target: { value: '' } });
    expect(screen.getAllByRole('button', { name: /courses.bookLesson/ })).toHaveLength(4);
    expect(screen.getByRole('option', { name: 'courses.allMonths' })).toBeInTheDocument();
  });

  it('opens the month of the linked lesson, so a timetable link is visible', () => {
    renderBooking({ initialSessionId: 'nov1', sessions: [
      scheduled('oct', '2099-10-12T18:00Z'), scheduled('nov1', '2099-11-02T18:00Z')] });
    expect((screen.getByLabelText('courses.month') as HTMLSelectElement).value).toBe('2099-11');
    expect(screen.getAllByRole('button', { name: /courses.bookLesson/ })).toHaveLength(1);
  });

  it('pages through a long month instead of listing every lesson at once', () => {
    const sessions = Array.from({ length: 12 }, (_, index) =>
      scheduled(`m${index}`, `2099-10-${String(index + 1).padStart(2, '0')}T18:00Z`));
    renderBooking({ sessions });
    expect(screen.getAllByRole('button', { name: /courses.bookLesson/ })).toHaveLength(10);
    expect(screen.getByTestId('lessons-shown')).toHaveTextContent('courses.lessonsShown:{"from":1,"to":10,"total":12}');
    expect(screen.getByTestId('lesson-page')).toHaveTextContent('courses.pageOf:{"page":1,"pages":2}');
    fireEvent.click(screen.getByRole('button', { name: 'courses.nextPage' }));
    expect(screen.getAllByRole('button', { name: /courses.bookLesson/ })).toHaveLength(2);
    expect(screen.getByTestId('lessons-shown')).toHaveTextContent('courses.lessonsShown:{"from":11,"to":12,"total":12}');
  });
});
